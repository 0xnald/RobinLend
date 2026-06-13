// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./KYCRegistry.sol";
import "./PriceOracle.sol";

/**
 * @title LendingPool
 * @dev A compliance-gated lending pool for borrowing stablecoins against tokenized RWA collateral.
 * Supports a dynamic 6.12% APY time-based stability fee (interest) and liquidation protocol fees.
 */
contract LendingPool {
    address public owner;
    address public treasury;
    
    // 6.12% APY = 612 BPS (2 decimals)
    uint256 public constant BORROW_RATE_BPS = 612;

    KYCRegistry public kycRegistry;
    PriceOracle public priceOracle;
    IERC20 public usdcToken;

    // Collateral configurations
    struct CollateralConfig {
        bool isSupported;
        uint256 ltv; // Loan-to-value ratio, 2 decimals (e.g. 7000 for 70%)
    }

    mapping(address => CollateralConfig) public collateralTokens;
    address[] public supportedCollaterals;

    // User positions
    // user => token => collateralBalance
    mapping(address => mapping(address => uint256)) private _userCollateral;
    // user => borrowedAmount (USDC principal)
    mapping(address => uint256) private _userBorrows;
    // user => accumulatedInterest (USDC interest accrued and written)
    mapping(address => uint256) private _userInterest;
    // user => timestamp of last borrow, repay, or accrue action
    mapping(address => uint256) public userBorrowTimestamp;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event Borrow(address indexed user, uint256 amount);
    event Repay(address indexed user, uint256 amount);
    event Liquidation(address indexed user, address indexed liquidator, uint256 amountRepaid, address indexed collateralToken, uint256 collateralLiquidated);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "LendingPool: caller is not the owner");
        _;
    }

    modifier onlyKYC(address account) {
        require(kycRegistry.isVerified(account), "LendingPool: caller is not KYC verified");
        _;
    }

    constructor(
        address _kycRegistry,
        address _priceOracle,
        address _usdcToken,
        address _treasury
    ) {
        owner = msg.sender;
        kycRegistry = KYCRegistry(_kycRegistry);
        priceOracle = PriceOracle(_priceOracle);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
    }

    /**
     * @dev Configures a collateral token with LTV.
     */
     function configureCollateral(address token, uint256 ltv) external onlyOwner {
        require(token != address(0), "LendingPool: invalid token");
        require(ltv > 0 && ltv < 10000, "LendingPool: LTV must be between 1 and 9999");
        
        if (!collateralTokens[token].isSupported) {
            supportedCollaterals.push(token);
            collateralTokens[token].isSupported = true;
        }
        collateralTokens[token].ltv = ltv;
    }

    /**
     * @dev Calculates the pending interest accrued since userBorrowTimestamp.
     */
    function calculateInterest(address user) public view returns (uint256) {
        uint256 principal = _userBorrows[user];
        if (principal == 0 || userBorrowTimestamp[user] == 0) {
            return 0;
        }
        uint256 timeElapsed = block.timestamp - userBorrowTimestamp[user];
        if (timeElapsed == 0) {
            return 0;
        }
        // interest = principal * BORROW_RATE_BPS * timeElapsed / (365 days * 10000)
        return (principal * BORROW_RATE_BPS * timeElapsed) / (365 days * 10000);
    }

    /**
     * @dev Accrues outstanding pending interest into _userInterest.
     */
    function _accrueInterest(address user) internal {
        uint256 interest = calculateInterest(user);
        if (interest > 0) {
            _userInterest[user] += interest;
        }
        userBorrowTimestamp[user] = block.timestamp;
    }

    /**
     * @dev Deposits RWA tokens as collateral.
     */
    function depositCollateral(address token, uint256 amount) external onlyKYC(msg.sender) {
        require(collateralTokens[token].isSupported, "LendingPool: unsupported collateral");
        require(amount > 0, "LendingPool: deposit amount must be > 0");

        _userCollateral[msg.sender][token] += amount;
        
        // Transfer RWA from user to pool
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "LendingPool: transferFrom failed");

        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @dev Withdraws RWA collateral.
     */
    function withdrawCollateral(address token, uint256 amount) external onlyKYC(msg.sender) {
        require(amount > 0, "LendingPool: withdraw amount must be > 0");
        require(_userCollateral[msg.sender][token] >= amount, "LendingPool: insufficient collateral balance");

        _userCollateral[msg.sender][token] -= amount;

        // Verify account health remains positive after withdrawal
        (,, uint256 capacity, uint256 healthFactor) = getAccountData(msg.sender);
        uint256 totalDebt = _userBorrows[msg.sender] + _userInterest[msg.sender] + calculateInterest(msg.sender);
        if (totalDebt > 0) {
            require(healthFactor >= 1e18, "LendingPool: health factor too low after withdrawal");
        }

        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "LendingPool: transfer failed");

        emit Withdraw(msg.sender, token, amount);
    }

    /**
     * @dev Borrows stablecoin (USDC) against RWA collateral.
     */
    function borrow(uint256 amount) external onlyKYC(msg.sender) {
        require(amount > 0, "LendingPool: borrow amount must be > 0");

        // 1. Accrue pending interest first
        _accrueInterest(msg.sender);

        // 2. Validate borrow capacity against total current debt
        (,, uint256 capacity, ) = getAccountData(msg.sender);
        uint256 totalDebt = _userBorrows[msg.sender] + _userInterest[msg.sender];
        require(totalDebt + amount <= capacity, "LendingPool: exceeds borrow capacity");

        // 3. Update position
        _userBorrows[msg.sender] += amount;

        // 4. Transfer USDC
        bool success = usdcToken.transfer(msg.sender, amount);
        require(success, "LendingPool: transfer failed");

        emit Borrow(msg.sender, amount);
    }

    /**
     * @dev Repays borrowed stablecoin with automated treasury interest split.
     */
    function repay(uint256 amount) external onlyKYC(msg.sender) {
        require(amount > 0, "LendingPool: repay amount must be > 0");
        
        // 1. Accrue interest first
        _accrueInterest(msg.sender);

        uint256 interestDebt = _userInterest[msg.sender];
        uint256 principalDebt = _userBorrows[msg.sender];
        uint256 totalDebt = interestDebt + principalDebt;
        require(totalDebt >= amount, "LendingPool: repayment exceeds total debt");

        uint256 interestPaid = 0;
        uint256 principalPaid = 0;

        if (amount <= interestDebt) {
            // Paying only interest
            interestPaid = amount;
            _userInterest[msg.sender] -= interestPaid;
        } else {
            // Paying all interest and part/all of principal
            interestPaid = interestDebt;
            principalPaid = amount - interestPaid;
            _userInterest[msg.sender] = 0;
            _userBorrows[msg.sender] -= principalPaid;
        }

        // 2. Perform transfers (interest goes to treasury, principal remains in pool)
        if (interestPaid > 0) {
            bool successTreasury = usdcToken.transferFrom(msg.sender, treasury, interestPaid);
            require(successTreasury, "LendingPool: interest transferFrom failed");
        }
        if (principalPaid > 0) {
            bool successPool = usdcToken.transferFrom(msg.sender, address(this), principalPaid);
            require(successPool, "LendingPool: principal transferFrom failed");
        }

        emit Repay(msg.sender, amount);
    }

    /**
     * @dev Computes user collateral values, borrow limits, and health factor.
     */
    function getAccountData(address user) public view returns (
        uint256 totalCollateralUSD,
        uint256 totalBorrowedUSD,
        uint256 borrowCapacityUSD,
        uint256 healthFactor
    ) {
        for (uint256 i = 0; i < supportedCollaterals.length; i++) {
            address token = supportedCollaterals[i];
            uint256 balance = _userCollateral[user][token];
            if (balance > 0) {
                // Get price from Oracle (8 decimals)
                uint256 price = priceOracle.getAssetPrice(token);
                // Value = balance * price / 1e8 (assuming token has 18 decimals)
                uint256 valueUSD = (balance * price) / 1e8;
                totalCollateralUSD += valueUSD;
                
                // Capacity = Value * LTV / 10000
                uint256 ltv = collateralTokens[token].ltv;
                borrowCapacityUSD += (valueUSD * ltv) / 10000;
            }
        }

        // Include pending interest in current debt calculation
        uint256 pendingInterest = calculateInterest(user);
        totalBorrowedUSD = _userBorrows[user] + _userInterest[user] + pendingInterest;

        if (totalBorrowedUSD == 0) {
            healthFactor = type(uint256).max;
        } else {
            healthFactor = (borrowCapacityUSD * 1e18) / totalBorrowedUSD;
        }
    }

    /**
     * @dev Returns user collateral balance for a specific token.
     */
    function getUserCollateral(address user, address token) external view returns (uint256) {
        return _userCollateral[user][token];
    }

    /**
     * @dev Returns user total borrowed debt (principal + interest).
     */
    function getUserBorrowed(address user) external view returns (uint256) {
        return _userBorrows[user] + _userInterest[user] + calculateInterest(user);
    }

    /**
     * @dev Returns user accumulated interest debt only.
     */
    function getUserInterest(address user) external view returns (uint256) {
        return _userInterest[user] + calculateInterest(user);
    }

    /**
     * @dev Liquidation mechanism for undercollateralized loans.
     * Routes 5% discount collateral to liquidator, and 2% fee to treasury.
     */
    function liquidate(address user, address collateralToken, uint256 amountToLiquidate) external onlyKYC(msg.sender) {
        // 1. Accrue interest first for the user being liquidated
        _accrueInterest(user);
        
        // 2. Validate user health
        (,, uint256 capacity, uint256 healthFactor) = getAccountData(user);
        require(healthFactor < 1e18, "LendingPool: account is healthy");
        
        uint256 interestDebt = _userInterest[user];
        uint256 principalDebt = _userBorrows[user];
        uint256 totalDebt = interestDebt + principalDebt;
        require(amountToLiquidate > 0 && amountToLiquidate <= totalDebt, "LendingPool: invalid liquidation amount");

        // 3. Calculate collateral to liquidate
        uint256 collateralPrice = priceOracle.getAssetPrice(collateralToken);
        
        // collateralToLiquidate (5% bonus to liquidator):
        // collateralToLiquidate = amountToLiquidate * 1.05 / priceOfCollateral
        uint256 collateralToLiquidate = (amountToLiquidate * 1e8 * 105) / (collateralPrice * 100);
        
        // collateralToTreasury (2% fee to treasury):
        // collateralToTreasury = amountToLiquidate * 0.02 / priceOfCollateral
        uint256 collateralToTreasury = (amountToLiquidate * 1e8 * 2) / (collateralPrice * 100);
        
        uint256 totalCollateralNeeded = collateralToLiquidate + collateralToTreasury;
        uint256 userCollateralBal = _userCollateral[user][collateralToken];
        require(totalCollateralNeeded <= userCollateralBal, "LendingPool: insufficient collateral to liquidate");

        // 4. Update debt positions (splitting repayment between interest and principal)
        uint256 interestPaid = 0;
        uint256 principalPaid = 0;

        if (amountToLiquidate <= interestDebt) {
            interestPaid = amountToLiquidate;
            _userInterest[user] -= interestPaid;
        } else {
            interestPaid = interestDebt;
            principalPaid = amountToLiquidate - interestPaid;
            _userInterest[user] = 0;
            _userBorrows[user] -= principalPaid;
        }

        // Update collateral positions
        _userCollateral[user][collateralToken] -= totalCollateralNeeded;

        // 5. Perform transfers
        // Liquidator pays amountToLiquidate USDC.
        // Split: interestPaid goes to treasury, principalPaid goes to pool.
        if (interestPaid > 0) {
            bool successTreasury = usdcToken.transferFrom(msg.sender, treasury, interestPaid);
            require(successTreasury, "LendingPool: liquidation interest transferFrom failed");
        }
        if (principalPaid > 0) {
            bool successPool = usdcToken.transferFrom(msg.sender, address(this), amountToLiquidate - interestPaid);
            require(successPool, "LendingPool: liquidation principal transferFrom failed");
        }

        // Transfer collateral RWA from pool to liquidator (5% discount portion)
        bool successCollateral = IERC20(collateralToken).transfer(msg.sender, collateralToLiquidate);
        require(successCollateral, "LendingPool: collateral transfer to liquidator failed");

        // Transfer collateral RWA from pool to treasury (2% protocol fee portion)
        bool successTreasuryCollateral = IERC20(collateralToken).transfer(treasury, collateralToTreasury);
        require(successTreasuryCollateral, "LendingPool: collateral transfer to treasury failed");

        emit Liquidation(user, msg.sender, amountToLiquidate, collateralToken, collateralToLiquidate);
    }
}
