import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Sparkles,
  Copy,
  LogOut,
  Check
} from 'lucide-react';
import { ethers } from 'ethers';
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import contractAddresses from './config.json';

// ABIs for real contract interactions
const kycRegistryABI = [
  "function isVerified(address user) view returns (bool)",
  "function register() external"
];
const rwaTokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)"
];
const usdcTokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function faucet(address to, uint256 amount) external",
  "function transfer(address to, uint256 value) external returns (bool)"
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

const ALL_ASSETS = [
  { symbol: 'USDC', name: 'Mock USDC' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'PLTR', name: 'Palantir Technologies' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' }
];

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
  const { login, logout, authenticated, ready, user, openUserProfile } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();

  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef(null);

  // Deposit / Withdraw Modal States
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [depositAsset, setDepositAsset] = useState('USDC');
  const [withdrawAsset, setWithdrawAsset] = useState('USDC');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawRecipient, setWithdrawRecipient] = useState('');
  const [depositFromWalletLoading, setDepositFromWalletLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [showDepositAssetDropdown, setShowDepositAssetDropdown] = useState(false);
  const [showWithdrawAssetDropdown, setShowWithdrawAssetDropdown] = useState(false);
  const [depositFlow, setDepositFlow] = useState('select'); // 'select' | 'connected' | 'external'
  const [ethBalance, setEthBalance] = useState("0.0000");

  const getAssetBalance = (symbol) => {
    if (symbol === 'ETH') return ethBalance;
    if (symbol === 'USDC') return usdcBalance;
    return walletBalances[symbol] || "0.00";
  };

  const getAssetColor = (symbol) => {
    if (symbol === 'ETH') return '#627EEA';
    if (symbol === 'USDC') return '#2775CA';
    return STOCK_CONFIGS[symbol]?.color || '#FFFFFF';
  };

  // --- Navigation View State ---
  const [view, setView] = useState('landing'); // 'landing' | 'app' | 'docs'
  const [activeDocSection, setActiveDocSection] = useState('intro'); // 'intro' | 'kyc' | 'faucet' | 'ltv' | 'addresses'
  
  const [globalTVL, setGlobalTVL] = useState("...");
  const [globalActiveBorrows, setGlobalActiveBorrows] = useState("...");

  const formatStatUSD = (val) => {
    const parsed = parseFloat(val);
    if (isNaN(parsed)) return "$...";
    return "$" + parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
  const [healthFactor, setHealthFactor] = useState("...");

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

  const availableBorrowCapacity = Math.max(0, parseFloat(borrowCapacityUSD) - parseFloat(totalBorrowedUSD));

  const addConsoleLog = (type, text) => {
    setConsoleLogs(prev => [...prev, { type, text, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleCopyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowWalletDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDepositFromConnectedWallet = async (e) => {
    e.preventDefault();
    if (!window.ethereum || !depositAmount || !depositAsset) return;
    setDepositFromWalletLoading(true);
    addConsoleLog('info', `Requesting transfer of ${depositAmount} ${depositAsset} from MetaMask to embedded wallet...`);
    try {
      // Connect to MetaMask provider
      const tempProvider = new ethers.BrowserProvider(window.ethereum);
      const tempSigner = await tempProvider.getSigner();
      
      let tx;
      if (depositAsset === 'ETH') {
        tx = await tempSigner.sendTransaction({
          to: account,
          value: ethers.parseEther(depositAmount)
        });
      } else {
        // USDC or Stock Token
        let tokenAddress;
        if (depositAsset === 'USDC') {
          tokenAddress = contractAddresses.usdc;
        } else {
          tokenAddress = contractAddresses.tokens[depositAsset];
        }
        
        const tokenContract = new ethers.Contract(tokenAddress, rwaTokenABI, tempSigner);
        tx = await tokenContract.transfer(account, ethers.parseEther(depositAmount));
      }
      
      addConsoleLog('info', `Deposit transfer broadcasted! Hash: ${tx.hash}`);
      await tx.wait();
      addConsoleLog('success', `Deposited ${depositAmount} ${depositAsset} successfully from connected wallet.`);
      
      setDepositAmount('');
      setDepositFlow('select');
      setShowDepositModal(false);
      
      // Refresh balances
      await fetchOnChainData(account, signer, provider);
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Connected wallet deposit failed: ${err.reason || err.message}`);
    }
    setDepositFromWalletLoading(false);
  };

  const handleWithdrawFunds = async (e) => {
    e.preventDefault();
    if (!signer || !withdrawRecipient || !withdrawAmount || !withdrawAsset) return;
    setWithdrawLoading(true);
    addConsoleLog('info', `Initiating withdrawal of ${withdrawAmount} ${withdrawAsset} to ${withdrawRecipient}...`);
    try {
      let tx;
      if (withdrawAsset === 'ETH') {
        tx = await signer.sendTransaction({
          to: withdrawRecipient,
          value: ethers.parseEther(withdrawAmount)
        });
      } else {
        // USDC or Stock Token
        let tokenAddress;
        if (withdrawAsset === 'USDC') {
          tokenAddress = contractAddresses.usdc;
        } else {
          tokenAddress = contractAddresses.tokens[withdrawAsset];
        }
        
        const tokenContract = new ethers.Contract(tokenAddress, rwaTokenABI, signer);
        tx = await tokenContract.transfer(withdrawRecipient, ethers.parseEther(withdrawAmount));
      }
      
      addConsoleLog('info', `Withdrawal transaction broadcasted! Hash: ${tx.hash}`);
      await tx.wait();
      addConsoleLog('success', `Withdrawal of ${withdrawAmount} ${withdrawAsset} completed successfully.`);
      
      // Reset states
      setWithdrawAmount('');
      setWithdrawRecipient('');
      setShowWithdrawModal(false);
      
      // Refresh balances
      await fetchOnChainData(account, signer, provider);
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Withdrawal failed: ${err.reason || err.message}`);
    }
    setWithdrawLoading(false);
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

      // Fetch native ETH balance
      const ethBal = await currentProvider.getBalance(currentAccount);
      setEthBalance(parseFloat(ethers.formatEther(ethBal)).toFixed(4));

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
    if (wallets.length > 0) {
      const activeWallet = wallets[0];
      try {
        await activeWallet.switchChain(ROBINHOOD_CHAIN_ID);
        addConsoleLog('info', `Switched network to Chain ID: ${ROBINHOOD_CHAIN_ID}`);
      } catch (err) {
        console.error("Failed to switch network via Privy:", err);
        addConsoleLog('danger', `Failed to switch network: ${err.message || err}`);
      }
    } else if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xb626' }] // 46630 in hex
        });
      } catch (switchError) {
        console.error("Switch network error:", switchError);
        const isChainMissing = 
          switchError.code === 4902 || 
          (switchError.message && switchError.message.toLowerCase().includes("unrecognized")) ||
          (switchError.data && typeof switchError.data === 'object' && 
            (switchError.data.code === 4902 || 
             (switchError.data.originalError && switchError.data.originalError.code === 4902)));

        if (isChainMissing) {
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
            alert(`Failed to add Robinhood Chain Testnet: ${addError.message || addError}`);
          }
        } else {
          alert(`Failed to switch to Robinhood Chain Testnet: ${switchError.message || switchError}`);
        }
      }
    } else {
      alert("No Ethereum wallet detected. Please log in first.");
    }
  };

  // --- Wallet Connection ---
  const connectWallet = async () => {
    if (!ready) {
      addConsoleLog('warning', 'Authentication provider is initializing. Please wait a moment.');
      return;
    }
    setWeb3Loading(true);
    try {
      login();
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Connection failed: ${err.message}`);
    }
    setWeb3Loading(false);
  };

  // --- Sync Privy Wallets with Ethers.js provider/signer ---
  useEffect(() => {
    const initWallet = async () => {
      if (wallets.length > 0) {
        const activeWallet = wallets[0];
        try {
          const eip119Provider = await activeWallet.getEthereumProvider();
          const tempProvider = new ethers.BrowserProvider(eip119Provider);
          const tempSigner = await tempProvider.getSigner();
          
          setProvider(tempProvider);
          setSigner(tempSigner);
          setAccount(activeWallet.address);
          
          const parsedChainId = activeWallet.chainId && activeWallet.chainId.includes(':')
            ? parseInt(activeWallet.chainId.split(':').pop(), 10)
            : parseInt(activeWallet.chainId, 10);
          setChainId(parsedChainId);
          
          addConsoleLog('success', `Connected Wallet: ${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}`);
          
          if (parsedChainId !== ROBINHOOD_CHAIN_ID) {
            addConsoleLog('warning', `Unsupported chain (ID: ${parsedChainId}). Prompting network switch...`);
            await switchNetwork();
          } else {
            await fetchOnChainData(activeWallet.address, tempSigner, tempProvider);
          }
        } catch (err) {
          console.error("Failed to initialize wallet provider:", err);
          addConsoleLog('danger', `Failed to initialize wallet provider: ${err.message}`);
        }
      } else {
        setProvider(null);
        setSigner(null);
        setAccount("");
        setChainId(null);
      }
    };
    initWallet();
  }, [wallets, fetchOnChainData]);

  // Auto-create embedded wallet if authenticated but no wallet exists
  useEffect(() => {
    if (ready && authenticated && wallets.length === 0) {
      addConsoleLog('info', 'Creating secure embedded wallet for social sign-in...');
      createWallet()
        .then((wallet) => {
          addConsoleLog('success', `Embedded wallet created successfully: ${wallet.address}`);
        })
        .catch((err) => {
          console.error("Failed to create embedded wallet:", err);
          addConsoleLog('danger', `Failed to create embedded wallet: ${err.message || err}`);
        });
    }
  }, [ready, authenticated, wallets, createWallet]);

  // --- Fetch Global Stats from Chain ---
  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const rpcProvider = new ethers.JsonRpcProvider("https://rpc.testnet.chain.robinhood.com");
        const poolAddress = contractAddresses.lendingPool;
        const oracleContract = new ethers.Contract(contractAddresses.priceOracle, priceOracleABI, rpcProvider);
        const usdcContract = new ethers.Contract(contractAddresses.usdc, usdcTokenABI, rpcProvider);

        // 1. Calculate Active Borrows: 1,000,000 USDC - LendingPool USDC Balance
        const poolUsdcBal = await usdcContract.balanceOf(poolAddress);
        const maxInitialUSDC = ethers.parseEther("1000000");
        let activeBorrows = 0n;
        if (maxInitialUSDC > poolUsdcBal) {
          activeBorrows = maxInitialUSDC - poolUsdcBal;
        }
        setGlobalActiveBorrows(parseFloat(ethers.formatEther(activeBorrows)).toFixed(2));

        // 2. Calculate TVL: Sum up the USD values of all stock tokens held by the LendingPool
        let tvlUSD = 0;
        const symbols = Object.keys(contractAddresses.tokens);
        for (const symbol of symbols) {
          const tokenAddress = contractAddresses.tokens[symbol];
          const tokenContract = new ethers.Contract(tokenAddress, rwaTokenABI, rpcProvider);
          
          const poolBal = await tokenContract.balanceOf(poolAddress);
          
          try {
            const price = await oracleContract.getAssetPrice(tokenAddress);
            const formattedPrice = parseFloat(ethers.formatUnits(price, 8));
            const formattedBal = parseFloat(ethers.formatEther(poolBal));
            tvlUSD += formattedBal * formattedPrice;
          } catch (e) {
            console.error(`Failed to load price/balance for ${symbol}:`, e);
          }
        }
        setGlobalTVL(tvlUSD.toFixed(2));
      } catch (err) {
        console.error("Failed to load global protocol stats:", err);
      }
    };

    fetchGlobalStats();
    const interval = setInterval(fetchGlobalStats, 30000);
    return () => clearInterval(interval);
  }, []);



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

    if (amount > availableBorrowCapacity) {
      addConsoleLog('error', `Cannot borrow ${amount} USDC: exceeds available capacity of ${availableBorrowCapacity.toFixed(2)} USDC.`);
      return;
    }

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
              Inside the App Dashboard, clicking <strong>Claim 5x Stock Tokens</strong> will redirect you to the official Robinhood faucet interface to claim your testnet tokens.
            </p>
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

            <h2>On-Chain Stability Fee & Protocol Revenue</h2>
            <p>
              RobinLend charges a time-based <strong>6.12% APY Stability Fee (interest)</strong> on all borrows. This fee accrues dynamically per second on-chain. When a borrower calls <code>repay()</code>, the contract automatically splits the payment:
            </p>
            <ul>
              <li>The principal debt is returned to the pool's liquidity.</li>
              <li>100% of the accrued interest is transferred automatically directly to the <strong>Protocol Treasury Wallet</strong>.</li>
            </ul>

            <h2>Liquidation Protocol Fees</h2>
            <p>
              When a loan is liquidated due to the health factor dropping below 1.00, a total <strong>7% liquidation penalty</strong> is applied to the borrower's position:
            </p>
            <ul>
              <li><strong>5%</strong> of the collateral value is sent to the liquidator as incentive.</li>
              <li><strong>2%</strong> of the collateral value is automatically routed directly to the <strong>Protocol Treasury Wallet</strong> as protocol revenue.</li>
            </ul>
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
                {contractAddresses.treasury && (
                  <tr>
                    <td><strong>Protocol Treasury</strong></td>
                    <td className="docs-address">{contractAddresses.treasury}</td>
                    <td>
                      <a href={`${EXPLORER_URL}/address/${contractAddresses.treasury}`} target="_blank" rel="noreferrer">
                        View <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                )}
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
                <span className="stats-value">{formatStatUSD(globalTVL)}</span>
              </div>
              <div className="stats-item">
                <span className="stats-label">Active Borrows</span>
                <span className="stats-value">{formatStatUSD(globalActiveBorrows)}</span>
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

              <div 
                ref={dropdownRef}
                className="wallet-menu-container" 
                style={{ position: 'relative' }}
              >
                <button 
                  className={`btn-connect ${account ? 'btn-connected' : ''}`}
                  onClick={account ? () => setShowWalletDropdown(!showWalletDropdown) : connectWallet}
                  disabled={web3Loading || (!account && !ready)}
                >
                  <Wallet size={16} />
                  {web3Loading ? 'Connecting...' : !account && !ready ? 'Initializing...' : account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
                </button>

                {account && showWalletDropdown && (
                  <div className="wallet-dropdown-menu">
                    <div className="wallet-dropdown-header">
                      {account}
                    </div>
                    <button className="wallet-dropdown-item" onClick={handleCopyAddress}>
                      {copied ? <Check size={14} style={{ color: 'var(--accent-color)' }} /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy Address'}
                    </button>
                    <button className="wallet-dropdown-item" onClick={() => { setShowWalletDropdown(false); setShowDepositModal(true); }}>
                      <Coins size={14} />
                      Deposit
                    </button>
                    <button className="wallet-dropdown-item" onClick={() => { setShowWalletDropdown(false); setShowWithdrawModal(true); }}>
                      <ArrowRightLeft size={14} />
                      Withdraw
                    </button>
                    <button className="wallet-dropdown-item" onClick={() => { setShowWalletDropdown(false); openUserProfile(); }}>
                      <Settings size={14} />
                      Manage Accounts
                    </button>
                    <button className="wallet-dropdown-item danger" onClick={() => { setShowWalletDropdown(false); logout(); }}>
                      <LogOut size={14} />
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '280px' }}>
                  <button className="btn-connect" onClick={connectWallet} disabled={web3Loading || !ready}>
                    <Wallet size={18} /> {!ready ? 'Initializing...' : 'Connect Web3 Wallet'}
                  </button>
                  <button 
                    className="btn-connect" 
                    onClick={connectWallet} 
                    disabled={web3Loading || !ready}
                    style={{ backgroundColor: '#FFFFFF', color: '#001830', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'block' }}>
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.3 1.53-1.17 2.82-2.43 3.68v3.05h3.9c2.3-2.1 3.67-5.2 3.67-8.56z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.72-2.1-6.66-4.91H1.28v3.15C3.26 21.3 7.37 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.34 14.29A7.16 7.16 0 0 1 5 12c0-.8.14-1.57.38-2.29V6.57H1.28A11.94 11.94 0 0 0 0 12c0 2.05.52 4 1.28 5.71l4.06-3.42z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.93 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.28 6.57l4.06 3.42c.94-2.8 3.56-4.9 6.66-4.9z"/>
                    </svg>
                    {!ready ? 'Initializing...' : 'Sign in with Google'}
                  </button>
                </div>
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
                  <div className="metric-value">${availableBorrowCapacity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div className="metric-subvalue">Max limit: ${parseFloat(borrowCapacityUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: '220px', alignItems: 'flex-end' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <input 
                                  type="number" 
                                  placeholder="0.0" 
                                  className="input-field" 
                                  style={{ height: '34px', padding: '0.4rem 0.6rem', fontSize: '0.9rem', width: '100%' }}
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
                              {availableBorrowCapacity > 0 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  Max: <span className="input-max-btn" onClick={() => setBorrowVal(availableBorrowCapacity.toFixed(2))}>{availableBorrowCapacity.toFixed(2)} USDC</span>
                                </span>
                              )}
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
                      <a 
                        href="https://faucet.testnet.chain.robinhood.com/" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn-faucet primary" 
                        style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        Claim 5x Stock Tokens <ExternalLink size={12} />
                      </a>
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

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal" style={{ alignItems: 'center', textAlign: 'center' }}>
            <button className="wallet-modal-close" onClick={() => setShowDepositModal(false)}>
              ✕
            </button>
            <h3 className="wallet-modal-title" style={{ width: '100%', justifyContent: 'center' }}>
              <Coins size={20} style={{ color: 'var(--accent-color)' }} />
              Deposit
            </h3>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0.25rem 0', lineHeight: '1.4' }}>
              Scan this QR code or copy the address below to transfer assets directly to your embedded on-chain wallet.
            </p>

            <div className="qr-code-placeholder" style={{ marginTop: '0.5rem' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${account}`} 
                alt="Wallet Address QR Code" 
              />
            </div>

            <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.8rem', width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', userSelect: 'all', color: 'var(--text-primary)', boxSizing: 'border-box', marginTop: '0.2rem' }}>
              {account}
            </div>

            <button 
              type="button"
              className="btn-submit" 
              style={{ width: '100%', height: '42px', marginTop: '0.4rem' }}
              onClick={handleCopyAddress}
            >
              {copied ? 'Address Copied!' : 'Copy Wallet Address'}
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal">
            <button className="wallet-modal-close" onClick={() => setShowWithdrawModal(false)}>
              ✕
            </button>
            <h3 className="wallet-modal-title">
              <ArrowRightLeft size={20} style={{ color: 'var(--accent-color)' }} />
              Withdraw
            </h3>
            {/* Asset Selector & Amount Input */}
            <form onSubmit={handleWithdrawFunds} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', marginTop: '0.5rem' }}>
              <div style={{ border: '1.5px solid var(--panel-border)', borderRadius: '8px', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Selected Asset Trigger */}
                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)' }}
                  onClick={() => setShowWithdrawAssetDropdown(!showWithdrawAssetDropdown)}
                >
                  <div className="asset-logo" style={{ backgroundColor: getAssetColor(withdrawAsset), width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#FFFFFF' }}>
                    {withdrawAsset}
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{withdrawAsset}</span>
                  <ChevronRight size={14} style={{ transform: 'rotate(90deg)', color: 'var(--text-secondary)' }} />
                </div>

                {/* Amount Input */}
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: '1.2rem', fontWeight: 600, textAlign: 'right', width: '150px', outline: 'none' }}
                  required
                />

                {/* Withdraw Asset Dropdown menu popup */}
                {showWithdrawAssetDropdown && (
                  <div className="wallet-dropdown-menu" style={{ width: '200px', maxHeight: '200px', overflowY: 'auto', top: '100%', left: '0.5rem', boxSizing: 'border-box' }}>
                    {ALL_ASSETS.map((asset) => (
                      <button 
                        key={asset.symbol}
                        type="button"
                        className="wallet-dropdown-item" 
                        style={{ justifyContent: 'space-between' }}
                        onClick={() => {
                          setWithdrawAsset(asset.symbol);
                          setShowWithdrawAssetDropdown(false);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="asset-logo" style={{ backgroundColor: getAssetColor(asset.symbol), width: '22px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#FFFFFF' }}>
                            {asset.symbol}
                          </div>
                          <span>{asset.symbol}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{getAssetBalance(asset.symbol)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chain details & Max balance info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%', paddingLeft: '0.2rem', boxSizing: 'border-box' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  Chain <span className="network-dot" style={{ backgroundColor: 'var(--accent-color)', width: '6px', height: '6px', borderRadius: '50%' }}></span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Robinhood L2 Testnet</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Max amount: <span className="input-max-btn" onClick={() => setWithdrawAmount(getAssetBalance(withdrawAsset))}>{getAssetBalance(withdrawAsset)} {withdrawAsset}</span>
                </div>
              </div>

              {/* Percentage Selection */}
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '0.2rem' }}>
                {[25, 50, 75, 100].map((pct) => (
                  <button 
                    key={pct}
                    type="button" 
                    className="wallet-dropdown-item" 
                    style={{ flex: 1, height: '34px', justifyContent: 'center', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.02)', fontWeight: 600, fontSize: '0.8rem' }}
                    onClick={() => {
                      const bal = parseFloat(getAssetBalance(withdrawAsset));
                      if (!isNaN(bal) && bal > 0) {
                        setWithdrawAmount(((bal * pct) / 100).toFixed(withdrawAsset === 'ETH' ? 4 : 2));
                      }
                    }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Destination Address Input */}
              <div style={{ marginTop: '0.4rem', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  The withdrawal will be sent to:
                </div>
                <input 
                  type="text" 
                  placeholder="Enter destination address 0x..." 
                  className="input-field" 
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={withdrawRecipient}
                  onChange={(e) => setWithdrawRecipient(e.target.value)}
                  required
                />
              </div>

              {/* Collapsible / Summary block */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.8rem', width: '100%', background: 'rgba(0,0,0,0.15)', marginTop: '0.4rem', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Estimated gas fee:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>0.0001 ETH</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  <span>Transaction speed:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Instant (&lt; 2s)</span>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-submit" 
                style={{ width: '100%', height: '42px', marginTop: '0.5rem' }}
                disabled={withdrawLoading || !withdrawRecipient || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
              >
                {withdrawLoading ? 'Processing Withdrawal...' : !withdrawAmount || parseFloat(withdrawAmount) <= 0 ? 'Enter Amount' : `Withdraw ${withdrawAmount} ${withdrawAsset}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
