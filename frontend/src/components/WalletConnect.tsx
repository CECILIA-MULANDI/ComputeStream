import { useState, useEffect } from 'react';
import {
  connectWallet,
  disconnectWallet,
  getWalletState,
  isWalletAvailable,
  getWalletInstallUrl,
  type WalletType,
} from '../services/walletIntegration';

interface WalletConnectProps {
  onConnectionChange?: (connected: boolean, address: string | null) => void;
}

export function WalletConnect({ onConnectionChange }: WalletConnectProps = {}) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check wallet state on mount
    const state = getWalletState();
    setConnected(state.connected);
    setAddress(state.address);
    // Notify parent on initial mount
    onConnectionChange?.(state.connected, state.address);
  }, []);

  const handleConnect = async (walletType: WalletType = 'razor') => {
    try {
      setLoading(true);
      setError(null);

      if (!isWalletAvailable()) {
        const installUrl = getWalletInstallUrl(walletType);
        setError(
          `Wallet not found. Please install ${walletType} wallet extension.`
        );
        window.open(installUrl, '_blank');
        return;
      }

      const walletAddress = await connectWallet(walletType);
      setConnected(true);
      setAddress(walletAddress);
      onConnectionChange?.(true, walletAddress);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      console.error('Wallet connection error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      setConnected(false);
      setAddress(null);
      setError(null);
      onConnectionChange?.(false, null);
    } catch (err: any) {
      console.error('Wallet disconnection error:', err);
    }
  };

  return (
    <div className="wallet-connect">
      {!connected ? (
        <div className="space-y-4">
          <button
            onClick={() => handleConnect('razor')}
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
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
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
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
              </span>
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-400 text-center">
            Connect your Movement wallet to enable x402 payments
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Connected Wallet</p>
                <p className="text-green-400 font-mono text-sm mt-1">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-500 text-sm font-semibold">
                  Connected
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors duration-200"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

