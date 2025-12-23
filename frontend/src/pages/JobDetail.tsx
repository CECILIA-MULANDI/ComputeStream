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
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Job not found</h3>
        <p className="mt-1 text-sm text-gray-500">The job you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Job Details</h1>
          <p className="mt-1 text-sm text-gray-500">Job ID: {job.jobId}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Job Information</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Status</span>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                      job.status
                    )}`}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Provider Address</span>
                  <span className="text-sm text-gray-900 font-mono">{formatAddress(job.providerAddress)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Buyer Address</span>
                  <span className="text-sm text-gray-900 font-mono">{formatAddress(job.buyerAddress)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Docker Image</span>
                  <span className="text-sm text-gray-900 font-mono">{job.dockerImage}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Max Duration</span>
                  <span className="text-sm text-gray-900">{job.maxDuration} seconds</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Escrow Amount</span>
                  <span className="text-sm text-gray-900">
                    {(job.escrowAmount / 100000000).toFixed(8)} MOVE
                  </span>
                </div>

                {job.startTime && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Start Time</span>
                    <span className="text-sm text-gray-900">
                      {new Date(job.startTime * 1000).toLocaleString()}
                    </span>
                  </div>
                )}

                {job.endTime && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">End Time</span>
                    <span className="text-sm text-gray-900">
                      {new Date(job.endTime * 1000).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {stream && (
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">Payment Stream</h2>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Rate Per Second</span>
                    <span className="text-sm text-gray-900">
                      {(stream.ratePerSecond / 100000000).toFixed(8)} MOVE
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Total Streamed</span>
                    <span className="text-sm text-gray-900">
                      {(stream.totalStreamed / 100000000).toFixed(8)} MOVE
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <span className="text-sm text-gray-900">
                      {stream.isActive ? (
                        <span className="text-green-600">Active</span>
                      ) : stream.isPaused ? (
                        <span className="text-yellow-600">Paused</span>
                      ) : (
                        <span className="text-gray-600">Closed</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
              </div>
              <div className="px-6 py-5 space-y-3">
                <button
                  onClick={loadJobData}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-primary-900 mb-2">x402 Integration</h3>
              <p className="text-sm text-primary-700">
                This job was created with x402 payment verification. Payments are streamed per-second to the provider.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

