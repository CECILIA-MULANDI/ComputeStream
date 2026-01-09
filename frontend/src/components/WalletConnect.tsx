import { useState, useEffect } from 'react';
import {
  connectWallet,
  disconnectWallet,
  getWalletState,
  isWalletAvailable,
  getWalletInstallUrl,
  restoreWalletConnection,
} from '../services/walletIntegration';

interface WalletConnectProps {
  onConnectionChange?: (connected: boolean, address: string | null) => void;
}

export function WalletConnect({ onConnectionChange }: WalletConnectProps = {}) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Restore wallet connection on mount
    const initWallet = async () => {
      setLoading(true);
      try {
        const restored = await restoreWalletConnection();
        const state = getWalletState();
        setConnected(state.connected);
        setAddress(state.address);
        // Notify parent on initial mount
        onConnectionChange?.(state.connected, state.address);
        
        if (restored && state.connected) {
          console.log('✅ Wallet connection restored on page load');
        }
      } catch (error) {
        console.error('Failed to restore wallet connection:', error);
        // Still try to get state even if restore failed
        const state = getWalletState();
        setConnected(state.connected);
        setAddress(state.address);
        onConnectionChange?.(state.connected, state.address);
      } finally {
        setLoading(false);
      }
    };
    initWallet();
  }, []);

  const handleConnect = async () => {
    try {
      setLoading(true);

      if (!isWalletAvailable()) {
        const installUrl = getWalletInstallUrl();
        window.open(installUrl, '_blank');
        alert('Nightly wallet not found. Please install Nightly wallet extension.');
        return;
      }

      await connectWallet();
      const state = getWalletState();
      setConnected(state.connected);
      setAddress(state.address);
      onConnectionChange?.(state.connected, state.address);
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      alert(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      const state = getWalletState();
      setConnected(state.connected);
      setAddress(state.address);
      onConnectionChange?.(state.connected, state.address);
    } catch (err: any) {
      console.error('Wallet disconnection error:', err);
    }
  };

  return (
    <div className="wallet-connect">
      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-md hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Connect Wallet
            </>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-green-700 font-mono text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

