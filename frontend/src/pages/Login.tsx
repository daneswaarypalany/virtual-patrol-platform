import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showSplash, setShowSplash] = useState(
    () => !sessionStorage.getItem('vp_splash_seen'),
  )

  useEffect(() => {
    if (!showSplash) return
    const timer = setTimeout(() => {
      sessionStorage.setItem('vp_splash_seen', '1')
      setShowSplash(false)
    }, 2600)
    return () => clearTimeout(timer)
  }, [showSplash])

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      {/* decorative arc lines */}
      <div className="login-arcs" aria-hidden="true">
        <span className="arc arc-1" />
        <span className="arc arc-2" />
        <span className="arc arc-3" />
      </div>

      {showSplash && (
        <div className="splash">
          <img src="/logo.png" alt="A-Force Protection" className="splash-logo" />
          <div className="splash-text">
            <div className="splash-title">Virtual Patrol</div>
            <div className="splash-sub">Security Management</div>
          </div>
          <div className="splash-bar">
            <div className="splash-bar-fill" />
          </div>
        </div>
      )}

      <div className={`login-card ${showSplash ? 'hidden' : 'reveal'}`}>
        <div className="login-badge">
          <img
            src="/logo.png"
            alt="A-Force Protection"
            className="login-badge-logo"
          />
        </div>

        <h1>Sign in to Virtual Patrol</h1>

        <div className="login-field">
          <User size={17} className="field-icon" />
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="login-field">
          <Lock size={17} className="field-icon" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <p className="login-hint">Forgot password? Contact your administrator.</p>

        {error && <div className="login-error">{error}</div>}

        <button
          className="login-button"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}