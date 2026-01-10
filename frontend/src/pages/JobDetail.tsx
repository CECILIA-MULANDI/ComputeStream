import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jobApi, paymentStreamApi } from '../api';
import type { Job, PaymentStream } from '../types';

export function JobDetail() {
  const { buyerAddress, jobId } = useParams<{ buyerAddress: string; jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [stream, setStream] = useState<PaymentStream | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (buyerAddress && jobId) {
      loadJobData();
      const interval = setInterval(loadJobData, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [buyerAddress, jobId]);

  const loadJobData = async () => {
    if (!buyerAddress || !jobId) return;

    try {
      const jobData = await jobApi.get(buyerAddress, Number(jobId));
      setJob(jobData);

      try {
        const streamData = await paymentStreamApi.get(buyerAddress, Number(jobId));
        setStream(streamData);
      } catch (err) {
        // Stream might not exist yet
        console.log('Stream not found');
      }
    } catch (err) {
      console.error('Failed to load job data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="w-20 h-20 bg-white/5 rounded-[24px] flex items-center justify-center mx-auto mb-6 border border-white/5">
          <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Job not found</h3>
        <p className="text-gray-400 mb-8">The job you're looking for doesn't exist.</p>
        <Link to="/jobs" className="btn-secondary">Go Back to My Jobs</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Job Details</h1>
          <p className="mt-2 text-gray-400 font-mono text-sm opacity-60">ID: {job.job_id || job.jobId}</p>
        </div>
        <button onClick={loadJobData} className="btn-secondary flex items-center space-x-2">
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Data</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <div className="card-modern !p-0 overflow-hidden">
            <div className="px-8 py-6 border-b border-white/5 bg-white/5">
              <h2 className="text-xl font-bold text-white font-display">Compute Information</h2>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Status</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest font-accent ${getStatusColor(job.status)}`}>
                  {job.status}
                </span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Provider Address</span>
                <span className="text-white font-mono text-sm">{formatAddress(job.provider_address || job.providerAddress)}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Docker Image</span>
                <span className="text-white font-mono text-sm">{job.docker_image || job.dockerImage}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Max Duration</span>
                <span className="text-white font-bold">{job.max_duration || job.maxDuration} seconds</span>
              </div>

              <div className="flex justify-between items-center py-3">
                <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Escrow Amount</span>
                <span className="text-white font-bold text-lg font-display">
                  {((Number(job.escrow_amount || job.escrowAmount)) / 100000000).toFixed(6)} MOVE
                </span>
              </div>
            </div>
          </div>

          {stream && (
            <div className="card-modern !p-0 overflow-hidden">
              <div className="px-8 py-6 border-b border-white/5 bg-primary-500/5">
                <h2 className="text-xl font-bold text-white font-display">Live Payment Stream</h2>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider font-accent mb-1">Rate Per Second</p>
                    <p className="text-2xl font-bold text-white font-display">
                      {((Number(stream.ratePerSecond)) / 100000000).toFixed(8)} MOVE
                    </p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider font-accent mb-1">Total Streamed</p>
                    <p className="text-2xl font-bold text-white font-display">
                      {((Number(stream.totalStreamed)) / 100000000).toFixed(6)} MOVE
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-400 font-medium font-accent uppercase tracking-wider text-xs">Stream Status</span>
                  <span>
                    {stream.isActive ? (
                      <span className="flex items-center space-x-2 text-green-400 font-bold">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        <span className="font-accent uppercase tracking-widest text-[10px]">Active</span>
                      </span>
                    ) : stream.isPaused ? (
                      <span className="text-yellow-400 font-bold font-accent uppercase tracking-widest text-[10px]">Paused</span>
                    ) : (
                      <span className="text-gray-400 font-bold font-accent uppercase tracking-widest text-[10px]">Closed</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="card-modern bg-[#1a1a1e] border-white/10">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest font-accent">x402 Integration</h3>
            <p className="text-sm text-gray-400 leading-relaxed font-sans">
              This job was created with x402 payment verification. Payments are streamed per-second directly to the provider for the duration of the compute task.
            </p>
          </div>

          <div className="card-modern bg-[#1a1a1e] border-white/10">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest font-accent">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={loadJobData}
                className="w-full btn-secondary text-sm"
              >
                Sync with Blockchain
              </button>
              <Link
                to="/jobs"
                className="w-full btn-secondary text-sm text-center block"
              >
                Back to My Jobs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

