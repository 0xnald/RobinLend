const { ethers } = require("ethers");

// Deployed contract config
const RPC_URL = "https://rpc.testnet.chain.robinhood.com";
const LENDING_POOL_ADDRESS = "0x3144E80709Fc66c8f8850b7b24F470a1b85B960d";

// Minimum ABI needed to parse Deposit events
const abi = [
  "event Deposit(address indexed user, address indexed token, uint256 amount)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(LENDING_POOL_ADDRESS, abi, provider);

  console.log("Fetching Deposit events from the blockchain...");
  
  try {
    // Query all Deposit events from the genesis block to latest
    const filter = contract.filters.Deposit();
    const events = await contract.queryFilter(filter, 0, "latest");

    const uniqueDepositors = new Set();
    
    events.forEach(event => {
      const depositor = event.args.user;
      uniqueDepositors.add(depositor);
    });

    console.log("\n=========================================");
    console.log(`Total Deposit Events Found: ${events.length}`);
    console.log(`Unique Depositors Count:    ${uniqueDepositors.size}`);
    console.log("=========================================");
    console.log("\nList of Unique Depositor Addresses:");
    Array.from(uniqueDepositors).forEach((addr, i) => {
      console.log(`${i + 1}. ${addr}`);
    });

  } catch (error) {
    console.error("Error fetching logs:", error);
  }
}

main();
