import { useEffect, useRef, useState } from 'react'
import type {
  PatrolSite,
  PatrolRouteSummary,
  PatrolJob,
  PatrolCheckpoint,
} from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import './Patrol.css'

type Stage = 'picker' | 'viewer' | 'summary'

export default function Patrol() {
  const [stage, setStage] = useState<Stage>('picker')
  const [job, setJob] = useState<PatrolJob | null>(null)

  if (stage === 'viewer' && job) {
    return (
      <PatrolViewer
        job={job}
        onComplete={() => setStage('summary')}
        onExit={() => {
          setJob(null)
          setStage('picker')
        }}
      />
    )
  }

  if (stage === 'summary' && job) {
    return (
      <PatrolSummary
        jobId={job.id}
        onDone={() => {
          setJob(null)
          setStage('picker')
        }}
      />
    )
  }

  return (
    <PatrolPicker
      onStarted={(startedJob) => {
        setJob(startedJob)
        setStage('viewer')
      }}
    />
  )
}

/* ---------- Stage 1: Picker ---------- */

function PatrolPicker({
  onStarted,
}: {
  onStarted: (job: PatrolJob) => void
}) {
  const [sites, setSites] = useState<PatrolSite[]>([])
  const [routes, setRoutes] = useState<PatrolRouteSummary[]>([])
  const [siteId, setSiteId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    patrolApi
      .mySites()
      .then(setSites)
      .catch(() => setError('Failed to load your sites'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!siteId) {
      setRoutes([])
      setRouteId('')
      return
    }
    patrolApi
      .routes(siteId)
      .then(setRoutes)
      .catch(() => setRoutes([]))
  }, [siteId])

  const start = async () => {
    if (!routeId) return
    setStarting(true)
    setError('')
    try {
      const { job, route } = await patrolApi.start(routeId)
      onStarted({ ...job, route, results: job.results ?? [] })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to start patrol')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <p className="patrol-loading">Loading…</p>

  return (
    <div className="patrol-picker">
      <div className="picker-hero">
        <div className="picker-hero-icon">🛡️</div>
        <div>
          <h2>Start a Patrol</h2>
          <p className="picker-sub">
            Select one of your assigned sites and a route to begin your security
            patrol.
          </p>
        </div>
      </div>

      <div className="picker-panel">
        {error && <div className="patrol-error">{error}</div>}

        <div className="picker-fields">
          <div className="picker-field">
            <label>Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="picker-field">
            <label>Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              disabled={!siteId}
            >
              <option value="">Select a route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r._count.checkpoints} checkpoints
                  {r.estimatedMinutes ? `, ~${r.estimatedMinutes} min` : ''})
                </option>
              ))}
            </select>
          </div>
        </div>

        {siteId && routes.length === 0 && (
          <p className="picker-hint">This site has no routes yet.</p>
        )}

        <button
          className="btn-primary picker-start"
          onClick={start}
          disabled={!routeId || starting}
        >
          {starting ? 'Starting…' : 'Start Patrol →'}
        </button>
      </div>
    </div>
  )
}

/* ---------- Stage 2: Viewer ---------- */

