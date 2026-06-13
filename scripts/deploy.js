const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("Deploying RobinLend Protocol with address:", deployer.address);
  console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("=================================================");

  // Official Robinhood Chain Testnet Asset Addresses
  const rwaTokens = {
    TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d"
  };

  const faucetAddress = "0x8762f93772c663c6a88ba50900bd5381df2717be";

  // 1. Deploy KYCRegistry
  console.log("Deploying KYCRegistry...");
  const KYCRegistry = await hre.ethers.getContractFactory("KYCRegistry");
  const kycRegistry = await KYCRegistry.deploy();
  await kycRegistry.waitForDeployment();
  const kycRegistryAddress = await kycRegistry.getAddress();
  console.log("KYCRegistry deployed to:", kycRegistryAddress);

  // 2. Deploy USDCToken (Mock USDC)
  console.log("Deploying USDCToken (Mock USDC)...");
  const USDCToken = await hre.ethers.getContractFactory("USDCToken");
  const usdcToken = await USDCToken.deploy();
  await usdcToken.waitForDeployment();
  const usdcTokenAddress = await usdcToken.getAddress();
  console.log("USDCToken deployed to:", usdcTokenAddress);

  // 3. Deploy PriceOracle
  console.log("Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("PriceOracle deployed to:", priceOracleAddress);

  // 4. Deploy LendingPool
  console.log("Deploying LendingPool...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(kycRegistryAddress, priceOracleAddress, usdcTokenAddress);
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("LendingPool deployed to:", lendingPoolAddress);

  // ================= Setup Configurations =================
  console.log("Configuring LendingPool with Official Stock Tokens...");

  // Configure LTV ratios for stock assets:
  // TSLA: 70%, AMZN: 75%, PLTR: 65%, NFLX: 70%, AMD: 70%
  const ltvs = {
    TSLA: 7000,
    AMZN: 7500,
    PLTR: 6500,
    NFLX: 7000,
    AMD: 7000
  };

  // Configure stock prices in PriceOracle (USD with 8 decimals):
  // TSLA: $180.00, AMZN: $185.00, PLTR: $21.00, NFLX: $600.00, AMD: $160.00
  const prices = {
    TSLA: 180 * 1e8,
    AMZN: 185 * 1e8,
    PLTR: 21 * 1e8,
    NFLX: 600 * 1e8,
    AMD: 160 * 1e8
  };

  // Loop through and configure each asset on-chain
  for (const symbol in rwaTokens) {
    const tokenAddr = rwaTokens[symbol];
    
    // Support asset as collateral
    const txLtv = await lendingPool.configureCollateral(tokenAddr, ltvs[symbol]);
    await txLtv.wait();
    console.log(`Configured ${symbol} Collateral with ${ltvs[symbol] / 100}% LTV`);

    // Set asset price in oracle
    const txPrice = await priceOracle.setAssetPrice(tokenAddr, prices[symbol]);
    await txPrice.wait();
    console.log(`Set Oracle Price for ${symbol} to $${prices[symbol] / 1e8}.00`);
  }

  // Set Price of USDC to $1.00 (8 decimals) in Oracle
  const txUSDCPrice = await priceOracle.setAssetPrice(usdcTokenAddress, 1 * 1e8);
  await txUSDCPrice.wait();
  console.log("Price of USDC set to $1.00");

  // Verify deployer in KYC registry
  const txKYC = await kycRegistry.setKYCStatus(deployer.address, true);
  await txKYC.wait();
  console.log("Deployer address verified in KYCRegistry");

  // Transfer USDC to LendingPool from initial supply to fund borrow liquidity
  const poolUSDCFunding = hre.ethers.parseEther("1000000"); // 1,000,000 USDC
  const txFund = await usdcToken.transfer(lendingPoolAddress, poolUSDCFunding);
  await txFund.wait();
  console.log("Funded LendingPool with 1,000,000 USDC borrow liquidity");

  console.log("=================================================");
  console.log("Deployment and Setup Complete!");
  console.log("Summary of Deployed Contracts:");
  console.log("-------------------------------------------------");
  console.log(`KYCRegistry:  ${kycRegistryAddress}`);
  console.log(`USDCToken:    ${usdcTokenAddress}`);
  console.log(`PriceOracle:  ${priceOracleAddress}`);
  console.log(`LendingPool:  ${lendingPoolAddress}`);
  console.log("=================================================");

  // Write config file to frontend src
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "../frontend/src/config.json");
  const config = {
    kycRegistry: kycRegistryAddress,
    usdc: usdcTokenAddress,
    priceOracle: priceOracleAddress,
    lendingPool: lendingPoolAddress,
    faucet: faucetAddress,
    tokens: rwaTokens
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("Configuration written to:", configPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
