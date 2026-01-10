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
  compact?: boolean;
}

export function WalletConnect({ onConnectionChange, compact = false }: WalletConnectProps = {}) {
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


  if (compact) {
    return (
      <div className="wallet-connect h-full flex items-center">
        {!connected ? (
          <button
            onClick={() => handleConnect('razor')}
            disabled={loading}
            className="h-10 px-6 bg-white text-dark-950 text-sm font-bold rounded-full hover:bg-gray-100 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            title={error || 'Connect your wallet'}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span className="hidden sm:inline">Connecting...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 flex-shrink-0"
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
                <span className="hidden sm:inline">Connect</span>
                <span className="sm:hidden">Wallet</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg h-9">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
              <span className="text-green-400 font-mono text-xs font-semibold hidden sm:inline">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <span className="text-green-400 font-mono text-xs font-semibold sm:hidden">
                {address?.slice(0, 4)}...{address?.slice(-3)}
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="h-9 px-3 bg-dark-700/50 border border-dark-600 text-gray-300 text-xs font-medium rounded-lg hover:bg-dark-600 hover:border-dark-500 transition-all duration-200"
              title="Disconnect wallet"
            >
              <span className="hidden sm:inline">Disconnect</span>
              <svg className="sm:hidden w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full version for pages/cards
  return (
    <div className="wallet-connect">
      {!connected ? (
        <div className="space-y-4">
          <button
            onClick={() => handleConnect('razor')}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
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
                <span>Connect Wallet</span>
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-400 text-center">
            Connect your Movement wallet to enable x402 payments
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-1">Connected Wallet</p>
                <p className="text-green-400 font-mono text-sm font-semibold">
                  {address?.slice(0, 8)}...{address?.slice(-6)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-semibold">
                  Connected
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="btn-secondary w-full text-sm"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

