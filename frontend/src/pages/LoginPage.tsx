import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Zap, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-grid-bg relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-grid-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-grid-accent to-blue-400 rounded-2xl mb-4 shadow-lg shadow-grid-accent/20">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">GridWatch</h1>
          <p className="text-grid-text-muted mt-1">Real-Time Infrastructure Monitoring</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-grid-text-muted mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-grid-bg border border-grid-border rounded-lg text-white placeholder-grid-text-muted/50 focus:outline-none focus:border-grid-accent focus:ring-1 focus:ring-grid-accent/30 transition-all"
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-grid-text-muted mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-grid-bg border border-grid-border rounded-lg text-white placeholder-grid-text-muted/50 focus:outline-none focus:border-grid-accent focus:ring-1 focus:ring-grid-accent/30 transition-all"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="px-4 py-2.5 bg-status-critical/10 border border-status-critical/30 rounded-lg text-status-critical text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-grid-accent to-blue-500 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-grid-accent/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Demo accounts */}
          <div className="border-t border-grid-border pt-4 mt-4">
            <p className="text-xs text-grid-text-muted text-center mb-3">Demo Accounts</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { user: 'alice', role: 'Op · North' },
                { user: 'bob', role: 'Op · South' },
                { user: 'charlie', role: 'Supervisor' },
              ].map((acct) => (
                <button
                  key={acct.user}
                  type="button"
                  onClick={() => { setUsername(acct.user); setPassword('password123'); }}
                  className="text-xs px-2 py-2 rounded-md bg-grid-surface-2 border border-grid-border text-grid-text-muted hover:text-white hover:border-grid-accent/30 transition-all text-center"
                >
                  <span className="font-medium block text-white">{acct.user}</span>
                  <span className="text-[10px]">{acct.role}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
