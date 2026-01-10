import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { providerApi } from '../api';
import type { Provider } from '../types';

export function Dashboard() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const activeProviders = await providerApi.list(true);
      setProviders(activeProviders);
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 py-8 px-4 sm:px-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-6">
        <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight animate-slide-up">
          AI-Powered Compute Marketplace
        </h1>
        <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed animate-slide-up font-sans" style={{ animationDelay: '0.1s' }}>
          Decentralized GPU rental with x402 micropayment streaming on Movement Network. 
          Provision high-performance compute instantly and pay only for what you use.
        </p>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="card-modern group !p-6 md:!p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform duration-500 border border-white/5 flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider font-accent truncate">Active Providers</p>
                  <div className="flex items-baseline space-x-2 flex-wrap">
                    <p className="text-3xl md:text-4xl font-bold text-white mt-1 font-display">{providers.length}</p>
                    <span className="text-[10px] md:text-xs font-bold text-green-400 flex items-center font-accent">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7 7 7" />
                      </svg>
                      +12.5%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-modern group !p-6 md:!p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform duration-500 border border-white/5 flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider font-accent truncate">Total Staked</p>
                  <div className="flex items-baseline space-x-2 flex-wrap">
                    <p className="text-3xl md:text-4xl font-bold text-white mt-1 font-display">4.2K</p>
                    <span className="text-[10px] md:text-xs font-bold text-green-400 flex items-center font-accent">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7 7 7" />
                      </svg>
                      +22.2%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-modern group !p-6 md:!p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform duration-500 border border-white/5 flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider font-accent truncate">Stream Rate</p>
                  <div className="flex items-baseline space-x-2 flex-wrap">
                    <p className="text-3xl md:text-4xl font-bold text-white mt-1 font-display">Active</p>
                    <span className="text-[10px] md:text-xs font-bold text-primary-400 flex items-center font-accent">
                      <div className="w-2 h-2 bg-primary-400 rounded-full animate-pulse mr-1"></div>
                      Live
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card-modern animate-slide-up mt-16" style={{ animationDelay: '0.3s' }}>
        <h2 className="text-3xl font-extrabold text-white mb-10 px-4 tracking-tighter">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/providers"
            className="group relative bg-[#121214] border border-white/5 p-10 rounded-[40px] flex flex-col items-start space-y-8 hover:border-white/10 hover:bg-[#16161a] transition-all duration-500 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          >
            <div className="p-5 bg-white/[0.03] border border-white/5 rounded-[24px] group-hover:bg-primary-500/10 transition-all duration-500 group-hover:scale-110">
              <svg className="w-10 h-10 text-white transition-colors duration-500 group-hover:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-white tracking-tight font-display">Browse Providers</p>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-3 leading-relaxed opacity-70">Find available GPU providers for your compute tasks</p>
            </div>
          </Link>

          <Link
            to="/providers/register"
            className="group relative bg-[#121214] border border-white/5 p-10 rounded-[40px] flex flex-col items-start space-y-8 hover:border-white/10 hover:bg-[#16161a] transition-all duration-500 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          >
            <div className="p-5 bg-white/[0.03] border border-white/5 rounded-[24px] group-hover:bg-primary-500/10 transition-all duration-500 group-hover:scale-110">
              <svg className="w-10 h-10 text-white transition-colors duration-500 group-hover:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-white tracking-tight font-display">Register Provider</p>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-3 leading-relaxed opacity-70">List your GPU for rent and start earning MOVE</p>
            </div>
          </Link>

          <Link
            to="/jobs"
            className="group relative bg-[#121214] border border-white/5 p-10 rounded-[40px] flex flex-col items-start space-y-8 hover:border-white/10 hover:bg-[#16161a] transition-all duration-500 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          >
            <div className="p-5 bg-white/[0.03] border border-white/5 rounded-[24px] group-hover:bg-primary-500/10 transition-all duration-500 group-hover:scale-110">
              <svg className="w-10 h-10 text-white transition-colors duration-500 group-hover:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-white tracking-tight font-display">My Jobs</p>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-3 leading-relaxed opacity-70">Monitor and manage your active compute tasks</p>
            </div>
          </Link>

          <Link
            to="/jobs/create"
            className="group relative bg-[#121214] border border-white/5 p-10 rounded-[40px] flex flex-col items-start space-y-8 hover:border-white/10 hover:bg-[#16161a] transition-all duration-500 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          >
            <div className="p-5 bg-white/[0.03] border border-white/5 rounded-[24px] group-hover:bg-primary-500/10 transition-all duration-500 group-hover:scale-110">
              <svg className="w-10 h-10 text-white transition-colors duration-500 group-hover:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-white tracking-tight font-display">Create Job</p>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-3 leading-relaxed opacity-70">Instantly provision compute with x402 payments</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

