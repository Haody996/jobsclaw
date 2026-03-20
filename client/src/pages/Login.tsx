import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/api'
import { setToken, setUser } from '../lib/auth'
import GoogleSignInButton from '../components/ui/GoogleSignInButton'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const background = (location.state as any)?.backgroundLocation

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function dismiss() {
    navigate(-1)
  }

  function goToRegister() {
    navigate('/register', { state: { backgroundLocation: background ?? (location.state as any)?.backgroundLocation ?? { pathname: '/' } } })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setToken(data.token)
      setUser(data.user)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={dismiss}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-8">
          <img src="/icon.png" alt="JobsClaw" className="w-7 h-7" />
          <span className="font-bold text-2xl text-slate-900">JobsClaw</span>
        </div>

        <h1 className="text-xl font-semibold text-slate-900 mb-1">Welcome back</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in to your account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <GoogleSignInButton onSuccess={() => navigate('/')} onError={setError} />

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{' '}
          <button onClick={goToRegister} className="text-indigo-600 hover:underline font-medium">
            Create one
          </button>
        </p>
      </div>
    </div>
  )
}
