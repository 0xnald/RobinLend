import React, { useState, useEffect } from 'react';
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

// Mock ABI data for UI interaction in mock-mode
// and for ethers contract calls in live-mode.
const kycRegistryABI = [
  "function isVerified(address user) view returns (bool)",
  "function setKYCStatus(address user, bool status) external"
];
const rwaTokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
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

// Mock contract addresses (these will be updated upon deployment, or defaults will be used)
const CONTRACT_ADDRESSES = {
  kycRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  iUST: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  usdc: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  lendingPool: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  priceOracle: "0xDc64a140Aa3E981100a9becA4E685f962f0cf6C9"
};

export default function App() {
  // --- Web3 State ---
  const [isWeb3Mode, setIsWeb3Mode] = useState(false); // Toggle between Web3 and Mock mode
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [web3Loading, setWeb3Loading] = useState(false);

  // --- Account State (Balances & Positions) ---
  const [kycStatus, setKycStatus] = useState(false);
  const [rwaBalance, setRwaBalance] = useState("150.0"); // 150 iUST
  const [usdcBalance, setUsdcBalance] = useState("5000.0"); // $5000 USDC
  const [collateralDeposited, setCollateralDeposited] = useState("0.0");
  const [borrowedAmount, setBorrowedAmount] = useState("0.0");
  const [healthFactor, setHealthFactor] = useState("9999.0"); // Infinite initially
  
  // Prices
  const rwaPrice = 100.00; // Fixed mock price $100.00
  const usdcPrice = 1.00; // Pegged

  // Inputs
  const [depositVal, setDepositVal] = useState("");
  const [withdrawVal, setWithdrawVal] = useState("");
  const [borrowVal, setBorrowVal] = useState("");
  const [repayVal, setRepayVal] = useState("");

  // Loading & Transaction Logs
  const [txLoading, setTxLoading] = useState(false);
  const [gaslessEnabled, setGaslessEnabled] = useState(true); // Default to sponsored smart account
  const [consoleLogs, setConsoleLogs] = useState([
    { type: 'info', text: 'RobinLend Smart Relayer Console initialized.' },
    { type: 'info', text: 'Ready to sponsor gas via ZeroDev / Pimlico ERC-4337 Paymaster.' }
  ]);
  const [activeNode, setActiveNode] = useState(null); // Node for ERC-4337 execution animation

  // Computed Values
  const collateralValueUSD = parseFloat(collateralDeposited) * rwaPrice;
  const borrowCapacityUSD = collateralValueUSD * 0.70; // 70% LTV
  const remainingBorrowCapacityUSD = Math.max(0, borrowCapacityUSD - parseFloat(borrowedAmount));

  // --- Add/Switch Robinhood Testnet Network ---
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
              blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com']
            }]
          });
        } catch (addError) {
          console.error("Failed to add network", addError);
        }
      }
    }
  };

  // --- Connect Wallet ---
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Metamask or an EVM wallet is required for Live mode!");
      return;
    }
    setWeb3Loading(true);
    try {
      const tempProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await tempProvider.send("eth_requestAccounts", []);
      const tempSigner = await tempProvider.getSigner();
      const network = await tempProvider.getNetwork();

      setProvider(tempProvider);
      setSigner(tempSigner);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setIsWeb3Mode(true);
      
      addConsoleLog('success', `Connected Wallet: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
      
      // If chainId is incorrect, trigger switch
      if (Number(network.chainId) !== 46630) {
        addConsoleLog('warning', `Incorrect network. Please switch to Robinhood Chain Testnet (Chain ID 46630).`);
        await switchNetwork();
      }
    } catch (err) {
      console.error(err);
      addConsoleLog('danger', `Wallet connection failed: ${err.message}`);
    }
    setWeb3Loading(false);
  };

  const addConsoleLog = (type, text) => {
    setConsoleLogs(prev => [...prev, { type, text, timestamp: new Date().toLocaleTimeString() }]);
  };

  // --- Mock Blockchain Actions (Visual Simulation of AA) ---
  const simulateAA = async (actionName, calldataStr, executeActionCallback) => {
    setTxLoading(true);
    setConsoleLogs([]); // Clear logs for clean visual execution
    addConsoleLog('info', `[SmartAccount] Initiating sponsored transaction for: ${actionName}`);
    
    // Step 1: UserOp Creation
    setActiveNode('smartaccount');
    addConsoleLog('info', `[ERC-4337] Building UserOperation...`);
    addConsoleLog('hash', `Sender: ${account || '0xSmartAccountWalletProxyAddress'}`);
    addConsoleLog('hash', `CallData: ${calldataStr}`);
    await new Promise(r => setTimeout(r, 800));

    // Step 2: Signature
    addConsoleLog('info', `[Signer] Signing UserOperation hash with EOA key...`);
    await new Promise(r => setTimeout(r, 600));

    // Step 3: Bundler
    setActiveNode('bundler');
    addConsoleLog('info', `[Pimlico Bundler] Receiving signed UserOperation. Simulating gas validation...`);
    await new Promise(r => setTimeout(r, 800));

    // Step 4: Paymaster Gas Sponsorship
    setActiveNode('paymaster');
    addConsoleLog('success', `[ZeroDev Paymaster] Sponsoring Gas! Sponsoring 0.00012 ETH gas fees.`);
    addConsoleLog('hash', `Gas Token: ETH | Sponsored Status: APPROVED`);
    await new Promise(r => setTimeout(r, 800));

    // Step 5: EntryPoint execution on Robinhood Chain L2
    setActiveNode('entrypoint');
    addConsoleLog('info', `[EntryPoint] Executing UserOperation bundle on Robinhood L2 (Chain ID 46630)...`);
    await new Promise(r => setTimeout(r, 800));

    // Step 6: Success!
    setActiveNode(null);
    executeActionCallback();
    setTxLoading(false);
    
    const mockTxHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
    addConsoleLog('success', `[Robinhood L2] Transaction Confirmed in Block #${Math.floor(Math.random()*100000) + 1200000}`);
    addConsoleLog('hash', `Tx Hash: ${mockTxHash}`);
  };

  // --- Handlers ---
  const handleVerifyKYC = () => {
    if (gaslessEnabled) {
      simulateAA("KYC verification", "KYCRegistry.setKYCStatus(user, true)", () => {
        setKycStatus(true);
        addConsoleLog('success', 'Robinhood Verified Credentials successfully associated with wallet!');
      });
    } else {
      // Direct Web3 Mode or simple EOA mock
      setKycStatus(true);
      addConsoleLog('success', 'User KYC verification completed.');
    }
  };

  const handleDeposit = () => {
    const amount = parseFloat(depositVal);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > parseFloat(rwaBalance)) {
      alert("Insufficient RWA balance!");
      return;
    }

    const performDeposit = () => {
      setRwaBalance(prev => (parseFloat(prev) - amount).toFixed(1));
      setCollateralDeposited(prev => (parseFloat(prev) + amount).toFixed(1));
      setDepositVal("");
      addConsoleLog('success', `Deposited ${amount} iUST Collateral into Lending Pool.`);
    };

    if (gaslessEnabled) {
      simulateAA("Deposit Collateral", `LendingPool.depositCollateral(iUST, ${amount})`, performDeposit);
    } else {
      performDeposit();
    }
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawVal);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > parseFloat(collateralDeposited)) {
      alert("Insufficient deposited collateral!");
      return;
    }

    // Verify health factor doesn't drop below 1
    const newCollateral = parseFloat(collateralDeposited) - amount;
    const newCollateralValueUSD = newCollateral * rwaPrice;
    const newCapacity = newCollateralValueUSD * 0.70;
    const currentBorrow = parseFloat(borrowedAmount);
    
    if (currentBorrow > 0 && currentBorrow > newCapacity) {
      alert("Cannot withdraw! Action would drop Health Factor below 1.0.");
      return;
    }

    const performWithdraw = () => {
      setCollateralDeposited(prev => (parseFloat(prev) - amount).toFixed(1));
      setRwaBalance(prev => (parseFloat(prev) + amount).toFixed(1));
      setWithdrawVal("");
      addConsoleLog('success', `Withdrew ${amount} iUST Collateral back to wallet.`);
    };

    if (gaslessEnabled) {
      simulateAA("Withdraw Collateral", `LendingPool.withdrawCollateral(iUST, ${amount})`, performWithdraw);
    } else {
      performWithdraw();
    }
  };

  const handleBorrow = () => {
    const amount = parseFloat(borrowVal);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > remainingBorrowCapacityUSD) {
      alert("Borrow amount exceeds remaining borrow capacity!");
      return;
    }

    const performBorrow = () => {
      setBorrowedAmount(prev => (parseFloat(prev) + amount).toFixed(1));
      setUsdcBalance(prev => (parseFloat(prev) + amount).toFixed(1));
      setBorrowVal("");
      addConsoleLog('success', `Borrowed $${amount} USDC from Lending Pool.`);
    };

    if (gaslessEnabled) {
      simulateAA("Borrow USDC", `LendingPool.borrow(${amount})`, performBorrow);
    } else {
      performBorrow();
    }
  };

  const handleRepay = () => {
    const amount = parseFloat(repayVal);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > parseFloat(usdcBalance)) {
      alert("Insufficient USDC balance to repay!");
      return;
    }
    if (amount > parseFloat(borrowedAmount)) {
      alert("Repayment amount exceeds total borrowed amount!");
      return;
    }

    const performRepay = () => {
      setBorrowedAmount(prev => (parseFloat(prev) - amount).toFixed(1));
      setUsdcBalance(prev => (parseFloat(prev) - amount).toFixed(1));
      setRepayVal("");
      addConsoleLog('success', `Repaid $${amount} USDC of borrowed debt.`);
    };

    if (gaslessEnabled) {
      simulateAA("Repay USDC", `LendingPool.repay(${amount})`, performRepay);
    } else {
      performRepay();
    }
  };

  const handleUSDCFaucet = () => {
    setUsdcBalance(prev => (parseFloat(prev) + 1000.0).toFixed(1));
    addConsoleLog('success', 'Claimed 1,000 mock USDC from testnet faucet.');
  };

  const handleRWAFaucet = () => {
    if (!kycStatus) {
      alert("You must clear KYC status before minting compliant RWA tokens!");
      return;
    }
    setRwaBalance(prev => (parseFloat(prev) + 50.0).toFixed(1));
    addConsoleLog('success', 'Minted 50 iUST (compliant US Treasuries) to wallet.');
  };

  // Re-calculate Health Factor
  useEffect(() => {
    const collateral = parseFloat(collateralDeposited);
    const borrow = parseFloat(borrowedAmount);
    if (borrow === 0) {
      setHealthFactor("9999.0");
    } else {
      const collateralValue = collateral * rwaPrice;
      const capacity = collateralValue * 0.70;
      const health = (capacity / borrow).toFixed(2);
      setHealthFactor(health);
    }
  }, [collateralDeposited, borrowedAmount]);

  // CSS Health Factor Color classes
  const getHealthClass = (hf) => {
    const val = parseFloat(hf);
    if (val > 1.5) return "health-good";
    if (val >= 1.0) return "health-warning";
    return "health-danger";
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">R</div>
          <div className="brand-text">Robin<span>Lend</span></div>
          <span className="brand-subtitle" style={{ marginLeft: '10px', verticalAlign: 'middle', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RWA-backed Compliance DeFi</span>
        </div>
        
        <div className="header-actions">
          <div className={`network-badge ${isWeb3Mode ? 'web3' : 'robinhood'}`}>
            <div className="network-dot"></div>
            {isWeb3Mode ? 'Robinhood L2 Live' : 'Robinhood L2 Testnet (Simulated)'}
          </div>

          <div className="toggle-container">
            <span style={{ fontSize: '0.75rem' }}>ERC-4337 Sponsored Gas</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={gaslessEnabled} 
                onChange={(e) => setGaslessEnabled(e.target.checked)} 
              />
              <span className="slider"></span>
            </label>
          </div>

          <button 
            className={`btn-connect ${isWeb3Mode ? 'btn-connected' : ''}`}
            onClick={connectWallet}
            disabled={web3Loading}
          >
            <Wallet size={16} />
            {web3Loading ? 'Connecting...' : account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
          </button>
        </div>
      </header>

      {/* Compliance Banner */}
      <div className="compliance-banner">
        <div className="compliance-info">
          <div className="compliance-icon">
            {kycStatus ? <ShieldCheck size={28} /> : <ShieldAlert size={28} style={{ color: 'var(--warning-color)' }} />}
          </div>
          <div className="compliance-text">
            <h4>{kycStatus ? 'Robinhood Identity Status: KYC CLEARED' : 'Robinhood Identity Status: KYC REQUIRED'}</h4>
            <p>{kycStatus ? 'Your account is fully whitelisted to mint, trade, and lend compliant real-world assets.' : 'Deploying compliant financial assets requires a verified identity registry connection. Click verify to whitelist your wallet.'}</p>
          </div>
        </div>
        {!kycStatus ? (
          <button className="btn-verify" onClick={handleVerifyKYC} disabled={txLoading}>
            Verify Wallet
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
          <div className="metric-value">${collateralValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="metric-subvalue">{collateralDeposited} iUST deposited</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Debt</div>
          <div className="metric-value">${parseFloat(borrowedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="metric-subvalue">{borrowedAmount} USDC borrowed</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Available Borrow Capacity</div>
          <div className="metric-value">${remainingBorrowCapacityUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="metric-subvalue">70% Max LTV ratio limit</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Health Factor</div>
          <div className={`metric-value ${getHealthClass(healthFactor)}`}>
            {parseFloat(healthFactor) > 9000 ? '∞' : healthFactor}
          </div>
          <div className="metric-subvalue">Liquidation triggers at &lt; 1.00</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Assets & Tables */}
        <div className="main-column">
          {/* Collateral Assets Panel */}
          <div className="panel">
            <div className="panel-title">
              <div>Depositable Real-World Assets (Collateral)</div>
              <div className="panel-subtitle">Tokenized securities clearing regulatory standards</div>
            </div>
            
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>Wallet Balance</th>
                  <th>Deposited</th>
                  <th>RWA Yield (APY)</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="asset-info">
                      <div className="asset-logo ust">UST</div>
                      <div>
                        <div className="asset-symbol">iUST</div>
                        <div className="asset-name">US Treasury Bills</div>
                      </div>
                    </div>
                  </td>
                  <td className="asset-price">${rwaPrice.toFixed(2)}</td>
                  <td>{rwaBalance} iUST</td>
                  <td style={{ fontWeight: 600 }}>{collateralDeposited} iUST</td>
                  <td className="asset-yield">5.24% <TrendingUp size={12} style={{ display: 'inline', marginLeft: '3px' }} /></td>
                  <td className="asset-action-cell">
                    <div style={{ display: 'inline-flex', gap: '0.5rem', width: '220px' }}>
                      <input 
                        type="number" 
                        placeholder="0.0" 
                        className="input-field" 
                        style={{ height: '34px', padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
                        value={depositVal}
                        onChange={(e) => setDepositVal(e.target.value)}
                        disabled={txLoading || !kycStatus}
                      />
                      <button 
                        className="btn-submit" 
                        style={{ height: '34px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap', width: 'auto' }}
                        onClick={handleDeposit}
                        disabled={txLoading || !kycStatus || !depositVal}
                      >
                        Deposit
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Simulated Yield Trend line chart */}
            <div className="chart-container">
              <div style={{ position: 'absolute', top: 5, left: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>iUST Treasury Yield Performance (30D Index)</div>
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

            {/* Withdraw collapsible panel inside RWA Collateral */}
            {parseFloat(collateralDeposited) > 0 && (
              <div className="action-box" style={{ marginTop: '0.5rem' }}>
                <div className="input-container">
                  <div className="input-label-row">
                    <span>Withdraw iUST Collateral</span>
                    <span>Max: <span className="input-max-btn" onClick={() => setWithdrawVal(collateralDeposited)}>{collateralDeposited} iUST</span></span>
                  </div>
                  <div className="input-wrapper">
                    <input 
                      type="number" 
                      placeholder="0.0" 
                      className="input-field" 
                      value={withdrawVal}
                      onChange={(e) => setWithdrawVal(e.target.value)}
                      disabled={txLoading}
                    />
                    <span className="input-token-tag">iUST</span>
                  </div>
                </div>
                <button 
                  className="btn-submit btn-danger" 
                  onClick={handleWithdraw}
                  disabled={txLoading || !withdrawVal}
                >
                  Withdraw iUST
                </button>
              </div>
            )}
          </div>

          {/* Borrow Stablecoins Panel */}
          <div className="panel">
            <div className="panel-title">
              <div>Borrow Stablecoins</div>
              <div className="panel-subtitle">Access liquid capital backed by regulatory assets</div>
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
                        disabled={txLoading || parseFloat(collateralDeposited) === 0}
                      />
                      <button 
                        className="btn-submit" 
                        style={{ height: '34px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap', width: 'auto' }}
                        onClick={handleBorrow}
                        disabled={txLoading || parseFloat(collateralDeposited) === 0 || !borrowVal}
                      >
                        Borrow
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Repay Box collapsible */}
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

        {/* Right Column: AA Console Visualizer */}
        <div className="main-column" style={{ gap: '1rem' }}>
          {/* ZeroDev Account Abstraction Console panel */}
          <div className="panel" style={{ display: 'flex', flexSpace: '1', flexDirection: 'column', minHeight: '400px' }}>
            <div className="panel-title" style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={18} style={{ color: 'var(--accent-color)' }} />
                <span>ZeroDev Gas Relayer Console</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ERC-4337 Account Abstraction</span>
            </div>

            {/* Animation flow visualizer */}
            {gaslessEnabled && (
              <div className="userop-visualizer">
                <div className={`visualizer-node`}>
                  <div className={`node-icon ${txLoading && activeNode === 'smartaccount' ? 'active' : ''}`}>
                    <Cpu size={14} />
                  </div>
                  <div className="node-label">UserOp</div>
                </div>
                <div className={`node-arrow ${txLoading && activeNode === 'smartaccount' ? 'active' : ''}`}><ChevronRight size={14} /></div>
                
                <div className={`visualizer-node`}>
                  <div className={`node-icon ${txLoading && activeNode === 'bundler' ? 'active' : ''}`}>
                    <ArrowRightLeft size={14} />
                  </div>
                  <div className="node-label">Bundler</div>
                </div>
                <div className={`node-arrow ${txLoading && activeNode === 'bundler' ? 'active' : ''}`}><ChevronRight size={14} /></div>
                
                <div className={`visualizer-node`}>
                  <div className={`node-icon ${txLoading && activeNode === 'paymaster' ? 'active' : ''}`}>
                    <Coins size={14} />
                  </div>
                  <div className="node-label">Paymaster</div>
                </div>
                <div className={`node-arrow ${txLoading && activeNode === 'paymaster' ? 'active' : ''}`}><ChevronRight size={14} /></div>
                
                <div className={`visualizer-node`}>
                  <div className={`node-icon ${txLoading && activeNode === 'entrypoint' ? 'active' : ''}`}>
                    <ShieldCheck size={14} />
                  </div>
                  <div className="node-label">L2 Node</div>
                </div>
              </div>
            )}

            {/* Output console log */}
            <div className="explorer-panel" style={{ flex: '1' }}>
              <div className="explorer-title">
                <span>Relayer Node Status</span>
                <span className="explorer-status-badge">
                  {txLoading ? 'PROCESSING UserOp' : 'LISTENING'}
                </span>
              </div>
              
              {consoleLogs.map((log, index) => (
                <div key={index} className={`explorer-log-item ${log.type}`}>
                  {log.timestamp && <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>[{log.timestamp}]</span>}
                  {log.text}
                </div>
              ))}
              {txLoading && (
                <div className="explorer-log-item info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeftColor: 'var(--accent-color)' }}>
                  <div className="spinner"></div> Mining transaction on Robinhood Chain L2...
                </div>
              )}
            </div>
          </div>

          {/* Test Faucets Controls Card */}
          <div className="panel" style={{ paddingBottom: '2.5rem' }}>
            <div className="panel-title">
              <div>Robinhood Testnet Faucets</div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Claim mock tokens to test RWA collateralized borrowing positions.</p>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-faucet" onClick={handleUSDCFaucet}>
                +1,000 USDC Faucet
              </button>
              <button className="btn-faucet primary" onClick={handleRWAFaucet}>
                +50 iUST RWA Faucet
              </button>
            </div>
            
            <div className="faucet-row">
              <div className="faucet-info">
                <span className="faucet-title">Robinhood Chain Gas Faucet</span>
                <span className="faucet-desc">Get testnet ETH gas tokens</span>
              </div>
              <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer" className="btn-faucet" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Open Faucet <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
