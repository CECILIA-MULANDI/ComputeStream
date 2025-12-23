import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ProviderList } from './pages/ProviderList';
import { ProviderRegister } from './pages/ProviderRegister';
import { JobCreate } from './pages/JobCreate';
import { JobDetail } from './pages/JobDetail';
import { Dashboard } from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <nav className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-2xl font-bold text-primary-600">ComputeStream</h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/providers"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Providers
                  </Link>
                  <Link
                    to="/providers/register"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Register Provider
                  </Link>
                  <Link
                    to="/jobs/create"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Create Job
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/providers" element={<ProviderList />} />
            <Route path="/providers/register" element={<ProviderRegister />} />
            <Route path="/jobs/create" element={<JobCreate />} />
            <Route path="/jobs/:buyerAddress/:jobId" element={<JobDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

