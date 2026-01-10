import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { jobApi } from '../api';
import { getWalletState } from '../services/walletIntegration';
import { WalletConnect } from '../components/WalletConnect';
import type { Job } from '../types';

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyerAddress, setBuyerAddress] = useState<string | null>(null);
  const lastAddressRef = useRef<string | null>(null);

  const loadJobs = async (address: string) => {
    try {
      setLoading(true);
      // Normalize address to lowercase for consistent querying
      const normalizedAddress = address.toLowerCase();
      console.log('📋 Loading jobs for address:', normalizedAddress);
      const jobList = await jobApi.listByBuyer(normalizedAddress);
      console.log('📋 Received jobs:', jobList.length, jobList);
      setJobs(jobList);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check wallet state (it should already be restored by App.tsx)
    const checkWallet = () => {
      const walletState = getWalletState();
      if (walletState.connected && walletState.address) {
        const address = walletState.address;
        if (address !== lastAddressRef.current) {
          lastAddressRef.current = address;
          setBuyerAddress(address);
          loadJobs(address);
        }
      } else {
        if (loading) {
          setLoading(false);
        }
      }
    };

    // Check immediately
    checkWallet();

    // Also check periodically in case wallet was just connected or restored
    const interval = setInterval(checkWallet, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []); // Empty deps - we use refs to track state


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-400 border border-green-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'cancelled':
        return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    }
  };

  const formatAddress = (address: string | null | undefined) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!buyerAddress) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
        <div className="card-modern !bg-[#121214] !p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-display">Wallet Not Connected</h2>
          <p className="text-gray-400 mb-8 font-sans">Please connect your wallet to view and manage your compute jobs.</p>
          <div className="flex justify-center">
            <WalletConnect />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight font-display">My Jobs</h1>
          <p className="mt-2 text-gray-400 font-sans">
            View and manage your active compute tasks
          </p>
        </div>
        <button
          onClick={() => buyerAddress && loadJobs(buyerAddress)}
          className="btn-secondary self-start flex items-center space-x-2 font-accent uppercase tracking-widest text-[11px]"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh List</span>
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-modern !bg-[#121214] !p-16 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-[24px] flex items-center justify-center mx-auto mb-6 border border-white/5">
            <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2 font-display">No jobs found</h3>
          <p className="text-gray-400 mb-8 font-sans">You haven't created any compute jobs yet.</p>
          <Link to="/jobs/create" className="btn-primary inline-flex items-center space-x-2 font-accent uppercase tracking-widest text-[11px]">
            <span>Create Your First Job</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job, index) => (
            <Link
              key={job.jobId || index}
              to={`/jobs/${job.buyerAddress}/${job.jobId}`}
              className="block group"
            >
              <div className="bg-[#121214] border border-white/5 rounded-[32px] p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 group-hover:border-white/10 transition-all duration-300">
                <div className="flex items-center space-x-6">
                  <div className="w-16 h-16 bg-[#1a1a1e] rounded-[24px] flex items-center justify-center border border-white/5 flex-shrink-0 group-hover:bg-white/10 transition-all duration-300">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-2xl font-bold text-white font-display tracking-tight">Job #{job.jobId}</h3>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest font-accent ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 font-sans truncate max-w-[200px] md:max-w-md">
                      <span className="font-medium text-gray-400">{job.dockerImage || 'N/A'}</span>
                      <span className="mx-2 opacity-30">•</span>
                      Provider: <span className="font-mono text-xs opacity-60">{formatAddress(job.providerAddress)}</span>
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 border-white/5 pt-6 md:pt-0 gap-2">
                  <div className="text-2xl font-bold text-white font-display">
                    {job.escrowAmount ? ((Number(job.escrowAmount)) / 100000000).toFixed(4) : '0.0000'} <span className="text-xs font-normal opacity-50">MOVE</span>
                  </div>
                  <div className="text-[10px] text-gray-600 font-accent uppercase tracking-widest font-bold">
                    Max: {job.maxDuration || 0}s
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

