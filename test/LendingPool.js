const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RobinLend Protocol", function () {
  let owner;
  let Alice;
  let Bob;
  
  let kycRegistry;
  let rwaToken;
  let usdcToken;
  let priceOracle;
  let lendingPool;

  const INITIAL_PRICE = 100 * 1e8; // $100.00 (8 decimals)
  const Alice_MINT_AMOUNT = ethers.parseEther("1000"); // 1,000 RWA tokens
  const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 RWA tokens ($10,000 value)
  const LTV = 7000; // 70%

  beforeEach(async function () {
    [owner, Alice, Bob] = await ethers.getSigners();

    // 1. Deploy KYCRegistry
    const KYCRegistry = await ethers.getContractFactory("KYCRegistry");
    kycRegistry = await KYCRegistry.deploy();

    // 2. Deploy RWAToken
    const RWAToken = await ethers.getContractFactory("RWAToken");
    rwaToken = await RWAToken.deploy("Tokenized US Treasury", "iUST", await kycRegistry.getAddress());

    // 3. Deploy USDCToken
    const USDCToken = await ethers.getContractFactory("USDCToken");
    usdcToken = await USDCToken.deploy();

    // 4. Deploy PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();

    // 5. Deploy LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(
      await kycRegistry.getAddress(),
      await priceOracle.getAddress(),
      await usdcToken.getAddress()
    );

    // Setup: Support the RWA token with 70% LTV
    await lendingPool.configureCollateral(await rwaToken.getAddress(), LTV);

    // Setup: Set Price of RWA token in Oracle
    await priceOracle.setAssetPrice(await rwaToken.getAddress(), INITIAL_PRICE);

    // Setup: Verify LendingPool address in KYC registry to allow holding RWA collateral
    await kycRegistry.setKYCStatus(await lendingPool.getAddress(), true);
  });

  describe("Compliance (KYC Registry & RWAToken)", function () {
    it("Should allow self-service KYC registration", async function () {
      expect(await kycRegistry.isVerified(Alice.address)).to.be.false;
      await kycRegistry.connect(Alice).register();
      expect(await kycRegistry.isVerified(Alice.address)).to.be.true;
    });

    it("Should allow claiming RWA faucet only for KYC verified addresses", async function () {
      // Un-verified Alice claims faucet (should revert)
      await expect(
        rwaToken.connect(Alice).faucet(ethers.parseEther("50"))
      ).to.be.revertedWith("RWAToken: account is not KYC verified");

      // Verify Alice via self-register
      await kycRegistry.connect(Alice).register();

      // Alice claims faucet
      await rwaToken.connect(Alice).faucet(ethers.parseEther("50"));
      expect(await rwaToken.balanceOf(Alice.address)).to.equal(ethers.parseEther("50"));

      // Try claiming over faucet limit (reverts)
      await expect(
        rwaToken.connect(Alice).faucet(ethers.parseEther("1001"))
      ).to.be.revertedWith("RWAToken: faucet limit exceeded");
    });

    it("Should restrict minting to KYC verified addresses", async function () {
      // Un-verified Alice
      await expect(
        rwaToken.mint(Alice.address, Alice_MINT_AMOUNT)
      ).to.be.revertedWith("RWAToken: account is not KYC verified");

      // Verify Alice
      await kycRegistry.setKYCStatus(Alice.address, true);
      await rwaToken.mint(Alice.address, Alice_MINT_AMOUNT);
      
      expect(await rwaToken.balanceOf(Alice.address)).to.equal(Alice_MINT_AMOUNT);
    });

    it("Should restrict transfers to KYC verified addresses", async function () {
      await kycRegistry.setKYCStatus(Alice.address, true);
      await rwaToken.mint(Alice.address, Alice_MINT_AMOUNT);

      // Try sending to un-verified Bob
      await expect(
        rwaToken.connect(Alice).transfer(Bob.address, ethers.parseEther("10"))
      ).to.be.revertedWith("RWAToken: account is not KYC verified");

      // Verify Bob
      await kycRegistry.setKYCStatus(Bob.address, true);
      await rwaToken.connect(Alice).transfer(Bob.address, ethers.parseEther("10"));

      expect(await rwaToken.balanceOf(Bob.address)).to.equal(ethers.parseEther("10"));
    });
  });

  describe("LendingPool Operations", function () {
    beforeEach(async function () {
      // Verify Alice and mint tokens
      await kycRegistry.setKYCStatus(Alice.address, true);
      await rwaToken.mint(Alice.address, Alice_MINT_AMOUNT);

      // Verify Bob (liquidator) and fund him with USDC
      await kycRegistry.setKYCStatus(Bob.address, true);
      // Transfer USDC to pool so it can lend
      await usdcToken.connect(owner).transfer(await lendingPool.getAddress(), ethers.parseEther("50000"));
    });

    it("Should allow depositing RWA collateral", async function () {
      await rwaToken.connect(Alice).approve(await lendingPool.getAddress(), DEPOSIT_AMOUNT);
      await lendingPool.connect(Alice).depositCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);

      expect(await lendingPool.getUserCollateral(Alice.address, await rwaToken.getAddress())).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should allow borrowing stablecoin up to LTV", async function () {
      await rwaToken.connect(Alice).approve(await lendingPool.getAddress(), DEPOSIT_AMOUNT);
      await lendingPool.connect(Alice).depositCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);

      // Collateral = 100 RWA * $100 = $10,000 value
      // Capacity = $10,000 * 70% = $7,000
      const [totalCollateral, totalBorrowed, borrowCapacity, health] = await lendingPool.getAccountData(Alice.address);
      expect(totalCollateral).to.equal(ethers.parseEther("10000")); // 10000 USD
      expect(borrowCapacity).to.equal(ethers.parseEther("7000")); // 7000 USD
      expect(totalBorrowed).to.equal(0);

      // Borrow $5,000 (USDC)
      await lendingPool.connect(Alice).borrow(ethers.parseEther("5000"));
      expect(await usdcToken.balanceOf(Alice.address)).to.equal(ethers.parseEther("5000"));
      expect(await lendingPool.getUserBorrowed(Alice.address)).to.equal(ethers.parseEther("5000"));

      // Try borrowing beyond limit ($2,100 additional, total $7,100 > $7,000 capacity)
      await expect(
        lendingPool.connect(Alice).borrow(ethers.parseEther("2100"))
      ).to.be.revertedWith("LendingPool: exceeds borrow capacity");
    });

    it("Should restrict collateral withdrawal if health factor falls below 1", async function () {
      await rwaToken.connect(Alice).approve(await lendingPool.getAddress(), DEPOSIT_AMOUNT);
      await lendingPool.connect(Alice).depositCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);

      // Borrow maximum capacity ($7,000)
      await lendingPool.connect(Alice).borrow(ethers.parseEther("7000"));

      // Attempt to withdraw collateral (reverts because health factor goes below 1)
      await expect(
        lendingPool.connect(Alice).withdrawCollateral(await rwaToken.getAddress(), ethers.parseEther("10"))
      ).to.be.revertedWith("LendingPool: health factor too low after withdrawal");
    });

    it("Should allow repayment and then withdrawal", async function () {
      await rwaToken.connect(Alice).approve(await lendingPool.getAddress(), DEPOSIT_AMOUNT);
      await lendingPool.connect(Alice).depositCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);

      await lendingPool.connect(Alice).borrow(ethers.parseEther("5000"));

      // Repay borrow
      await usdcToken.connect(Alice).approve(await lendingPool.getAddress(), ethers.parseEther("5000"));
      await lendingPool.connect(Alice).repay(ethers.parseEther("5000"));

      expect(await lendingPool.getUserBorrowed(Alice.address)).to.equal(0);

      // Withdraw collateral successfully
      await lendingPool.connect(Alice).withdrawCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);
      expect(await lendingPool.getUserCollateral(Alice.address, await rwaToken.getAddress())).to.equal(0);
    });

    it("Should support liquidation of unhealthy loans", async function () {
      await rwaToken.connect(Alice).approve(await lendingPool.getAddress(), DEPOSIT_AMOUNT);
      await lendingPool.connect(Alice).depositCollateral(await rwaToken.getAddress(), DEPOSIT_AMOUNT);

      // Borrow $7,000
      await lendingPool.connect(Alice).borrow(ethers.parseEther("7000"));

      // Simulate a price drop: price drop of RWA from $100 to $70 (value drop from $10,000 to $7,000)
      // New capacity = $7000 * 70% = $4,900. Health factor = 4900 / 7000 = 0.7 (liquidatable)
      await priceOracle.setAssetPrice(await rwaToken.getAddress(), 70 * 1e8); // $70.00

      // Liquidator (Bob) repays Alice's borrow
      // Bob needs to approve USDC for pool
      await usdcToken.faucet(Bob.address, ethers.parseEther("7000"));
      await usdcToken.connect(Bob).approve(await lendingPool.getAddress(), ethers.parseEther("7000"));

      // Liquidate Alice's position (liquidate $7,000 borrow)
      // Bob will receive collateral at 5% discount
      // $7,000 borrow repaid -> receives: $7,000 * 1.05 = $7,350 value of RWA
      // At $70/token, RWA received = 7350 / 70 = 105 RWA tokens
      // Wait, Alice only deposited 100 RWA, so the liquidator can liquidate max $6,666.66 debt (recovering Alice's full 100 RWA)
      // Let's liquidate $5,000 of debt
      // $5,000 * 1.05 = $5,250 RWA value. At $70/token, RWA = 5250 / 70 = 75 RWA tokens.
      await lendingPool.connect(Bob).liquidate(Alice.address, await rwaToken.getAddress(), ethers.parseEther("5000"));

      expect(await lendingPool.getUserBorrowed(Alice.address)).to.equal(ethers.parseEther("2000")); // 7000 - 5000
      expect(await lendingPool.getUserCollateral(Alice.address, await rwaToken.getAddress())).to.equal(ethers.parseEther("25")); // 100 - 75
      expect(await rwaToken.balanceOf(Bob.address)).to.equal(ethers.parseEther("75")); // Bob got 75 RWA
    });
  });
});
