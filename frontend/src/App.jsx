import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Coins, 
  ArrowRightLeft, 
  HelpCircle, 
  Terminal, 
  Cpu, 
  Wallet, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Settings,
  Sparkles
} from 'lucide-react';
import { ethers } from 'ethers';
import contractAddresses from './config.json';

// ABIs for real contract interactions
const kycRegistryABI = [
  "function isVerified(address user) view returns (bool)",
  "function register() external"
];
const rwaTokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const usdcTokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function faucet(address to, uint256 amount) external"
];
const lendingPoolABI = [
  "function getAccountData(address user) view returns (uint256 totalCollateralUSD, uint256 totalBorrowedUSD, uint256 borrowCapacityUSD, uint256 healthFactor)",
  "function depositCollateral(address token, uint256 amount) external",
  "function withdrawCollateral(address token, uint256 amount) external",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function getUserCollateral(address user, address token) view returns (uint256)",
  "function getUserBorrowed(address user) view returns (uint256)"
];
const priceOracleABI = [
  "function getAssetPrice(address asset) view returns (uint256)"
];
const faucetABI = [
  "function sendTokensAndEther(address recipient, uint256 tokenAmount) external"
];

const ROBINHOOD_CHAIN_ID = 46630;
const EXPLORER_URL = "https://explorer.testnet.chain.robinhood.com";
const usdcPrice = 1.00;

// Supported stock tokens and styling configuration
const STOCK_CONFIGS = {
  TSLA: { name: "Tesla Inc.", logoClass: "tsla-logo", color: "#E82127" },
  AMZN: { name: "Amazon.com Inc.", logoClass: "amzn-logo", color: "#FF9900" },
  PLTR: { name: "Palantir Technologies", logoClass: "pltr-logo", color: "#111111" },
  NFLX: { name: "Netflix Inc.", logoClass: "nflx-logo", color: "#E50914" },
  AMD: { name: "Advanced Micro Devices", logoClass: "amd-logo", color: "#000000" }
};

// Social Icons SVGs to ensure they render without package version mismatch
const TwitterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

