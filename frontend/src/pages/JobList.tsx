import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { jobApi } from '../api';
import { getWalletState } from '../services/walletIntegration';
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

  const formatAddress = (address: string | null | undefined) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  if (!buyerAddress) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">Please connect your wallet to view your jobs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage your compute jobs
          </p>
        </div>
        <button
          onClick={() => buyerAddress && loadJobs(buyerAddress)}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6 text-center">
          <p className="text-gray-500">No jobs found.</p>
          <Link
            to="/jobs/create"
            className="mt-4 inline-block text-primary-600 hover:text-primary-700"
          >
            Create your first job →
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {jobs.map((job) => (
              <li key={job.jobId}>
                <Link
                  to={`/jobs/${job.buyerAddress}/${job.jobId}`}
                  className="block hover:bg-gray-50"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            Job #{job.jobId}
                          </div>
                          <div className="text-sm text-gray-500">
                            {job.dockerImage || 'N/A'} • Provider: {formatAddress(job.providerAddress)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-900">
                          {job.escrowAmount ? (job.escrowAmount / 100000000).toFixed(4) : '0.0000'} MOVE
                        </div>
                        <div className="text-sm text-gray-500">
                          Max: {job.maxDuration || 0}s
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

