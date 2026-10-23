import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
    <main className="login-wrap">
      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-form-panel">
          <div className="login-brand">
            <img src="/logo.png" alt="A-Force Protection logo" className="login-brand-logo" />
            <div className="login-brand-copy">
              <strong>Virtual Patrol</strong>
              <span>Security Management</span>
            </div>
          </div>

          <div className="login-intro">
            <p className="login-welcome-copy">WELCOME BACK</p>
            <h1 id="login-title">Log In</h1>
            <p className="login-description">Sign in to manage your patrol operations.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field-group">
              <label htmlFor="login-username">Username</label>
              <div className="login-input-shell">
                <User size={18} className="login-input-icon" aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field-group">
              <div className="login-field-heading">
                <label htmlFor="login-password">Password</label>
                <span className="login-recovery-note">Forgot password? Contact your administrator.</span>
              </div>
              <div className="login-input-shell">
                <Lock size={18} className="login-input-icon" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="login-error-message" role="alert">{error}</div>}

            <button className="login-submit" type="submit" disabled={submitting}>
              <span>{submitting ? 'Signing in…' : 'LOGIN'}</span>
              {!submitting && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>

          <p className="login-access-note">Secure access for authorized A-Force personnel.</p>
        </div>

        <aside className="login-visual" aria-label="A-Force Protection security team">
          <div className="login-visual-orb login-visual-orb-one" aria-hidden="true" />
          <div className="login-visual-orb login-visual-orb-two" aria-hidden="true" />
          <img
            src="/aforce-security-figures.png"
            alt="Two A-Force Protection security officers in uniform"
            className="login-figures"
          />
        </aside>
      </section>
    </main>
  )
}
