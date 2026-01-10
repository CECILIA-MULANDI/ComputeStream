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
  const [walletConnected, setWalletConnected] = useState(getWalletState().connected);
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
    setWalletConnected(state.connected);
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
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in py-12 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-white tracking-tight font-display">Create Compute Job</h1>
        <p className="text-gray-400 font-sans max-w-lg mx-auto">
          Deploy high-performance compute workloads instantly with x402 payment verification
        </p>
      </div>

      <div className="card-modern relative overflow-hidden">
        {/* Subtle decorative flare inside card */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 blur-3xl pointer-events-none"></div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl animate-fade-in">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-red-400 font-sans">{error}</h3>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="providerAddress" className="block text-xs font-bold text-gray-500 uppercase tracking-widest font-accent">
              Select GPU Provider
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
              className="input-modern font-sans bg-[#08080a] border-white/10"
            >
              <option value="" className="bg-[#08080a]">Choose a provider...</option>
              {providers.map((provider) => (
                <option key={provider.address} value={provider.address} className="bg-[#08080a]">
                  {provider.gpuType} • {provider.address.slice(0, 10)}... ({provider.isActive ? 'Active' : 'Inactive'})
                </option>
              ))}
            </select>
            
            {selectedProvider && (
              <div className="mt-4 p-5 bg-white/5 border border-white/5 rounded-2xl animate-slide-up">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-bold text-white font-display mb-1">{selectedProvider.gpuType}</div>
                    <div className="flex items-center space-x-4 text-xs font-accent uppercase tracking-wider text-gray-500">
                      <span className="flex items-center"><div className="w-2 h-2 bg-blue-500 rounded-full mr-2 opacity-50"></div>{selectedProvider.vramGB} GB VRAM</span>
                      <span className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-2 opacity-50"></div>{selectedProvider.reputationScore} Rep</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-accent mb-1">Price / Sec</p>
                    <div className="text-lg font-bold text-primary-400 font-display">
                      {(selectedProvider.pricePerSecond / 100000000).toFixed(8)} MOVE
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="dockerImage" className="block text-xs font-bold text-gray-500 uppercase tracking-widest font-accent">
              Container Configuration
            </label>
            <input
              type="text"
              id="dockerImage"
              required
              value={formData.dockerImage}
              onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
              className="input-modern font-mono text-sm bg-[#08080a] border-white/10"
              placeholder="e.g. nvidia/cuda:11.0-base"
            />
            <p className="text-[10px] text-gray-500 font-sans pl-1">Specify the public Docker image for your workload</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="duration" className="block text-xs font-bold text-gray-500 uppercase tracking-widest font-accent">
              Session Duration (Seconds)
            </label>
            <div className="relative">
              <input
                type="number"
                id="duration"
                required
                min="1"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="input-modern font-mono bg-[#08080a] border-white/10"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-600 uppercase tracking-widest pointer-events-none font-accent">
                Seconds
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-primary-500/5 border border-primary-500/10 rounded-2xl flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest font-accent">Estimated Total Cost</span>
              <span className="text-xl font-bold text-white font-display">{estimatedCost.toFixed(6)} <span className="text-xs opacity-50">MOVE</span></span>
            </div>
          </div>

          <div className="p-6 bg-[#1a1a1e] border border-white/5 rounded-[24px]">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 p-3 bg-white/5 border border-white/5 rounded-xl">
                <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1 font-accent uppercase tracking-widest">x402 Protocol Active</h3>
                <p className="text-xs text-gray-400 leading-relaxed font-sans">
                  ComputeStream uses the x402 protocol for secure, real-time micropayments. 
                  Your funds will be held in escrow and streamed to the provider as your job runs.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-white/5">
            <button
              type="button"
              onClick={() => navigate('/providers')}
              className="btn-secondary px-8 font-accent uppercase tracking-widest text-[11px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !walletConnected}
              className="btn-primary px-10 shadow-[0_0_30px_rgba(255,255,255,0.05)] font-accent uppercase tracking-widest text-[11px]"
            >
              {loading ? 'Processing...' : 'Provision GPU'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

