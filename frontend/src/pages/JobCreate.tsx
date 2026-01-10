import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { computeApi, providerApi } from '../api';
import { getWalletState, signTransaction } from '../services/walletIntegration';
import type { Provider } from '../types';

export function JobCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState({
    providerAddress: searchParams.get('provider') || '',
    dockerImage: '',
    duration: '3600',
  });

  // Check wallet connection on mount
  useEffect(() => {
    const state = getWalletState();
    if (!state.connected) {
      setError('Please connect your wallet in the navigation bar to create a job.');
    }
  }, []);

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
      });

      // x402 payment was successful! Now create the job on-chain
      if (result.job && result.job.jobId) {
        // Job was created automatically
        navigate(`/jobs/${result.job.buyerAddress}/${result.job.jobId}`);
      } else if (result.x402Payment?.verified) {
        // Payment verified - now create job on-chain automatically
        const paidAmount = result.x402Payment?.paidAmountMOVE || 0;
        console.log('✅ x402 Payment verified! Paid:', paidAmount, 'MOVE');
        console.log('🔨 Creating job on-chain...');
        
        try {
          // Get wallet address
          const walletState = getWalletState();
          if (!walletState.connected || !walletState.address) {
            throw new Error('Wallet not connected');
          }
          
          // Calculate escrow amount (use the paid amount or estimate)
          // Note: totalPrice from x402 is already in octas
          const escrowAmount = result.jobDetails?.totalPrice || (result.jobDetails?.pricePerSecond * result.jobDetails?.duration);
          
          console.log('Creating job with parameters:');
          console.log('  Provider:', formData.providerAddress);
          console.log('  Docker Image:', formData.dockerImage);
          console.log('  Escrow Amount (octas):', escrowAmount);
          console.log('  Duration (seconds):', result.jobDetails?.duration || formData.duration);
          
          // Create job on-chain using wallet
          const CONTRACT_ADDRESS = '0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1';
          const txHash = await signTransaction({
            function: `${CONTRACT_ADDRESS}::job_registry::create_job`,
            typeArguments: [],
            functionArguments: [
              formData.providerAddress,
              formData.dockerImage,
              String(escrowAmount), // Already in octas
              String(result.jobDetails?.duration || formData.duration),
            ],
          });
          
          console.log('✅ Job creation transaction:', txHash);
          
          // Wait a moment for transaction to be indexed
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Sync to database (jobId will be extracted from transaction events by indexer)
          const syncResponse = await fetch('/api/v1/jobs/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              txHash: txHash,
              buyerAddress: walletState.address,
              providerAddress: formData.providerAddress,
              dockerImage: formData.dockerImage,
              escrowAmount: escrowAmount,
              maxDuration: result.jobDetails?.duration || formData.duration,
              // jobId is optional - indexer will extract it from transaction events
            }),
          });
          
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            if (syncData.jobId) {
              navigate(`/jobs/${walletState.address}/${syncData.jobId}`);
              return;
            }
          } else {
            const errorData = await syncResponse.json().catch(() => ({}));
            console.error('Sync error:', errorData);
          }
          
          // If sync failed or no jobId, show success - indexer will pick it up
          alert(`✅ Job created on-chain!\n\nTransaction: ${txHash.slice(0, 10)}...\n\nThe indexer will sync the job automatically. Check your jobs page in a few seconds.`);
          
        } catch (jobError: any) {
          console.error('Job creation error:', jobError);
          setError(`Payment successful, but job creation failed: ${jobError.message}`);
        }
      } else {
        // Fallback message
        alert('✅ Payment successful! Check console for next steps.');
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
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold gradient-text">Create Compute Job</h1>
        <p className="text-gray-400">
          Create a new compute job with x402 payment verification
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
                <h3 className="text-sm font-semibold text-red-400">{error}</h3>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="providerAddress" className="block text-sm font-semibold text-gray-300 mb-2">
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
              className="input-modern"
            >
              <option value="">Select a provider</option>
              {providers.map((provider) => (
                <option key={provider.address} value={provider.address}>
                  {provider.gpuType} - {provider.address.slice(0, 10)}... ({provider.isActive ? 'Active' : 'Inactive'})
                </option>
              ))}
            </select>
            {selectedProvider && (
              <div className="mt-3 p-4 glass-dark border border-white/10">
                <div className="space-y-2">
                  <div className="text-lg font-bold text-white">{selectedProvider.gpuType}</div>
                  <div className="flex items-center space-x-4 text-sm text-gray-300">
                    <span>{selectedProvider.vramGB} GB VRAM</span>
                    <span>·</span>
                    <span>{selectedProvider.reputationScore} reputation</span>
                  </div>
                  <div className="text-sm font-semibold text-primary-400">
                    Price: {(selectedProvider.pricePerSecond / 100000000).toFixed(8)} MOVE/sec
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="dockerImage" className="block text-sm font-semibold text-gray-300 mb-2">
              Docker Image
            </label>
            <input
              type="text"
              id="dockerImage"
              required
              value={formData.dockerImage}
              onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
              className="input-modern"
              placeholder="my-image:latest"
            />
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-semibold text-gray-300 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              id="duration"
              required
              min="1"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              className="input-modern"
            />
            <p className="mt-2 text-xs text-gray-400">
              Estimated cost: <span className="font-semibold text-primary-400">{estimatedCost.toFixed(8)} MOVE</span>
            </p>
          </div>

          <div className="p-4 bg-gradient-to-r from-primary-500/10 to-purple-500/10 border border-primary-500/30 rounded-xl">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 p-2 bg-primary-500/20 rounded-lg">
                <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary-300 mb-1">x402 Payment Required</h3>
                <p className="text-sm text-gray-400">
                  This endpoint requires x402 payment verification. You'll need to pay using the x402 protocol before the job can be created.
                </p>
              </div>
            </div>
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
              disabled={loading || !walletConnected}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

