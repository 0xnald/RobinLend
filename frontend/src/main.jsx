import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { defineChain } from 'viem'
import contractAddresses from './config.json'
import './index.css'
import App from './App.jsx'

const robinhoodChain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  network: 'robinhood-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.chain.robinhood.com'],
    },
    public: {
      http: ['https://rpc.testnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
});

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || contractAddresses.privyAppId;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#30B888',
          showWalletLoginFirst: true,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets'
          }
        },
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
)
