import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { providerApi } from '../api';
import {
  getWalletState,
  signTransaction,
} from '../services/walletIntegration';
import { WalletConnect } from '../components/WalletConnect';

export function ProviderRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minStake, setMinStake] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    gpuType: '',
    vramGB: '',
    pricePerSecond: '',
    stakeAmount: '',
  });

  // Check wallet state on mount
  useEffect(() => {
    const state = getWalletState();
    setConnected(state.connected);
    setWalletAddress(state.address);
  }, []);

  useEffect(() => {
    const loadMinStake = async () => {
      try {
        const data = await providerApi.getMinStake();
        setMinStake(data.minStakeAmountMOVE);
        setFormData((prev) => ({
          ...prev,
          stakeAmount: data.minStakeAmountMOVE.toString(),
        }));
      } catch (err) {
        console.error('Failed to load min stake:', err);
      }
    };

    loadMinStake();
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!connected || !walletAddress) {
      setError('Please connect your wallet first');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const priceInOctas = Math.floor(Number(formData.pricePerSecond) * 100000000);
      const stakeInOctas = Math.floor(Number(formData.stakeAmount) * 100000000);
      
      // Sign the registration transaction with wallet
      const CONTRACT_ADDRESS = '0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1';
      
      const txArgs = {
        gpuType: formData.gpuType,
        vramGB: Number(formData.vramGB),
        priceInOctas,
        stakeInOctas,
      };
      
      console.log('=== REGISTRATION DETAILS ===');
      console.log('Contract:', CONTRACT_ADDRESS);
      console.log('Function:', `${CONTRACT_ADDRESS}::provider_registry::register_provider`);
      console.log('Arguments:', txArgs);
      console.log('Wallet address:', walletAddress);
      console.log('============================');
      
     
      const txHash = await signTransaction({
        function: `${CONTRACT_ADDRESS}::provider_registry::register_provider`,
        typeArguments: [],
        functionArguments: [
          txArgs.gpuType,        // String
          txArgs.vramGB,         // u64
          txArgs.priceInOctas,   // u64
          txArgs.stakeInOctas,   // u64
        ],
      });

      console.log('Registration tx:', txHash);
      
      // Sync to database
      try {
        await fetch('/api/v1/providers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: walletAddress,
            txHash,
            gpuType: formData.gpuType,
            vramGB: Number(formData.vramGB),
            pricePerSecond: priceInOctas,
            stakeAmount: stakeInOctas,
          }),
        });
        console.log('Provider synced to database');
      } catch (syncErr) {
        console.warn('Could not sync to database:', syncErr);
        // Continue - registration succeeded on-chain
      }

      alert(`Provider registered successfully!\nAddress: ${walletAddress}\nTx: ${txHash}`);
      navigate('/providers');
    } catch (err: any) {
      console.error('Registration error:', err);
      const errorMessage = err.message || 'Registration failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Register as Provider</h1>
        <p className="text-gray-400">
          Register your GPU to start earning from compute jobs
        </p>
      </div>

      <div className="card-modern">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-400 mb-1">Registration Failed</h3>
                  <pre className="text-xs text-red-300 whitespace-pre-wrap break-words font-mono bg-red-500/10 p-3 rounded-lg overflow-auto max-h-48">
                    {error}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="gpuType" className="block text-sm font-semibold text-gray-300 mb-2">
              GPU Type
            </label>
            <input
              type="text"
              id="gpuType"
              required
              value={formData.gpuType}
              onChange={(e) => setFormData({ ...formData, gpuType: e.target.value })}
              className="input-modern"
              placeholder="e.g., RTX 4090, A100, H100"
            />
          </div>

          <div>
            <label htmlFor="vramGB" className="block text-sm font-semibold text-gray-300 mb-2">
              VRAM (GB)
            </label>
            <input
              type="number"
              id="vramGB"
              required
              min="1"
              value={formData.vramGB}
              onChange={(e) => setFormData({ ...formData, vramGB: e.target.value })}
              className="input-modern"
              placeholder="24"
            />
          </div>

          <div>
            <label htmlFor="pricePerSecond" className="block text-sm font-semibold text-gray-300 mb-2">
              Price Per Second (MOVE)
            </label>
            <input
              type="number"
              id="pricePerSecond"
              required
              min="0"
              step="0.00000001"
              value={formData.pricePerSecond}
              onChange={(e) => setFormData({ ...formData, pricePerSecond: e.target.value })}
              className="input-modern"
              placeholder="0.0001"
            />
            <p className="mt-2 text-xs text-gray-400">
              Price in MOVE tokens per second of compute
            </p>
          </div>

          <div>
            <label htmlFor="stakeAmount" className="block text-sm font-semibold text-gray-300 mb-2">
              Stake Amount (MOVE)
            </label>
            <input
              type="number"
              id="stakeAmount"
              required
              min={minStake || 0}
              step="0.1"
              value={formData.stakeAmount}
              onChange={(e) => setFormData({ ...formData, stakeAmount: e.target.value })}
              className="input-modern"
            />
            <p className="mt-2 text-xs text-gray-400">
              Minimum stake: {minStake !== null ? `${minStake} MOVE` : 'Loading...'}
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => navigate('/providers')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !connected}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Registering...' : 'Register Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

