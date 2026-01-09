import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { providerApi } from '../api';
import {
  getWalletState,
  signTransaction,
} from '../services/walletIntegration';

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
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Register as Provider</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register your GPU to start earning from compute jobs
          </p>
        </div>

        {!connected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              ⚠️ Please connect your wallet in the navigation bar to register as a provider.
            </p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800 mb-2">Registration Failed</h3>
                    <pre className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono bg-red-100 p-2 rounded overflow-auto max-h-64">
                      {error}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="gpuType" className="block text-sm font-medium text-gray-700">
                GPU Type
              </label>
              <input
                type="text"
                id="gpuType"
                required
                value={formData.gpuType}
                onChange={(e) => setFormData({ ...formData, gpuType: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="e.g., RTX 4090, A100, H100"
              />
            </div>

            <div>
              <label htmlFor="vramGB" className="block text-sm font-medium text-gray-700">
                VRAM (GB)
              </label>
              <input
                type="number"
                id="vramGB"
                required
                min="1"
                value={formData.vramGB}
                onChange={(e) => setFormData({ ...formData, vramGB: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="24"
              />
            </div>

            <div>
              <label htmlFor="pricePerSecond" className="block text-sm font-medium text-gray-700">
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
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="0.0001"
              />
              <p className="mt-1 text-xs text-gray-500">
                Price in MOVE tokens per second of compute
              </p>
            </div>

            <div>
              <label htmlFor="stakeAmount" className="block text-sm font-medium text-gray-700">
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
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum stake: {minStake !== null ? `${minStake} MOVE` : 'Loading...'}
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate('/providers')}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loading ? 'Registering...' : 'Register Provider'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