export default function App() {
  // --- Navigation View State ---
  const [view, setView] = useState('landing'); // 'landing' | 'app' | 'docs'
  const [activeDocSection, setActiveDocSection] = useState('intro'); // 'intro' | 'kyc' | 'faucet' | 'ltv' | 'addresses'

  // --- Web3 Connection State ---
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [web3Loading, setWeb3Loading] = useState(false);

  // --- Live On-Chain Data State ---
  const [kycStatus, setKycStatus] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState("0.0");
  const [borrowedAmount, setBorrowedAmount] = useState("0.0");

  // Dynamic values per stock token
  const [walletBalances, setWalletBalances] = useState({});
  const [collateralBalances, setCollateralBalances] = useState({});
  const [tokenPrices, setTokenPrices] = useState({});

  // Account status aggregates from LendingPool
  const [totalCollateralUSD, setTotalCollateralUSD] = useState("0.0");
  const [totalBorrowedUSD, setTotalBorrowedUSD] = useState("0.0");
  const [borrowCapacityUSD, setBorrowCapacityUSD] = useState("0.0");
  const [healthFactor, setHealthFactor] = useState("9999.0");

  // Transaction state
  const [txLoading, setTxLoading] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([
    { type: 'info', text: 'RobinLend Live Monitor initialized.' },
    { type: 'info', text: 'Please connect MetaMask to Robinhood Chain Testnet to start.' }
  ]);
  const [activeStep, setActiveStep] = useState(null); // 'sign' | 'broadcast' | 'confirm'

  // Input states per stock token
  const [depositInputs, setDepositInputs] = useState({});
  const [withdrawInputs, setWithdrawInputs] = useState({});
  const [borrowVal, setBorrowVal] = useState("");
  const [repayVal, setRepayVal] = useState("");

  const addConsoleLog = (type, text) => {
    setConsoleLogs(prev => [...prev, { type, text, timestamp: new Date().toLocaleTimeString() }]);
  };

  // --- Fetch On-Chain Data ---
  const fetchOnChainData = useCallback(async (currentAccount, currentSigner, currentProvider) => {
    if (!currentAccount || !currentSigner || !currentProvider) return;
    
    try {
      // Create contract instances
      const kycContract = new ethers.Contract(contractAddresses.kycRegistry, kycRegistryABI, currentProvider);
      const usdcContract = new ethers.Contract(contractAddresses.usdc, usdcTokenABI, currentProvider);
      const poolContract = new ethers.Contract(contractAddresses.lendingPool, lendingPoolABI, currentProvider);
      const oracleContract = new ethers.Contract(contractAddresses.priceOracle, priceOracleABI, currentProvider);

      // 1. Fetch KYC Verification status
      const kycVerified = await kycContract.isVerified(currentAccount);
      setKycStatus(kycVerified);

      // 2. Fetch USDC Wallet Balance & borrowed amount
      const usdcBal = await usdcContract.balanceOf(currentAccount);
      setUsdcBalance(parseFloat(ethers.formatEther(usdcBal)).toFixed(2));

      const borrowed = await poolContract.getUserBorrowed(currentAccount);
      setBorrowedAmount(parseFloat(ethers.formatEther(borrowed)).toFixed(2));

      // 3. Fetch Stock Token Metrics Dynamically
      const tempWalletBalances = {};
      const tempCollateralBalances = {};
      const tempTokenPrices = {};

      const symbols = Object.keys(contractAddresses.tokens);
      for (const symbol of symbols) {
        const tokenAddress = contractAddresses.tokens[symbol];
        const tokenContract = new ethers.Contract(tokenAddress, rwaTokenABI, currentProvider);

        // Balance
        const bal = await tokenContract.balanceOf(currentAccount);
        tempWalletBalances[symbol] = parseFloat(ethers.formatEther(bal)).toFixed(2);

        // Collateral Deposited
        const col = await poolContract.getUserCollateral(currentAccount, tokenAddress);
        tempCollateralBalances[symbol] = parseFloat(ethers.formatEther(col)).toFixed(2);

        // Price from Oracle
        try {
          const price = await oracleContract.getAssetPrice(tokenAddress);
          tempTokenPrices[symbol] = parseFloat(ethers.formatUnits(price, 8)).toFixed(2);
        } catch (e) {
          console.error(`Failed to load price for ${symbol}:`, e);
          tempTokenPrices[symbol] = "0.00";
        }
      }

      setWalletBalances(tempWalletBalances);
      setCollateralBalances(tempCollateralBalances);
      setTokenPrices(tempTokenPrices);

      // 4. Fetch overall account data metrics from LendingPool
      const accountData = await poolContract.getAccountData(currentAccount);
      setTotalCollateralUSD(parseFloat(ethers.formatEther(accountData.totalCollateralUSD)).toFixed(2));
      setTotalBorrowedUSD(parseFloat(ethers.formatEther(accountData.totalBorrowedUSD)).toFixed(2));
      setBorrowCapacityUSD(parseFloat(ethers.formatEther(accountData.borrowCapacityUSD)).toFixed(2));

      const hfValue = accountData.healthFactor;
      if (hfValue > ethers.parseEther("1000000")) {
        setHealthFactor("9999.0");
      } else {
        setHealthFactor(parseFloat(ethers.formatEther(hfValue)).toFixed(2));
      }
    } catch (err) {
      console.error("Error reading blockchain state:", err);
      addConsoleLog('danger', `Failed to load on-chain data: ${err.message}`);
    }
  }, []);

  // --- Network Switcher ---
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xb626' }] // 46630 in hex
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xb626',
              chainName: 'Robinhood Chain Testnet',
              rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: [EXPLORER_URL]
            }]
          });
        } catch (addError) {
          console.error("Failed to add network:", addError);
        }
      }
    }
  };

  // --- Wallet Connection ---
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("An EVM wallet (like MetaMask) is required to interact with RobinLend.");
      return;
    }
    setWeb3Loading(true);
    try {
      const tempProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await tempProvider.send("eth_requestAccounts", []);
      const tempSigner = await tempProvider.getSigner();
      const network = await tempProvider.getNetwork();
      const networkChainId = Number(network.chainId);

      setProvider(tempProvider);
      setSigner(tempSigner);
      setAccount(accounts[0]);
      setChainId(networkChainId);

      addConsoleLog('success', `Connected Wallet: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
      
      if (networkChainId !== ROBINHOOD_CHAIN_ID) {
        addConsoleLog('warning', `Unsupported chain (ID: ${networkChainId}). Prompting network switch...`);
        await switchNetwork();
      } else {
        await fetchOnChainData(accounts[0], tempSigner, tempProvider);
      }
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Connection failed: ${err.message}`);
    }
    setWeb3Loading(false);
  };

  // --- Watch Account & Network Changes ---
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          addConsoleLog('info', `Switched account: ${accounts[0].slice(0, 6)}...`);
          const tempProvider = new ethers.BrowserProvider(window.ethereum);
          const tempSigner = await tempProvider.getSigner();
          setProvider(tempProvider);
          setSigner(tempSigner);
          await fetchOnChainData(accounts[0], tempSigner, tempProvider);
        } else {
          setAccount("");
          setSigner(null);
          addConsoleLog('warning', 'Wallet disconnected.');
        }
      };

      const handleChainChanged = (hexChainId) => {
        const decChainId = Number(hexChainId);
        setChainId(decChainId);
        addConsoleLog('info', `Switched network to Chain ID: ${decChainId}`);
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) {
          connectWallet();
        }
      });

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [fetchOnChainData]);

  // --- Run On-Chain Transaction Wrapper ---
  const runTransaction = async (actionLabel, transactionFn) => {
    if (!signer) return;
    setTxLoading(true);
    setConsoleLogs([]); 
    
    try {
      setActiveStep('sign');
      addConsoleLog('info', `[Web3] Requesting transaction signature for: ${actionLabel}`);
      await new Promise(r => setTimeout(r, 400));
      
      const tx = await transactionFn();
      
      setActiveStep('broadcast');
      addConsoleLog('success', `[Web3] Transaction signed and broadcasted!`);
      addConsoleLog('hash', `Tx Hash: ${tx.hash}`);
      addConsoleLog('info', `Waiting for block mining confirmation...`);

      setActiveStep('confirm');
      const receipt = await tx.wait();
      
      addConsoleLog('success', `[Robinhood L2] Block confirmed! Transaction successfully mined.`);
      addConsoleLog('hash', `Block Number: #${receipt.blockNumber} | Gas Used: ${receipt.gasUsed.toString()}`);
      
      await fetchOnChainData(account, signer, provider);
      setActiveStep(null);
    } catch (err) {
      console.error(err);
      setActiveStep(null);
      addConsoleLog('danger', `Transaction reverted: ${err.reason || err.message}`);
    }
    setTxLoading(false);
  };

  // --- Handlers ---
  const handleVerifyKYC = () => {
    const kycContract = new ethers.Contract(contractAddresses.kycRegistry, kycRegistryABI, signer);
    runTransaction("KYC Whitelist Registration", () => kycContract.register());
  };

  const handleDeposit = async (symbol) => {
    const inputVal = depositInputs[symbol];
    const amount = parseFloat(inputVal);
    if (isNaN(amount) || amount <= 0) return;

    const tokenAddress = contractAddresses.tokens[symbol];
    const tokenContract = new ethers.Contract(tokenAddress, rwaTokenABI, signer);
    const poolContract = new ethers.Contract(contractAddresses.lendingPool, lendingPoolABI, signer);
    const parsedAmount = ethers.parseEther(inputVal);

    setTxLoading(true);
    try {
      // Step 1: Approve
      const allowance = await tokenContract.allowance(account, contractAddresses.lendingPool);
      if (allowance < parsedAmount) {
        addConsoleLog('info', `[Approval] Approving LendingPool to transfer ${inputVal} ${symbol}...`);
        const approveTx = await tokenContract.approve(contractAddresses.lendingPool, parsedAmount);
        addConsoleLog('info', `Waiting for approval confirmation...`);
        await approveTx.wait();
        addConsoleLog('success', `Approval confirmed.`);
      }

      // Step 2: Deposit
      await runTransaction(`Deposit ${symbol} Collateral`, () => 
        poolContract.depositCollateral(tokenAddress, parsedAmount)
      );
      setDepositInputs(prev => ({ ...prev, [symbol]: "" }));
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Deposit failed: ${err.reason || err.message}`);
      setTxLoading(false);
    }
  };

  const handleWithdraw = (symbol) => {
    const inputVal = withdrawInputs[symbol];
    const amount = parseFloat(inputVal);
    if (isNaN(amount) || amount <= 0) return;

    const tokenAddress = contractAddresses.tokens[symbol];
    const poolContract = new ethers.Contract(contractAddresses.lendingPool, lendingPoolABI, signer);
    const parsedAmount = ethers.parseEther(inputVal);

    runTransaction(`Withdraw ${symbol} Collateral`, () => 
      poolContract.withdrawCollateral(tokenAddress, parsedAmount)
    );
    setWithdrawInputs(prev => ({ ...prev, [symbol]: "" }));
  };

  const handleBorrow = () => {
    const amount = parseFloat(borrowVal);
    if (isNaN(amount) || amount <= 0) return;

    const poolContract = new ethers.Contract(contractAddresses.lendingPool, lendingPoolABI, signer);
    const parsedAmount = ethers.parseEther(borrowVal);

    runTransaction("Borrow USDC", () => 
      poolContract.borrow(parsedAmount)
    );
    setBorrowVal("");
  };

  const handleRepay = async () => {
    const amount = parseFloat(repayVal);
    if (isNaN(amount) || amount <= 0) return;

    const usdcContract = new ethers.Contract(contractAddresses.usdc, usdcTokenABI, signer);
    const poolContract = new ethers.Contract(contractAddresses.lendingPool, lendingPoolABI, signer);
    const parsedAmount = ethers.parseEther(repayVal);

    setTxLoading(true);
    try {
      // Step 1: Approve USDC
      const allowance = await usdcContract.allowance(account, contractAddresses.lendingPool);
      if (allowance < parsedAmount) {
        addConsoleLog('info', `[Approval] Approving LendingPool to transfer ${repayVal} USDC...`);
        const approveTx = await usdcContract.approve(contractAddresses.lendingPool, parsedAmount);
        addConsoleLog('info', `Waiting for approval confirmation...`);
        await approveTx.wait();
        addConsoleLog('success', `Approval confirmed.`);
      }

      // Step 2: Repay
      await runTransaction("Repay USDC Loan", () => 
        poolContract.repay(parsedAmount)
      );
      setRepayVal("");
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Repayment failed: ${err.reason || err.message}`);
      setTxLoading(false);
    }
  };

  const handleUSDCFaucet = () => {
    const usdcContract = new ethers.Contract(contractAddresses.usdc, usdcTokenABI, signer);
    runTransaction("USDC Faucet Claim", () => 
      usdcContract.faucet(account, ethers.parseEther("1000"))
    );
  };

  // Claim stock tokens from the official Robinhood Chain testnet faucet
  const handleStockFaucet = () => {
    const faucetContract = new ethers.Contract(contractAddresses.faucet, faucetABI, signer);
    runTransaction("Claim Testnet Stock Tokens Faucet", () => 
      faucetContract.sendTokensAndEther(account, ethers.parseEther("5"))
    );
  };

  const getHealthClass = (hf) => {
    const val = parseFloat(hf);
    if (val > 1.5) return "health-good";
    if (val >= 1.0) return "health-warning";
    return "health-danger";
  };

  const isWrongNetwork = chainId !== ROBINHOOD_CHAIN_ID;
  const isReady = account && !isWrongNetwork;
  const tokenSymbols = Object.keys(contractAddresses.tokens);

  // --- Document Sections Component ---
  const renderDocsContent = () => {
    switch (activeDocSection) {
      case 'intro':
        return (
          <div className="docs-article">
            <h1>Introduction to RobinLend</h1>
            <p>
              RobinLend is a compliant, institutional-grade, real-world asset (RWA) backed lending protocol deployed on the <strong>Robinhood Chain L2 Testnet</strong>. 
            </p>
            <p>
              By leveraging tokenized stock assets and wrapping them within a compliance-centric architecture, RobinLend allows institutional borrowers and retail liquidity providers to unlock deep capital efficiency securely. The protocol operates in a fully decentralized, peer-to-pool architecture with sponsored gas transactions.
            </p>
            <div className="docs-info-box">
              <h4>About Arbitrum Open House London</h4>
              <p>RobinLend was designed and built as a submission for the Arbitrum London Buildathon, demonstrating real stock-collateralized lending on Orbit-based L2 chains.</p>
            </div>
            <h2>Key Protocols Features</h2>
            <ul>
              <li><strong>Regulatory Compliance</strong>: All user actions are gated by a secure on-chain Identity/KYC whitelisting contract.</li>
              <li><strong>High LTV Collateral</strong>: Unlock up to 75% LTV against tokenized blue-chip equities like Tesla, Amazon, and Palantir.</li>
              <li><strong>MetaMask Integration</strong>: Purely decentralized read/write operations without centralized mock servers or simulations.</li>
            </ul>
          </div>
        );
      case 'kyc':
        return (
          <div className="docs-article">
            <h1>Compliance & KYC Whitelisting</h1>
            <p>
              To meet institutional requirements, RobinLend implements a regulatory gateway. All depositors and borrowers must be whitelisted in our global <code>KYCRegistry</code> contract.
            </p>
            <h2>How KYC Gating Works</h2>
            <p>
              All core transaction entry-points inside the <code>LendingPool</code> contract check user eligibility via:
            </p>
            <pre><code>require(kycRegistry.isVerified(msg.sender), "Not KYC Verified");</code></pre>
            <p>
              This ensures that unverified addresses can neither deposit collateral nor borrow stablecoins.
            </p>
            <h2>Self-Service Registration (Demo Mode)</h2>
            <p>
              For Buildathon testing purposes, we have exposed a self-service registration method in the <code>KYCRegistry.sol</code> contract. Users can register their address on-chain instantly by clicking the <strong>Register Identity On-Chain</strong> button on the application dashboard.
            </p>
          </div>
        );
      case 'faucet':
        return (
          <div className="docs-article">
            <h1>Claiming Faucet Assets</h1>
            <p>
              To interact with the RobinLend testnet application, you need testnet collateral (stock tokens) and stablecoins (USDC), as well as gas token (testnet ETH) on the Robinhood L2 network.
            </p>
            <h2>1. Robinhood L2 Gas Faucet</h2>
            <p>
              First, claim testnet ETH to pay for transactions. You can request it directly from the official faucet:
            </p>
            <p>
              <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer">
                Open Robinhood Chain Gas Faucet <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </a>
            </p>
            <h2>2. Stock Assets Faucet</h2>
            <p>
              The official stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) are distributed via the official testnet faucet at <code>0x8762f93772c663c6a88ba50900bd5381df2717be</code>. 
            </p>
            <p>
              Inside the App Dashboard, clicking <strong>Claim 5x Stock Tokens</strong> will execute a contract transaction calling:
            </p>
            <pre><code>faucet.sendTokensAndEther(account, amount);</code></pre>
            <p>This deposits 5 units of each stock token directly into your MetaMask wallet.</p>
            <h2>3. USDC Faucet</h2>
            <p>
              To test the repayment logic, you can claim Mock USDC directly from our deployed <code>USDCToken</code> faucet by clicking the <strong>Claim USDC Faucet</strong> button in the UI.
            </p>
          </div>
        );
      case 'ltv':
        return (
          <div className="docs-article">
            <h1>Lending Operations & LTV Settings</h1>
            <p>
              RobinLend computes borrow capacity and health factors using real-time price feeds. Collateral assets have specific Loan-to-Value (LTV) limits set in the <code>LendingPool</code> contract:
            </p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Stock Name</th>
                  <th>Configured Price</th>
                  <th>LTV Limit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>TSLA</strong></td>
                  <td>Tesla Inc.</td>
                  <td>$180.00</td>
                  <td>70%</td>
                </tr>
                <tr>
                  <td><strong>AMZN</strong></td>
                  <td>Amazon.com Inc.</td>
                  <td>$185.00</td>
                  <td>75%</td>
                </tr>
                <tr>
                  <td><strong>PLTR</strong></td>
                  <td>Palantir Technologies</td>
                  <td>$21.00</td>
                  <td>65%</td>
                </tr>
                <tr>
                  <td><strong>NFLX</strong></td>
                  <td>Netflix Inc.</td>
                  <td>$600.00</td>
                  <td>70%</td>
                </tr>
                <tr>
                  <td><strong>AMD</strong></td>
                  <td>Advanced Micro Devices</td>
                  <td>$160.00</td>
                  <td>70%</td>
                </tr>
              </tbody>
            </table>
            <h2>Calculating Health Factor</h2>
            <p>
              Your Health Factor indicates the safety of your loan relative to your deposited collateral. 
            </p>
            <p style={{ fontStyle: 'italic', paddingLeft: '1rem', borderLeft: '2px solid var(--accent-color)' }}>
              Health Factor = (Total Collateral in USD * LTV Ratio) / Total Borrowed in USD
            </p>
            <p>
              If your Health Factor falls below <strong>1.00</strong>, your collateral becomes subject to liquidation to protect the protocol's solvency.
            </p>
          </div>
        );
      case 'addresses':
        return (
          <div className="docs-article">
            <h1>Deployed Smart Contract Addresses</h1>
            <p>
              The following contracts have been successfully deployed and verified on the <strong>Robinhood Chain L2 Testnet (Chain ID 46630)</strong>:
            </p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Contract Name</th>
                  <th>Deployed Address</th>
                  <th>Explorer Link</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>LendingPool</strong></td>
                  <td className="docs-address">{contractAddresses.lendingPool}</td>
                  <td>
                    <a href={`${EXPLORER_URL}/address/${contractAddresses.lendingPool}`} target="_blank" rel="noreferrer">
                      View <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td><strong>KYCRegistry</strong></td>
                  <td className="docs-address">{contractAddresses.kycRegistry}</td>
                  <td>
                    <a href={`${EXPLORER_URL}/address/${contractAddresses.kycRegistry}`} target="_blank" rel="noreferrer">
                      View <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td><strong>USDCToken</strong></td>
                  <td className="docs-address">{contractAddresses.usdc}</td>
                  <td>
                    <a href={`${EXPLORER_URL}/address/${contractAddresses.usdc}`} target="_blank" rel="noreferrer">
                      View <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td><strong>PriceOracle</strong></td>
                  <td className="docs-address">{contractAddresses.priceOracle}</td>
                  <td>
                    <a href={`${EXPLORER_URL}/address/${contractAddresses.priceOracle}`} target="_blank" rel="noreferrer">
                      View <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td><strong>Official Faucet</strong></td>
                  <td className="docs-address">{contractAddresses.faucet}</td>
                  <td>
                    <a href={`${EXPLORER_URL}/address/${contractAddresses.faucet}`} target="_blank" rel="noreferrer">
                      View <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="landing-container">
      {/* Landing View */}
      {view === 'landing' && (
        <>
          <header className="landing-header">
            <div className="brand" onClick={() => setView('landing')}>
              <img src="/logo.jpg" alt="RobinLend" className="brand-logo-img" />
              <div className="brand-text" style={{ color: 'var(--text-primary)' }}>Robin<span>Lend</span></div>
            </div>
            <nav className="nav-links">
              <button className="nav-link active" onClick={() => setView('landing')}>Home</button>
              <button className="nav-link" onClick={() => { setView('docs'); setActiveDocSection('intro'); }}>Docs</button>
              <button className="btn-connect" onClick={() => setView('app')}>Enter App</button>
            </nav>
          </header>

          <main className="hero-section">
            <img src="/logo.jpg" alt="RobinLend Logo" className="hero-logo-img" />
            <h1 className="hero-title">
              Compliant <span>Stock-Backed</span> Liquidity
            </h1>
            <p className="hero-subtitle">
              Secure on-chain stablecoin borrowing backed by blue-chip tokenized equities. Deployed live on Robinhood Chain L2 Testnet.
            </p>
            <div className="hero-buttons">
              <button className="btn-hero-primary" onClick={() => setView('app')}>Enter App</button>
              <button className="btn-hero-secondary" onClick={() => { setView('docs'); setActiveDocSection('intro'); }}>Read Docs</button>
            </div>

            <div className="stats-grid">
              <div className="stats-item">
                <span className="stats-label">Total Value Locked</span>
                <span className="stats-value">$2,450,180</span>
              </div>
              <div className="stats-item">
                <span className="stats-label">Active Borrows</span>
                <span className="stats-value">$1,120,400</span>
              </div>
              <div className="stats-item">
                <span className="stats-label">Protocol APY</span>
                <span className="stats-value">6.12%</span>
              </div>
            </div>
          </main>

          <section className="features-section">
            <h2 className="section-title">
              Institutional Grade <span>Compliance</span>
            </h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <ShieldCheck size={24} />
                </div>
                <h3>On-Chain KYC Gating</h3>
                <p>All protocol interactions are restricted to compliance-verified addresses via our smart contract KYC registry.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Coins size={24} />
                </div>
                <h3>Blue-Chip Equities</h3>
                <p>Deposit tokenized shares of TSLA, AMZN, PLTR, NFLX, and AMD directly from the official testnet faucet as collateral.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Cpu size={24} />
                </div>
                <h3>Ultra-Low Gas L2</h3>
                <p>Built on Robinhood Chain L2, benefiting from Arbitrum Orbit tech stack for sub-penny gas transactions.</p>
              </div>
            </div>
          </section>

          <footer className="landing-footer">
            <div className="footer-content">
              <div className="footer-brand">
                <img src="/logo.jpg" alt="RobinLend Logo" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
                <span className="brand-text" style={{ fontSize: '1.1rem' }}>Robin<span>Lend</span></span>
              </div>
              <div className="footer-links">
                <a href="https://github.com/0xnald/RobinLend" target="_blank" rel="noreferrer" className="social-icon-btn">
                  <GithubIcon />
                </a>
                <a href="https://x.com/robinlend" target="_blank" rel="noreferrer" className="social-icon-btn">
                  <TwitterIcon />
                </a>
                <button className="footer-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { setView('docs'); setActiveDocSection('intro'); }}>Docs</button>
                <button className="footer-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('app')}>Launch App</button>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Docs View */}
      {view === 'docs' && (
        <>
          <header className="landing-header">
            <div className="brand" onClick={() => setView('landing')}>
              <img src="/logo.jpg" alt="RobinLend" className="brand-logo-img" />
              <div className="brand-text" style={{ color: 'var(--text-primary)' }}>Robin<span>Lend</span></div>
            </div>
            <nav className="nav-links">
              <button className="nav-link" onClick={() => setView('landing')}>Home</button>
              <button className="nav-link active" onClick={() => setView('docs')}>Docs</button>
              <button className="btn-connect" onClick={() => setView('app')}>Launch App</button>
            </nav>
          </header>

          <div className="docs-layout">
            <aside className="docs-sidebar">
              <span className="docs-sidebar-title">Getting Started</span>
              <button className={`docs-sidebar-item ${activeDocSection === 'intro' ? 'active' : ''}`} onClick={() => setActiveDocSection('intro')}>Introduction</button>
              <button className={`docs-sidebar-item ${activeDocSection === 'kyc' ? 'active' : ''}`} onClick={() => setActiveDocSection('kyc')}>Compliance & KYC</button>
              <button className={`docs-sidebar-item ${activeDocSection === 'faucet' ? 'active' : ''}`} onClick={() => setActiveDocSection('faucet')}>Faucet Guide</button>
              
              <span className="docs-sidebar-title" style={{ marginTop: '1.5rem' }}>Protocol Specs</span>
              <button className={`docs-sidebar-item ${activeDocSection === 'ltv' ? 'active' : ''}`} onClick={() => setActiveDocSection('ltv')}>Lending & LTV</button>
              <button className={`docs-sidebar-item ${activeDocSection === 'addresses' ? 'active' : ''}`} onClick={() => setActiveDocSection('addresses')}>Contract Addresses</button>
            </aside>

            <main className="docs-content">
              {renderDocsContent()}
            </main>
          </div>

          <footer className="landing-footer" style={{ marginTop: 'auto' }}>
            <div className="footer-content">
              <div className="footer-brand">
                <img src="/logo.jpg" alt="RobinLend Logo" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
                <span className="brand-text" style={{ fontSize: '1.1rem' }}>Robin<span>Lend</span></span>
              </div>
              <div className="footer-links">
                <a href="https://github.com/0xnald/RobinLend" target="_blank" rel="noreferrer" className="social-icon-btn">
                  <GithubIcon />
                </a>
                <a href="https://x.com/robinlend" target="_blank" rel="noreferrer" className="social-icon-btn">
                  <TwitterIcon />
                </a>
                <button className="footer-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('landing')}>Home</button>
                <button className="footer-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('app')}>Launch App</button>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* App/Dashboard View */}
      {view === 'app' && (
        <div className="app-container">
          {/* Header */}
          <header className="app-header">
            <div className="brand" onClick={() => setView('landing')}>
              <img src="/logo.jpg" alt="RobinLend" className="brand-logo-img" />
              <div className="brand-text">Robin<span>Lend</span></div>
            </div>
            
            <div className="header-actions">
              <button className="nav-link" onClick={() => setView('landing')}>Home</button>
              <button className="nav-link" onClick={() => { setView('docs'); setActiveDocSection('intro'); }}>Docs</button>
              
              {account && (
                <div className={`network-badge ${isWrongNetwork ? 'danger' : 'robinhood'}`} style={isWrongNetwork ? {color: 'var(--danger-color)', background: 'rgba(255,74,74,0.1)', borderColor: 'rgba(255,74,74,0.2)'} : {}}>
                  <div className="network-dot" style={isWrongNetwork ? {backgroundColor: 'var(--danger-color)'} : {}}></div>
                  {isWrongNetwork ? 'Unsupported Network' : 'Robinhood L2 Testnet'}
                </div>
              )}

              <button 
                className={`btn-connect ${account ? 'btn-connected' : ''}`}
                onClick={account ? null : connectWallet}
                disabled={web3Loading}
              >
                <Wallet size={16} />
                {web3Loading ? 'Connecting...' : account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
              </button>
            </div>
          </header>

          {/* Main UI Overlay Lock when disconnected or on wrong network */}
          {!isReady ? (
            <div className="panel" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', gap: '1.5rem', margin: '4rem 0' }}>
              <img src="/logo.jpg" alt="RobinLend" style={{ width: '64px', height: '64px', borderRadius: '14px', border: '1.5px solid var(--accent-color)' }} />
              <div>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                  {isWrongNetwork && account ? 'Switch to Robinhood L2 Testnet' : 'Connect Wallet to Access RobinLend'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '460px', fontSize: '0.95rem' }}>
                  {isWrongNetwork && account 
                    ? 'RobinLend runs exclusively on Robinhood Chain L2 Testnet (Chain ID 46630). Click below to update your network configuration.'
                    : 'RobinLend is a fully real, compliance-gated real-world asset lending protocol. Access the platform by connecting your MetaMask wallet.'}
                </p>
              </div>
              
              {isWrongNetwork && account ? (
                <button className="btn-connect" onClick={switchNetwork}>
                  Switch Network to Robinhood L2
                </button>
              ) : (
                <button className="btn-connect" onClick={connectWallet} disabled={web3Loading}>
                  <Wallet size={18} /> Connect MetaMask Wallet
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Compliance Banner */}
              <div className="compliance-banner">
                <div className="compliance-info">
                  <div className="compliance-icon">
                    {kycStatus ? <ShieldCheck size={28} /> : <ShieldAlert size={28} style={{ color: 'var(--warning-color)' }} />}
                  </div>
                  <div className="compliance-text">
                    <h4>{kycStatus ? 'On-Chain Compliance Status: KYC CLEARED' : 'On-Chain Compliance Status: KYC REQUIRED'}</h4>
                    <p>{kycStatus ? 'Your address is whitelisted in the KYCRegistry contract. You are authorized to transact with compliant assets.' : 'Robinhood Chain requires regulatory compliance for RWA assets. Whitelist your wallet on-chain to access lending and faucet pools.'}</p>
                  </div>
                </div>
                {!kycStatus ? (
                  <button className="btn-verify" onClick={handleVerifyKYC} disabled={txLoading}>
                    Register Identity On-Chain
                  </button>
                ) : (
                  <div className="status-verified">
                    <CheckCircle2 size={14} /> KYC Active
                  </div>
                )}
              </div>

              {/* Metrics Row */}
              <div className="metrics-row" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card">
                  <div className="metric-label">Net Collateral Value</div>
                  <div className="metric-value">${parseFloat(totalCollateralUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div className="metric-subvalue">Stock values in USD</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Debt</div>
                  <div className="metric-value">${parseFloat(totalBorrowedUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div className="metric-subvalue">{borrowedAmount} USDC borrowed</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Available Borrow Capacity</div>
                  <div className="metric-value">${parseFloat(borrowCapacityUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div className="metric-subvalue">Asset-specific LTV limits</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Health Factor</div>
                  <div className={`metric-value ${getHealthClass(healthFactor)}`}>
                    {parseFloat(healthFactor) > 9000 ? '∞' : healthFactor}
                  </div>
                  <div className="metric-subvalue">Liquidation triggers at &lt; 1.00</div>
                </div>
              </div>

              {/* Dashboard Grid */}
              <div className="dashboard-grid">
                
                {/* Left Column: Actions */}
                <div className="main-column">
                  {/* Depositable Assets Panel */}
                  <div className="panel">
                    <div className="panel-title">
                      <div>Depositable Real-World Assets (Collateral)</div>
                      <div className="panel-subtitle">Official stock tokens deployed on Robinhood Chain L2</div>
                    </div>
                    
                    <table className="asset-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Price</th>
                          <th>Wallet Balance</th>
                          <th>Deposited</th>
                          <th>LTV</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenSymbols.map(symbol => {
                          const cfg = STOCK_CONFIGS[symbol] || { name: symbol, logoClass: "", color: "#fff" };
                          const price = tokenPrices[symbol] || "0.00";
                          const walletBal = walletBalances[symbol] || "0.00";
                          const depositedBal = collateralBalances[symbol] || "0.00";
                          const depositVal = depositInputs[symbol] || "";
                          const withdrawVal = withdrawInputs[symbol] || "";
                          
                          // LTV configs
                          const ltvPercent = symbol === "AMZN" ? "75%" : symbol === "PLTR" ? "65%" : "70%";

                          return (
                            <tr key={symbol}>
                              <td>
                                <div className="asset-info">
                                  <div className="asset-logo" style={{ backgroundColor: cfg.color }}>
                                    {symbol}
                                  </div>
                                  <div>
                                    <div className="asset-symbol">{symbol}</div>
                                    <div className="asset-name">{cfg.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="asset-price">${parseFloat(price).toFixed(2)}</td>
                              <td>{walletBal} {symbol}</td>
                              <td style={{ fontWeight: 600 }}>{depositedBal} {symbol}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{ltvPercent}</td>
                              <td className="asset-action-cell">
                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.4rem', width: '220px' }}>
                                  {/* Deposit Row */}
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <input 
                                      type="number" 
                                      placeholder="Deposit" 
                                      className="input-field" 
                                      style={{ height: '30px', padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '120px' }}
                                      value={depositVal}
                                      onChange={(e) => setDepositInputs(prev => ({ ...prev, [symbol]: e.target.value }))}
                                      disabled={txLoading || !kycStatus}
                                    />
                                    <button 
                                      className="btn-submit" 
                                      style={{ height: '30px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap', width: 'auto' }}
                                      onClick={() => handleDeposit(symbol)}
                                      disabled={txLoading || !kycStatus || !depositVal}
                                    >
                                      Deposit
                                    </button>
                                  </div>

                                  {/* Withdraw Row (only if user has deposited balance) */}
                                  {parseFloat(depositedBal) > 0 && (
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <input 
                                        type="number" 
                                        placeholder="Withdraw" 
                                        className="input-field" 
                                        style={{ height: '30px', padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '120px' }}
                                        value={withdrawVal}
                                        onChange={(e) => setWithdrawInputs(prev => ({ ...prev, [symbol]: e.target.value }))}
                                        disabled={txLoading}
                                      />
                                      <button 
                                        className="btn-submit btn-danger" 
                                        style={{ height: '30px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap', width: 'auto' }}
                                        onClick={() => handleWithdraw(symbol)}
                                        disabled={txLoading || !withdrawVal}
                                      >
                                        Withdraw
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* SVG Performance chart */}
                    <div className="chart-container">
                      <div style={{ position: 'absolute', top: 5, left: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stock Asset Index Yield Tracker (30D)</div>
                      <svg className="chart-svg" viewBox="0 0 500 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.2"/>
                            <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0,100 L 0,80 Q 50,60 100,75 T 200,50 T 300,55 T 400,30 T 500,20 L 500,100 Z" className="chart-fill-path" />
                        <path d="M 0,80 Q 50,60 100,75 T 200,50 T 300,55 T 400,30 T 500,20" className="chart-glow-path" />
                      </svg>
                    </div>
                  </div>

                  {/* Borrow Stablecoins Panel */}
                  <div className="panel">
                    <div className="panel-title">
                      <div>Borrow Stablecoins</div>
                      <div className="panel-subtitle">Access liquid USDC capital backed by RWA assets</div>
                    </div>

                    <table className="asset-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Price</th>
                          <th>Wallet Balance</th>
                          <th>Borrowed</th>
                          <th>Borrow APY</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <div className="asset-info">
                              <div className="asset-logo usdc">USDC</div>
                              <div>
                                <div className="asset-symbol">USDC</div>
                                <div className="asset-name">Mock USD Stablecoin</div>
                              </div>
                            </div>
                          </td>
                          <td className="asset-price">${usdcPrice.toFixed(2)}</td>
                          <td>{usdcBalance} USDC</td>
                          <td style={{ fontWeight: 600 }}>{borrowedAmount} USDC</td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>6.12%</td>
                          <td className="asset-action-cell">
                            <div style={{ display: 'inline-flex', gap: '0.5rem', width: '220px' }}>
                              <input 
                                type="number" 
                                placeholder="0.0" 
                                className="input-field" 
                                style={{ height: '34px', padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
                                value={borrowVal}
                                onChange={(e) => setBorrowVal(e.target.value)}
                                disabled={txLoading || parseFloat(totalCollateralUSD) === 0}
                              />
                              <button 
                                className="btn-submit" 
                                style={{ height: '34px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap', width: 'auto' }}
                                onClick={handleBorrow}
                                disabled={txLoading || parseFloat(totalCollateralUSD) === 0 || !borrowVal}
                              >
                                Borrow
                              </button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Repay Box */}
                    {parseFloat(borrowedAmount) > 0 && (
                      <div className="action-box">
                        <div className="input-container">
                          <div className="input-label-row">
                            <span>Repay borrowed USDC</span>
                            <span>Max: <span className="input-max-btn" onClick={() => setRepayVal(borrowedAmount)}>{borrowedAmount} USDC</span></span>
                          </div>
                          <div className="input-wrapper">
                            <input 
                              type="number" 
                              placeholder="0.0" 
                              className="input-field" 
                              value={repayVal}
                              onChange={(e) => setRepayVal(e.target.value)}
                              disabled={txLoading}
                            />
                            <span className="input-token-tag">USDC</span>
                          </div>
                        </div>
                        <button 
                          className="btn-submit" 
                          onClick={handleRepay}
                          disabled={txLoading || !repayVal}
                        >
                          Repay USDC Loan
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Console */}
                <div className="main-column" style={{ gap: '1rem' }}>
                  {/* Event Relayer Console Panel */}
                  <div className="panel" style={{ display: 'flex', flexGrow: '1', flexDirection: 'column', minHeight: '400px' }}>
                    <div className="panel-title" style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Terminal size={18} style={{ color: 'var(--accent-color)' }} />
                        <span>On-Chain Transaction Monitor</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Robinhood L2 Network Logs</span>
                    </div>

                    {/* MetaMask Action Flow */}
                    <div className="userop-visualizer">
                      <div className={`visualizer-node`}>
                        <div className={`node-icon ${txLoading && activeStep === 'sign' ? 'active' : ''}`}>
                          <Wallet size={14} />
                        </div>
                        <div className="node-label">Sign Tx</div>
                      </div>
                      <div className={`node-arrow ${txLoading && activeStep === 'sign' ? 'active' : ''}`}><ChevronRight size={14} /></div>
                      
                      <div className={`visualizer-node`}>
                        <div className={`node-icon ${txLoading && activeStep === 'broadcast' ? 'active' : ''}`}>
                          <ArrowRightLeft size={14} />
                        </div>
                        <div className="node-label">Mempool</div>
                      </div>
                      <div className={`node-arrow ${txLoading && activeStep === 'broadcast' ? 'active' : ''}`}><ChevronRight size={14} /></div>
                      
                      <div className={`visualizer-node`}>
                        <div className={`node-icon ${txLoading && activeStep === 'confirm' ? 'active' : ''}`}>
                          <CheckCircle2 size={14} />
                        </div>
                        <div className="node-label">Block Mine</div>
                      </div>
                    </div>

                    {/* Output console log */}
                    <div className="explorer-panel" style={{ flex: '1' }}>
                      <div className="explorer-title">
                        <span>Transaction History Log</span>
                        <span className="explorer-status-badge">
                          {txLoading ? 'AWAITING BLOCK' : 'ACTIVE'}
                        </span>
                      </div>
                      
                      {consoleLogs.map((log, index) => (
                        <div key={index} className={`explorer-log-item ${log.type}`}>
                          {log.timestamp && <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>[{log.timestamp}]</span>}
                          {log.text}
                        </div>
                      ))}
                      {txLoading && (
                        <div className="explorer-log-item info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div className="spinner"></div> Indexing block transaction confirmation...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Faucet Box */}
                  <div className="panel" style={{ paddingBottom: '2.5rem' }}>
                    <div className="panel-title">
                      <div>Robinhood Testnet Faucets</div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Claim on-chain mock stock tokens to test collateralized positions.</p>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-faucet" onClick={handleUSDCFaucet} disabled={txLoading}>
                        Claim USDC Faucet
                      </button>
                      <button className="btn-faucet primary" onClick={handleStockFaucet} disabled={txLoading}>
                        Claim 5x Stock Tokens
                      </button>
                    </div>
                    
                    <div className="faucet-row">
                      <div className="faucet-info">
                        <span className="faucet-title">Robinhood Chain Gas Faucet</span>
                        <span className="faucet-desc">Get testnet ETH to pay for transactions</span>
                      </div>
                      <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer" className="btn-faucet" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Open Faucet <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
