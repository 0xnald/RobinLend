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

export default function App() {
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

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">R</div>
          <div className="brand-text">Robin<span>Lend</span></div>
          <span className="brand-subtitle" style={{ marginLeft: '10px', verticalAlign: 'middle', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RWA Compliance Vault</span>
        </div>
        
        <div className="header-actions">
          {account && (
            <div className={`network-badge ${isWrongNetwork ? 'danger' : 'robinhood'}`} style={isWrongNetwork ? {color: 'var(--danger-color)', background: 'rgba(255,59,48,0.1)', borderColor: 'rgba(255,59,48,0.2)'} : {}}>
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
          <div className="brand-logo" style={{ width: '64px', height: '64px', fontSize: '2rem', borderRadius: '18px' }}>R</div>
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
  );
}
