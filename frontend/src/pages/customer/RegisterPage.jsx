import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setFieldErrors({});

    const errors = {};
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(password)) errors.password = 'Must include an uppercase letter';
    else if (!/[a-z]/.test(password)) errors.password = 'Must include a lowercase letter';
    else if (!/[0-9]/.test(password)) errors.password = 'Must include a digit';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await registerUser(name, email, password, role);
      navigate('/', { replace: true });
    } catch {
      // error set by store
    }
  };

  return (
    <div className="min-h-dvh bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="text-white font-display font-bold">E</span>
          </div>
          <span className="text-xl font-display font-bold text-white">EventHive</span>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-display font-bold text-white text-center mb-1">
            Create account
          </h1>
          <p className="text-gray-400 text-sm text-center mb-6">Join EventHive today</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-5 text-red-400 text-sm animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="register-form">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 block">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoComplete="name"
                  className="input pl-9"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="input pl-9"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  className={`input pl-9 pr-10 ${fieldErrors.password ? 'border-red-500/50' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
              )}
              <p className="text-gray-600 text-xs mt-1">Min 8 chars · uppercase · lowercase · digit</p>
            </div>

            {/* Role */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 block">I am a…</label>
              <div className="grid grid-cols-2 gap-2">
                {['customer', 'organizer'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      role === r
                        ? 'bg-brand-500/15 border-brand-500/50 text-brand-300'
                        : 'bg-surface-elevated border-surface-border text-gray-400 hover:border-brand-500/30'
                    }`}
                  >
                    {r === 'customer' ? '🎭 Fan / Guest' : '🎪 Organizer'}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center mt-1" id="register-submit">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
