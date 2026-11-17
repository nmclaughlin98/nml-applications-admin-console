import { useEffect, useState, type FormEvent } from 'react'
import type { CognitoUser } from 'amazon-cognito-identity-js'
import { completeNewPassword, configurationError, currentUser, idToken, signIn, signOut, type LoginResult } from './auth'
import { spokes, type SpokeConfig } from './config/spokes'
import './App.css'

type Status = { appName: string; stage: string; version: string; health: string }
type Flags = { maintenanceMode: boolean; routes: Record<string, boolean>; features: Record<string, boolean> }
type FlagUpdate = Partial<Flags>

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

async function request<T>(user: CognitoUser, spoke: SpokeConfig, path: string, options: RequestInit = {}): Promise<T> {
  const token = await idToken(user)
  const response = await fetch(`${spoke.adminApiBaseUrl.replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: 'Bearer ' + token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!response.ok) throw new Error(`Request failed (${response.status} ${response.statusText}).`)
  return response.json() as Promise<T>
}

function Login({ onLogin }: { onLogin: (user: CognitoUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<Extract<LoginResult, { kind: 'new-password' }> | null>(null)
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [error, setError] = useState(configurationError ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (challenge) {
        await completeNewPassword(challenge.user, password, attributes)
        onLogin(challenge.user)
      } else {
        const result = await signIn(email.trim(), password)
        if (result.kind === 'new-password') {
          setChallenge(result)
          setPassword('')
        } else {
          onLogin(result.user)
        }
      }
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">NML APPLICATIONS</p>
        <h1>Central Admin</h1>
        <p>{challenge ? 'Set a new password to complete your account setup.' : 'Sign in with your administrator account.'}</p>
        {!challenge && <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
        <label>{challenge ? 'New password' : 'Password'}
          <input type="password" autoComplete={challenge ? 'new-password' : 'current-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {challenge?.requiredAttributes.map((attribute) => (
          <label key={attribute}>{attribute}
            <input required value={attributes[attribute] ?? ''} onChange={(e) => setAttributes({ ...attributes, [attribute]: e.target.value })} />
          </label>
        ))}
        {challenge && <p className="hint">Use at least 12 characters with uppercase, lowercase, a number, and a symbol.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !!configurationError}>{busy ? 'Please wait…' : challenge ? 'Set password' : 'Sign in'}</button>
        {challenge && <button className="text-button" type="button" onClick={() => { setChallenge(null); setPassword(''); setError('') }}>Back to sign in</button>}
      </form>
    </main>
  )
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <span className="toggle">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className="track" />
      </span>
    </label>
  )
}

function Dashboard({ user, onSignOut }: { user: CognitoUser; onSignOut: () => void }) {
  const [projectId, setProjectId] = useState(spokes[0].id)
  const project = spokes.find((spoke) => spoke.id === projectId) ?? spokes[0]
  const [status, setStatus] = useState<Status | null>(null)
  const [flags, setFlags] = useState<Flags | null>(null)
  const [statusError, setStatusError] = useState('')
  const [flagsError, setFlagsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    request<Status>(user, project, '/status', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setStatus(data) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setStatusError(message(err)) })
    request<Flags>(user, project, '/flags', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setFlags(data) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setFlagsError(message(err)) })
    return () => controller.abort()
  }, [user, project])

  async function updateFlags(update: FlagUpdate) {
    setSaving(true)
    setFeedback('Saving…')
    setFlagsError('')
    try {
      const updated = await request<Flags>(user, project, '/flags', {
        method: 'PATCH',
        body: JSON.stringify(update),
      })
      setFlags(updated)
      setFeedback('Saved')
    } catch (err) {
      setFlagsError(message(err))
      setFeedback('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <p className="eyebrow">NML APPLICATIONS</p>
        <h1>Central Admin</h1>
        <label className="project-label">Project
          <select value={projectId} disabled={saving} onChange={(e) => {
            setStatus(null)
            setFlags(null)
            setStatusError('')
            setFlagsError('')
            setFeedback('')
            setProjectId(e.target.value)
          }}>
            {spokes.map((spoke) => <option value={spoke.id} key={spoke.id}>{spoke.name}</option>)}
          </select>
        </label>
        <p className="sidebar-description">{project.description}</p>
        <button className="sign-out" onClick={onSignOut}>Sign out</button>
      </aside>
      <main className="content">
        <header><p className="eyebrow">PROJECT OVERVIEW</p><h2>{project.name}</h2><p>{project.description}</p></header>
        <section className="card">
          <div className="section-title"><h3>Service status</h3>{status && <span className={`badge ${['healthy', 'ok', 'up'].includes(String(status.health).toLowerCase()) ? 'healthy' : 'unhealthy'}`}>{String(status.health)}</span>}</div>
          {statusError ? <p className="error" role="alert">{statusError}</p> : status ? (
            <dl className="status-grid">
              <div><dt>Application</dt><dd>{status.appName}</dd></div>
              <div><dt>Stage</dt><dd>{status.stage}</dd></div>
              <div><dt>Version</dt><dd>{status.version}</dd></div>
            </dl>
          ) : <p>Loading status…</p>}
        </section>
        <section className="card">
          <div className="section-title"><div><h3>Runtime controls</h3><p>Changes apply to the selected project.</p></div><span className="feedback" aria-live="polite">{feedback}</span></div>
          {flagsError && <p className="error" role="alert">{flagsError}</p>}
          {flags ? <>
            <div className="flag-group warning"><h4>Global circuit breaker</h4><p>Maintenance mode can affect the entire application.</p>
              <Toggle label="Maintenance mode" checked={flags.maintenanceMode} disabled={saving} onChange={() => void updateFlags({ maintenanceMode: !flags.maintenanceMode })} />
            </div>
            <div className="flag-group"><h4>Endpoint kill switches</h4>
              {Object.entries(flags.routes).length ? Object.entries(flags.routes).map(([key, value]) => <Toggle key={key} label={key} checked={value} disabled={saving} onChange={() => void updateFlags({ routes: { [key]: !value } })} />) : <p>No endpoint switches configured.</p>}
            </div>
            <div className="flag-group"><h4>Feature flags</h4>
              {Object.entries(flags.features).length ? Object.entries(flags.features).map(([key, value]) => <Toggle key={key} label={key} checked={value} disabled={saving} onChange={() => void updateFlags({ features: { [key]: !value } })} />) : <p>No feature flags configured.</p>}
            </div>
          </> : !flagsError && <p>Loading flags…</p>}
        </section>
      </main>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<CognitoUser | null>(null)
  const [existing] = useState(currentUser)
  const [loading, setLoading] = useState(!!existing)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    if (!existing) return () => { active = false }
    idToken(existing).then(() => { if (active) setUser(existing) }).catch(() => {
      if (active) existing.signOut()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [existing])

  if (loading || signingOut) return <main className="login-page">{signingOut ? 'Signing out…' : 'Loading…'}</main>
  return user ? <Dashboard user={user} onSignOut={() => {
    setSigningOut(true)
    void signOut(user).finally(() => { setUser(null); setSigningOut(false) })
  }} /> : <Login onLogin={setUser} />
}
