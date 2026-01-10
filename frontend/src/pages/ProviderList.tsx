import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { providerApi } from '../api';
import type { Provider } from '../types';

export function ProviderList() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    loadProviders();
  }, [activeOnly]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await providerApi.list(activeOnly);
      setProviders(data);
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatPrice = (pricePerSecond: number) => {
    const movePrice = pricePerSecond / 100000000;
    return movePrice.toFixed(8);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold gradient-text">GPU Providers</h1>
          <p className="mt-2 text-gray-400">
            Browse available GPU providers for compute jobs
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer glass-dark px-4 py-2 rounded-xl hover:bg-dark-800/70 transition-all">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-2"
            />
            <span className="text-sm text-gray-300">Active only</span>
          </label>
          <button
            onClick={loadProviders}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
        </div>
      ) : providers.length === 0 ? (
        <div className="card-modern text-center py-16">
          <div className="inline-flex p-4 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-2xl mb-4">
            <svg
              className="h-12 w-12 text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No providers found</h3>
          <p className="text-gray-400 mb-6">
            {activeOnly
              ? 'No active providers at the moment.'
              : 'No providers have been registered yet.'}
          </p>
          <Link
            to="/providers/register"
            className="btn-primary inline-flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Register as Provider</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider, index) => (
            <div
              key={provider.address}
              className="card-modern group animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                    <svg
                      className="h-6 w-6 text-primary-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-primary-300 transition-colors">{provider.gpuType}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-1">{formatAddress(provider.address)}</p>
                  </div>
                </div>
                {provider.isActive ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                    Inactive
                  </span>
                )}
              </div>

              <dl className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <dt className="text-sm font-medium text-gray-400">VRAM</dt>
                  <dd className="text-sm font-bold text-white">{provider.vramGB} GB</dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <dt className="text-sm font-medium text-gray-400">Price/Second</dt>
                  <dd className="text-sm font-bold text-primary-400">{formatPrice(provider.pricePerSecond)} MOVE</dd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <dt className="text-sm font-medium text-gray-400">Reputation</dt>
                  <dd className="text-sm font-bold text-white">{provider.reputationScore}</dd>
                </div>
              </dl>

              <Link
                to={`/jobs/create?provider=${provider.address}`}
                className="w-full btn-primary flex items-center justify-center space-x-2 group-hover:shadow-primary-500/50"
              >
                <span>Create Job</span>
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

