const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("Deploying RobinLend Protocol with address:", deployer.address);
  console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("=================================================");

  // 1. Deploy KYCRegistry
  console.log("Deploying KYCRegistry...");
  const KYCRegistry = await hre.ethers.getContractFactory("KYCRegistry");
  const kycRegistry = await KYCRegistry.deploy();
  await kycRegistry.waitForDeployment();
  const kycRegistryAddress = await kycRegistry.getAddress();
  console.log("KYCRegistry deployed to:", kycRegistryAddress);

  // 2. Deploy RWAToken
  console.log("Deploying RWAToken (iUST)...");
  const RWAToken = await hre.ethers.getContractFactory("RWAToken");
  const rwaToken = await RWAToken.deploy("Tokenized US Treasury", "iUST", kycRegistryAddress);
  await rwaToken.waitForDeployment();
  const rwaTokenAddress = await rwaToken.getAddress();
  console.log("RWAToken deployed to:", rwaTokenAddress);

  // 3. Deploy USDCToken
  console.log("Deploying USDCToken (Mock USDC)...");
  const USDCToken = await hre.ethers.getContractFactory("USDCToken");
  const usdcToken = await USDCToken.deploy();
  await usdcToken.waitForDeployment();
  const usdcTokenAddress = await usdcToken.getAddress();
  console.log("USDCToken deployed to:", usdcTokenAddress);

  // 4. Deploy PriceOracle
  console.log("Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("PriceOracle deployed to:", priceOracleAddress);

  // 5. Deploy LendingPool
  console.log("Deploying LendingPool...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(kycRegistryAddress, priceOracleAddress, usdcTokenAddress);
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("LendingPool deployed to:", lendingPoolAddress);

  // ================= Setup Configurations =================
  console.log("Configuring LendingPool...");
  
  // Support iUST with 70% LTV (7000)
  const tx1 = await lendingPool.configureCollateral(rwaTokenAddress, 7000);
  await tx1.wait();
  console.log("iUST configured as collateral with 70% LTV");

  // Set Price of iUST to $100.00 (8 decimals) in Oracle
  const tx2 = await priceOracle.setAssetPrice(rwaTokenAddress, 100 * 1e8);
  await tx2.wait();
  console.log("Price of iUST set to $100.00");

  // Set Price of USDC to $1.00 (8 decimals) in Oracle
  const tx3 = await priceOracle.setAssetPrice(usdcTokenAddress, 1 * 1e8);
  await tx3.wait();
  console.log("Price of USDC set to $1.00");

  // Verify deployer in KYC registry so they can transact/mint for testing
  const tx4 = await kycRegistry.setKYCStatus(deployer.address, true);
  await tx4.wait();
  console.log("Deployer address verified in KYCRegistry");

  // Verify LendingPool in KYC registry so it can receive and hold RWA collateral
  const txLendingPoolVerify = await kycRegistry.setKYCStatus(lendingPoolAddress, true);
  await txLendingPoolVerify.wait();
  console.log("LendingPool address verified in KYCRegistry");

  // Mint some test RWA tokens to deployer
  const mintAmount = hre.ethers.parseEther("10000"); // 10,000 iUST
  const tx5 = await rwaToken.mint(deployer.address, mintAmount);
  await tx5.wait();
  console.log("Minted 10,000 iUST to deployer");

  // Transfer some test USDC to LendingPool from initial supply to fund borrow liquidity
  const poolUSDCFunding = hre.ethers.parseEther("1000000"); // 1,000,000 USDC
  const tx6 = await usdcToken.transfer(lendingPoolAddress, poolUSDCFunding);
  await tx6.wait();
  console.log("Funded LendingPool with 1,000,000 USDC borrow liquidity");

  console.log("=================================================");
  console.log("Deployment and Setup Complete!");
  console.log("Summary of Deployed Contracts:");
  console.log("-------------------------------------------------");
  console.log(`KYCRegistry:  ${kycRegistryAddress}`);
  console.log(`RWAToken:     ${rwaTokenAddress}`);
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
    iUST: rwaTokenAddress,
    usdc: usdcTokenAddress,
    priceOracle: priceOracleAddress,
    lendingPool: lendingPoolAddress
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
