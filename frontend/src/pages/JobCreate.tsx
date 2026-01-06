import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { computeApi, providerApi } from '../api';
import { WalletConnect } from '../components/WalletConnect';
import { getWalletState } from '../services/walletIntegration';
import type { Provider } from '../types';

export function JobCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [formData, setFormData] = useState({
    providerAddress: searchParams.get('provider') || '',
    dockerImage: '',
    duration: '3600',
    privateKey: '',
  });

  // Check wallet connection on mount
  useEffect(() => {
    const state = getWalletState();
    setWalletConnected(state.connected);
  }, []);

  // Handle wallet connection changes
  const handleWalletChange = (connected: boolean, _address: string | null) => {
    setWalletConnected(connected);
    // Clear error when wallet connects
    if (connected && error?.includes('Wallet not connected')) {
      setError(null);
    }
  };

  useEffect(() => {
    loadProviders();
    if (formData.providerAddress) {
      loadProviderDetails();
    }
  }, [formData.providerAddress]);

  const loadProviders = async () => {
    try {
      const data = await providerApi.list(true);
      setProviders(data);
      if (formData.providerAddress) {
        const provider = data.find((p) => p.address === formData.providerAddress);
        if (provider) setSelectedProvider(provider);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  };

  const loadProviderDetails = async () => {
    try {
      const provider = await providerApi.get(formData.providerAddress);
      setSelectedProvider(provider);
    } catch (err) {
      console.error('Failed to load provider details:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await computeApi.execute({
        providerAddress: formData.providerAddress,
        dockerImage: formData.dockerImage,
        duration: Number(formData.duration),
        privateKey: formData.privateKey || undefined,
      });

      if (result.job && result.job.jobId) {
        navigate(`/jobs/${result.job.buyerAddress}/${result.job.jobId}`);
      } else {
        alert('Job access granted! You can now create the job manually.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Job creation failed');
    } finally {
      setLoading(false);
    }
  };

  const estimatedCost = selectedProvider
    ? (selectedProvider.pricePerSecond * Number(formData.duration)) / 100000000
    : 0;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Compute Job</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create a new compute job with x402 payment verification
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="bg-gray-800 shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">💳 Wallet Connection</h2>
          <WalletConnect onConnectionChange={handleWalletChange} />
          {!walletConnected && (
            <p className="mt-3 text-yellow-400 text-sm">
              ⚠️ Connect your wallet to enable x402 payments
            </p>
          )}
        </div>

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
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="providerAddress" className="block text-sm font-medium text-gray-700">
                Provider Address
              </label>
              <select
                id="providerAddress"
                required
                value={formData.providerAddress}
                onChange={(e) => {
                  setFormData({ ...formData, providerAddress: e.target.value });
                  const provider = providers.find((p) => p.address === e.target.value);
                  setSelectedProvider(provider || null);
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              >
                <option value="">Select a provider</option>
                {providers.map((provider) => (
                  <option key={provider.address} value={provider.address}>
                    {provider.gpuType} - {provider.address.slice(0, 10)}... ({provider.isActive ? 'Active' : 'Inactive'})
                  </option>
                ))}
              </select>
              {selectedProvider && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">{selectedProvider.gpuType}</div>
                    <div className="text-gray-600">
                      {selectedProvider.vramGB} GB VRAM · {selectedProvider.reputationScore} reputation
                    </div>
                    <div className="text-gray-600">
                      Price: {(selectedProvider.pricePerSecond / 100000000).toFixed(8)} MOVE/sec
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="dockerImage" className="block text-sm font-medium text-gray-700">
                Docker Image
              </label>
              <input
                type="text"
                id="dockerImage"
                required
                value={formData.dockerImage}
                onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="my-image:latest"
              />
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                Duration (seconds)
              </label>
              <input
                type="number"
                id="duration"
                required
                min="1"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Estimated cost: {estimatedCost.toFixed(8)} MOVE
              </p>
            </div>

            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium text-gray-700">
                Private Key (Hex) - Optional
              </label>
              <input
                type="text"
                id="privateKey"
                value={formData.privateKey}
                onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="0x... (leave empty for access-only)"
              />
              <p className="mt-1 text-xs text-gray-500">
                If provided, job will be created automatically. Otherwise, access is granted and you can create the job manually.
              </p>
            </div>

            <div className="bg-primary-50 border border-primary-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-primary-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-primary-800">x402 Payment Required</h3>
                  <div className="mt-2 text-sm text-primary-700">
                    <p>
                      This endpoint requires x402 payment verification. You'll need to pay using the x402 protocol before the job can be created.
                    </p>
                  </div>
                </div>
              </div>
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
                {loading ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

