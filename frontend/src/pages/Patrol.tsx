import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import type {
  PatrolSite,
  PatrolRouteSummary,
  PatrolJob,
  PatrolCheckpoint,
} from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import { camerasApi } from '../lib/cameras'
import { api } from '../lib/api'
import SearchableSelect from '../components/SearchableSelect'
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
  const [resumePrompt, setResumePrompt] = useState<{ jobId: string } | null>(
    null,
  )

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
      const data = err?.response?.data
      if (data?.code === 'OWN_ACTIVE_PATROL' && data?.jobId) {
        setResumePrompt({ jobId: data.jobId })
      } else if (data?.code === 'OTHER_ACTIVE_PATROL') {
        setError('A patrol is already active on this site by another operator.')
      } else {
        setError(data?.message || 'Failed to start patrol')
      }
    } finally {
      setStarting(false)
    }
  }

  const resume = async () => {
    if (!resumePrompt) return
    setStarting(true)
    try {
      const job = await patrolApi.getJob(resumePrompt.jobId)
      onStarted(job)
    } catch {
      setError('Failed to resume patrol')
    } finally {
      setStarting(false)
      setResumePrompt(null)
    }
  }

  const discardAndStart = async () => {
    if (!resumePrompt) return
    setStarting(true)
    try {
      await patrolApi.discard(siteId)
      const { job, route } = await patrolApi.start(routeId)
      onStarted({ ...job, route, results: job.results ?? [] })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to start patrol')
    } finally {
      setStarting(false)
      setResumePrompt(null)
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
            <SearchableSelect
              value={siteId}
              onChange={(v) => setSiteId(v)}
              placeholder="Select a site…"
              options={sites.map((s) => ({
                value: s.id,
                label: s.name,
                sub: s.address ?? undefined,
              }))}
            />
          </div>

          <div className="picker-field">
            <label>Route</label>
            <SearchableSelect
              value={routeId}
              onChange={(v) => setRouteId(v)}
              placeholder="Select a route…"
              disabled={!siteId}
              options={routes.map((r) => ({
                value: r.id,
                label: r.name,
                sub: `${r._count.checkpoints} checkpoints${
                  r.estimatedMinutes ? ` · ~${r.estimatedMinutes} min` : ''
                }`,
              }))}
            />
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

      {resumePrompt && (
        <div className="resume-backdrop" onClick={() => setResumePrompt(null)}>
          <div className="resume-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Active patrol found</h3>
            <p>
              You already have an active patrol on this site. Would you like to
              resume it, or discard it and start a new one?
            </p>
            <div className="resume-actions">
              <button
                className="btn-secondary"
                onClick={discardAndStart}
                disabled={starting}
              >
                Discard & Start New
              </button>
              <button
                className="btn-primary"
                onClick={resume}
                disabled={starting}
              >
                {starting ? 'Please wait…' : 'Resume Patrol'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamError, setStreamError] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    setChecks(current.checklistTemplate.items.map(() => true))
    setComment('')
    setIssueMode(false)
    setScreenshot(null)
    setScreenshotUrl('')
    setError('')
  }, [index])

  // Load the camera's stream, if it has one. The admin just enters the
  // camera's rtsp:// link (or an existing http(s) HLS url) -- the backend
  // resolves that into a playable HLS url, transcoding rtsp on the fly.
  useEffect(() => {
    const video = videoRef.current
    const streamUrl = current.camera.streamUrl
    if (!video || !streamUrl) return

    let hls: Hls | null = null
    let cancelled = false
    setStreamError('')
    setConnecting(true)

    camerasApi
      .getStreamUrl(current.camera.id)
      .then(({ url, mode }) => {
        if (cancelled || !videoRef.current) return
        // Relative "/streams/..." urls come from our own backend; direct
        // http(s) urls (already HLS/MJPEG) are used as-is.
        const playUrl = mode === 'proxy' ? `${api.defaults.baseURL}${url}` : url

        if (Hls.isSupported()) {
          hls = new Hls()
          hls.loadSource(playUrl)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setConnecting(false)
            video.play().catch(() => {})
          })
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              setConnecting(false)
              setStreamError('Lost connection to camera stream')
            }
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playUrl
          video.play().catch(() => {})
          setConnecting(false)
        } else {
          setConnecting(false)
          setStreamError('This browser cannot play the camera stream')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setConnecting(false)
        setStreamError(
          err?.response?.data?.message || 'Could not connect to camera stream',
        )
      })

    return () => {
      cancelled = true
      if (hls) hls.destroy()
    }
  }, [index])

  const captureBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) return resolve(null)
      const video = videoRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)

      const hasStream =
        !!current.camera.streamUrl && video && video.videoWidth > 0

      if (hasStream) {
        canvas.width = video!.videoWidth
        canvas.height = video!.videoHeight
        ctx.drawImage(video!, 0, 0, canvas.width, canvas.height)
      } else {
        canvas.width = 640
        canvas.height = 360
        ctx.fillStyle = '#011f4b'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#b3cde0'
        ctx.font = 'bold 40px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(current.camera.name, canvas.width / 2, canvas.height / 2)
        ctx.textAlign = 'left'
      }

      ctx.fillStyle = 'rgba(1,31,75,0.7)'
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

  const saveIssue = async () => {
    setError('')
    const anyUnticked = checks.some((c) => !c)
    if (anyUnticked && !comment.trim()) {
      setError('A comment is required when any item is left unchecked')
      return
    }
    if (!screenshot) {
      setError('Please capture a screenshot')
      return
    }
    setSaving(true)
    try {
      await patrolApi.saveCheckpoint(job.id, {
        checkpointId: current.id,
        allClear: checks.every((c) => c),
        checklistState: buildChecklistState(),
        comment: comment || undefined,
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
        <div className="feed-panel">
          <div className="feed-header">
            <strong>{current.camera.name}</strong>
            <span>{current.camera.location || 'No location'}</span>
          </div>
          <div className="feed-frame">
            {current.camera.streamUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="feed-video"
                  muted
                  playsInline
                  autoPlay
                />
                {connecting && (
                  <div className="feed-placeholder">Connecting to camera…</div>
                )}
                {streamError && !connecting && (
                  <div className="feed-placeholder">{streamError}</div>
                )}
              </>
            ) : (
              <div className="feed-placeholder">{current.camera.name}</div>
            )}
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
                className="btn-issue"
                onClick={() => {
                  setIssueMode(true)
                  setChecks(current.checklistTemplate.items.map(() => false))
                }}
                disabled={saving}
              >
                ⚠ Flag Issue
              </button>
            </div>
          ) : (
            <div className="issue-form">
              <p className="issue-hint">
                Tick each item you have verified. Leave failed items unchecked
                and describe them below.
              </p>
              <label>
                Comment {checks.some((c) => !c) ? '(required)' : '(optional)'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe any issues found…"
                rows={3}
              />
              <div className="check-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setIssueMode(false)
                    setChecks(current.checklistTemplate.items.map(() => true))
                    setComment('')
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn-issue"
                  onClick={saveIssue}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save & Continue'}
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