import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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
      className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ${
        isActive
          ? 'text-white bg-gradient-primary shadow-lg shadow-primary-500/50'
          : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
      }`}
    >
      {children}
    </Link>
  );
}

function Navigation() {
  return (
    <nav className="glass-dark sticky top-0 z-50 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center min-h-16 py-2">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold gradient-text">ComputeStream</span>
            </Link>
            <div className="hidden md:flex items-center space-x-2">
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/providers">Providers</NavLink>
              <NavLink to="/providers/register">Register</NavLink>
              <NavLink to="/jobs/create">Create Job</NavLink>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:block">
              <WalletConnect compact={true} />
            </div>
          </div>
        </div>
      </div>
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
      <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 relative overflow-hidden">
        {/* Animated background gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <Navigation />
        
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

