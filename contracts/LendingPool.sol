// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./KYCRegistry.sol";
import "./PriceOracle.sol";

/**
 * @title LendingPool
 * @dev A compliance-gated lending pool for borrowing stablecoins against tokenized RWA collateral.
 */
contract LendingPool {
    address public owner;
    
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
    // user => borrowedAmount (USDC)
    mapping(address => uint256) private _userBorrows;

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
        address _usdcToken
    ) {
        owner = msg.sender;
        kycRegistry = KYCRegistry(_kycRegistry);
        priceOracle = PriceOracle(_priceOracle);
        usdcToken = IERC20(_usdcToken);
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
        if (_userBorrows[msg.sender] > 0) {
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

        (,, uint256 capacity, ) = getAccountData(msg.sender);
        uint256 currentBorrow = _userBorrows[msg.sender];
        require(currentBorrow + amount <= capacity, "LendingPool: exceeds borrow capacity");

        _userBorrows[msg.sender] += amount;

        bool success = usdcToken.transfer(msg.sender, amount);
        require(success, "LendingPool: transfer failed");

        emit Borrow(msg.sender, amount);
    }

    /**
     * @dev Repays borrowed stablecoin.
     */
    function repay(uint256 amount) external onlyKYC(msg.sender) {
        require(amount > 0, "LendingPool: repay amount must be > 0");
        uint256 borrowed = _userBorrows[msg.sender];
        require(borrowed >= amount, "LendingPool: repayment exceeds borrowed amount");

        _userBorrows[msg.sender] -= amount;

        bool success = usdcToken.transferFrom(msg.sender, address(this), amount);
        require(success, "LendingPool: transferFrom failed");

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

        totalBorrowedUSD = _userBorrows[user]; // USDC value in USD is 1:1, assuming both have 18 decimals

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
     * @dev Returns user borrowed amount.
     */
    function getUserBorrowed(address user) external view returns (uint256) {
        return _userBorrows[user];
    }

    /**
     * @dev Liquidation mechanism for unhealthy loans.
     */
    function liquidate(address user, address collateralToken, uint256 amountToLiquidate) external onlyKYC(msg.sender) {
        (,, uint256 capacity, uint256 healthFactor) = getAccountData(user);
        require(healthFactor < 1e18, "LendingPool: account is healthy");
        
        uint256 debt = _userBorrows[user];
        require(amountToLiquidate > 0 && amountToLiquidate <= debt, "LendingPool: invalid liquidation amount");

        // Calculate RWA collateral value to transfer to liquidator
        // To reward the liquidator, we offer a 5% discount on the collateral asset
        // collateralToLiquidate = amountToLiquidate * priceOfUSDC * 1.05 / priceOfCollateral
        uint256 collateralPrice = priceOracle.getAssetPrice(collateralToken);
        uint256 collateralToLiquidate = (amountToLiquidate * 1e8 * 105) / (collateralPrice * 100);

        uint256 userCollateralBal = _userCollateral[user][collateralToken];
        require(collateralToLiquidate <= userCollateralBal, "LendingPool: insufficient collateral to liquidate");

        // Update positions
        _userCollateral[user][collateralToken] -= collateralToLiquidate;
        _userBorrows[user] -= amountToLiquidate;

        // Perform transfers
        // Transfer USDC from liquidator to pool
        bool successUSDC = usdcToken.transferFrom(msg.sender, address(this), amountToLiquidate);
        require(successUSDC, "LendingPool: usdc transferFrom failed");

        // Transfer collateral RWA from pool to liquidator
        bool successCollateral = IERC20(collateralToken).transfer(msg.sender, collateralToLiquidate);
        require(successCollateral, "LendingPool: collateral transfer failed");

        emit Liquidation(user, msg.sender, amountToLiquidate, collateralToken, collateralToLiquidate);
    }
}
