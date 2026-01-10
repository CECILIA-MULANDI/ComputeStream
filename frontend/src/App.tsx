import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ProviderList } from './pages/ProviderList';
import { ProviderRegister } from './pages/ProviderRegister';
import { JobCreate } from './pages/JobCreate';
import { JobDetail } from './pages/JobDetail';
import { JobList } from './pages/JobList';
import { Dashboard } from './pages/Dashboard';
import { WalletConnect } from './components/WalletConnect';
import { restoreWalletConnection } from './services/walletIntegration';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link
      to={to}
      className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 font-accent ${
        isActive
          ? 'text-white bg-white/5 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  );
}

function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#08080a]/60 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Far Left: Logo */}
          <div className="flex-shrink-0 w-1/4 flex items-center">
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white tracking-tight hidden lg:block font-display">ComputeStream</span>
            </Link>
          </div>

          {/* Center: Navigation Links - Perfectly Centered Pill */}
          <div className="hidden md:flex flex-1 justify-center pointer-events-none">
            <div className="flex items-center space-x-1 bg-white/[0.03] px-2 py-2 rounded-full border border-white/5 backdrop-blur-md pointer-events-auto shadow-[0_0_20px_rgba(0,0,0,0.3)]">
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/providers">Providers</NavLink>
              <NavLink to="/providers/register">Register</NavLink>
              <NavLink to="/jobs">My Jobs</NavLink>
              <NavLink to="/jobs/create">Create Job</NavLink>
            </div>
          </div>

          {/* Far Right: Wallet & Mobile Toggle */}
          <div className="flex items-center justify-end space-x-4 w-1/4">
            <div className="hidden sm:block">
              <WalletConnect compact={true} />
            </div>
            
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden animate-fade-in border-t border-white/5 bg-[#08080a] backdrop-blur-xl">
          <div className="px-4 pt-2 pb-6 space-y-2">
            <div className="py-4 border-b border-white/5 mb-2 sm:hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3 font-accent">Wallet</p>
              <div className="px-3">
                <WalletConnect compact={false} />
              </div>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-3 font-accent">Menu</p>
            <Link
              to="/"
              className={`block px-4 py-3 rounded-xl text-base font-medium transition-all ${
                location.pathname === '/' ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/providers"
              className={`block px-4 py-3 rounded-xl text-base font-medium transition-all ${
                location.pathname === '/providers' ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Providers
            </Link>
            <Link
              to="/providers/register"
              className={`block px-4 py-3 rounded-xl text-base font-medium transition-all ${
                location.pathname === '/providers/register' ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Register
            </Link>
            <Link
              to="/jobs"
              className={`block px-4 py-3 rounded-xl text-base font-medium transition-all ${
                location.pathname === '/jobs' ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              My Jobs
            </Link>
            <Link
              to="/jobs/create"
              className={`block px-4 py-3 rounded-xl text-base font-medium transition-all ${
                location.pathname === '/jobs/create' ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Create Job
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function App() {
  // Restore wallet connection on app load
  useEffect(() => {
    restoreWalletConnection();
  }, []);

  return (
    <Router>
      <div 
        className="min-h-screen relative overflow-hidden font-sans selection:bg-primary-500/30 text-gray-100 bg-[#08080a]"
      >
        <Navigation />
        
        <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/providers" element={<ProviderList />} />
            <Route path="/providers/register" element={<ProviderRegister />} />
            <Route path="/jobs" element={<JobList />} />
            <Route path="/jobs/create" element={<JobCreate />} />
            <Route path="/jobs/:buyerAddress/:jobId" element={<JobDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