function PatrolViewer({
  job,
  onComplete,
  onExit,
}: {
  job: PatrolJob
  onComplete: () => void
  onExit: () => void
}) {
  const checkpoints = job.route.checkpoints
  const [index, setIndex] = useState(0)
  const current = checkpoints[index]

  const [checks, setChecks] = useState<boolean[]>([])
  const [comment, setComment] = useState('')
  const [issueMode, setIssueMode] = useState(false)
  const [screenshot, setScreenshot] = useState<Blob | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setChecks(current.checklistTemplate.items.map(() => true))
    setComment('')
    setIssueMode(false)
    setScreenshot(null)
    setScreenshotUrl('')
    setError('')
  }, [index])

  // Self-contained capture: draws a placeholder "feed" onto the canvas
  // and returns the PNG blob directly (no external image, no taint, no race).
  const captureBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) return resolve(null)
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)

      // background
      ctx.fillStyle = '#011f4b'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // camera name
      ctx.fillStyle = '#b3cde0'
      ctx.font = 'bold 40px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(current.camera.name, canvas.width / 2, canvas.height / 2)

      // timestamp bar
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(0, canvas.height - 30, canvas.width, 30)
      ctx.fillStyle = '#fff'
      ctx.font = '14px sans-serif'
      ctx.fillText(
        `${current.camera.name} · ${new Date().toLocaleString()}`,
        10,
        canvas.height - 10,
      )

      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  // "Capture Frame" button — updates the preview
  const capture = async () => {
    const blob = await captureBlob()
    if (blob) {
      setScreenshot(blob)
      setScreenshotUrl(URL.createObjectURL(blob))
    }
  }

  const toggleCheck = (i: number) => {
    setChecks((arr) => arr.map((v, idx) => (idx === i ? !v : v)))
  }

  const buildChecklistState = () =>
    current.checklistTemplate.items.map((item, i) => ({
      label: item.label,
      checked: checks[i],
    }))

  // Path 1 — All Clear (auto-capture with real blob, no race)
  const allClear = async () => {
    setSaving(true)
    setError('')
    try {
      const shot = await captureBlob()
      await patrolApi.saveCheckpoint(job.id, {
        checkpointId: current.id,
        allClear: true,
        checklistState: current.checklistTemplate.items.map((item) => ({
          label: item.label,
          checked: true,
        })),
        screenshot: shot ?? undefined,
      })
      advance()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save checkpoint')
    } finally {
      setSaving(false)
    }
  }

  // Path 2 — Issue found
  const saveIssue = async () => {
    setError('')
    if (!comment.trim()) {
      setError('A comment is required when flagging an issue')
      return
    }
    if (!screenshot) {
      setError('Please capture a screenshot of the issue')
      return
    }
    setSaving(true)
    try {
      await patrolApi.saveCheckpoint(job.id, {
        checkpointId: current.id,
        allClear: false,
        checklistState: buildChecklistState(),
        comment,
        screenshot,
      })
      advance()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save checkpoint')
    } finally {
      setSaving(false)
    }
  }

  const advance = () => {
    if (index < checkpoints.length - 1) {
      setIndex(index + 1)
    } else {
      complete()
    }
  }

  const complete = async () => {
    setCompleting(true)
    try {
      await patrolApi.complete(job.id)
      onComplete()
    } catch {
      setError('Failed to complete patrol')
      setCompleting(false)
    }
  }

  const progress = ((index + 1) / checkpoints.length) * 100

  return (
    <div className="viewer">
      <div className="viewer-topbar">
        <button className="viewer-exit" onClick={onExit}>
          ✕ Exit
        </button>
        <div className="viewer-progress">
          <div className="progress-label">
            Checkpoint {index + 1} of {checkpoints.length}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="viewer-route">{job.route.name}</div>
      </div>

      <div className="viewer-body">
        {/* Camera feed (placeholder — swap for <video> + HLS later) */}
        <div className="feed-panel">
          <div className="feed-header">
            <strong>{current.camera.name}</strong>
            <span>{current.camera.location || 'No location'}</span>
          </div>
          <div className="feed-frame">
            <div className="feed-placeholder">{current.camera.name}</div>
            <span className="feed-live">● LIVE</span>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <button className="btn-secondary capture-btn" onClick={capture}>
            📷 Capture Frame
          </button>
          {screenshotUrl && (
            <div className="capture-preview">
              <img src={screenshotUrl} alt="Captured" />
              <span>Screenshot captured</span>
            </div>
          )}
        </div>

        {/* Checklist + actions */}
        <div className="check-panel">
          <h3>{current.checklistTemplate.name}</h3>

          <div className="check-list">
            {current.checklistTemplate.items.map((item, i) => (
              <label key={item.id} className="check-item">
                <input
                  type="checkbox"
                  checked={checks[i] ?? true}
                  disabled={!issueMode}
                  onChange={() => toggleCheck(i)}
                />
                <span className={checks[i] ? '' : 'check-failed'}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {error && <div className="patrol-error">{error}</div>}

          {!issueMode ? (
            <div className="check-actions">
              <button
                className="btn-allclear"
                onClick={allClear}
                disabled={saving}
              >
                ✓ All Clear
              </button>
              <button
                className="btn-issue"
                onClick={() => setIssueMode(true)}
                disabled={saving}
              >
                ⚠ Flag Issue
              </button>
            </div>
          ) : (
            <div className="issue-form">
              <label>Describe the issue (required)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Gate left open, no personnel present"
                rows={3}
              />
              <p className="issue-hint">
                Uncheck the failed items above, capture a screenshot, and
                describe the issue.
              </p>
              <div className="check-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setIssueMode(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn-issue"
                  onClick={saveIssue}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Issue & Continue'}
                </button>
              </div>
            </div>
          )}

          <div className="viewer-nav">
            <button
              onClick={() => setIndex(index - 1)}
              disabled={index === 0 || saving}
            >
              ← Previous
            </button>
            <span>
              {index + 1} / {checkpoints.length}
            </span>
            <button
              onClick={() => setIndex(index + 1)}
              disabled={index === checkpoints.length - 1 || saving}
            >
              Next →
            </button>
          </div>

          {index === checkpoints.length - 1 && (
            <button
              className="btn-primary complete-btn"
              onClick={complete}
              disabled={completing}
            >
              {completing ? 'Completing…' : '🏁 Complete Patrol'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Stage 3: Summary ---------- */

function PatrolSummary({
  jobId,
  onDone,
}: {
  jobId: string
  onDone: () => void
}) {
  const [job, setJob] = useState<PatrolJob | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    patrolApi
      .getJob(jobId)
      .then(setJob)
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) return <p className="patrol-loading">Loading summary…</p>
  if (!job) return <p className="patrol-error">Could not load summary.</p>

  const resultByCp = new Map(job.results.map((r) => [r.checkpointId, r]))
  const issues = job.results.filter((r) => !r.allClear)

  return (
    <div className="summary">
      <div className="summary-head">
        <div className="summary-check">✓</div>
        <h2>Patrol Complete</h2>
        <p>
          {job.route.name} · {job.route.site.name}
        </p>
      </div>

      <div className="summary-stats">
        <div className="summary-stat">
          <strong>{job.route.checkpoints.length}</strong>
          <span>Checkpoints</span>
        </div>
        <div className="summary-stat">
          <strong className={issues.length ? 'stat-issue' : 'stat-clear'}>
            {issues.length}
          </strong>
          <span>Issues flagged</span>
        </div>
        <div className="summary-stat">
          <strong>{job.route.checkpoints.length - issues.length}</strong>
          <span>All clear</span>
        </div>
      </div>

      <h3 className="summary-section">Checkpoint Results</h3>
      <div className="summary-list">
        {job.route.checkpoints.map((cp: PatrolCheckpoint, i) => {
          const result = resultByCp.get(cp.id)
          const flagged = result && !result.allClear
          return (
            <div
              key={cp.id}
              className={`summary-row ${flagged ? 'flagged' : ''}`}
            >
              <span className="summary-num">{i + 1}</span>
              <div className="summary-info">
                <strong>{cp.camera.name}</strong>
                {flagged ? (
                  <span className="summary-issue">⚠ {result?.comment}</span>
                ) : (
                  <span className="summary-ok">✓ All clear</span>
                )}
              </div>
              {result?.screenshotPath && (
                <img
                  className="summary-thumb"
                  src={`http://localhost:3000/uploads/${result.screenshotPath}`}
                  alt="capture"
                />
              )}
            </div>
          )
        })}
      </div>

      <button className="btn-primary summary-done" onClick={onDone}>
        Back to Patrols
      </button>
    </div>
  )
}