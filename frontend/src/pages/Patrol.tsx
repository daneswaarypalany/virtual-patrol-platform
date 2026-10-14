import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import Hls from 'hls.js'
import {
  ArrowUpRight,
  Circle as CircleIcon,
  MousePointer2,
  Pencil,
  Trash2,
  Undo2,
} from 'lucide-react'
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
type AnnotationTool = 'pen' | 'circle' | 'arrow'
type AnnotationPoint = { x: number; y: number }
type PatrolAnnotation = {
  id: number
  tool: AnnotationTool
  points: AnnotationPoint[]
  color: string
  width: number
}

const ANNOTATION_COLOR = '#ff3b30'
const ANNOTATION_WIDTH = 3

function drawPatrolAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: PatrolAnnotation,
  mapPoint: (point: AnnotationPoint) => { x: number; y: number },
  lineWidth: number,
) {
  if (!annotation.points.length) return
  const points = annotation.points.map(mapPoint)
  const first = points[0]
  const last = points[points.length - 1]

  ctx.save()
  ctx.strokeStyle = annotation.color
  ctx.fillStyle = annotation.color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = Math.max(1, lineWidth * 0.65)

  if (annotation.tool === 'pen') {
    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(first.x, first.y, Math.max(1.4, lineWidth / 2), 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y)
      }
      ctx.stroke()
    }
  } else if (annotation.tool === 'circle') {
    const rx = Math.abs(last.x - first.x) / 2
    const ry = Math.abs(last.y - first.y) / 2
    ctx.beginPath()
    ctx.ellipse(
      (first.x + last.x) / 2,
      (first.y + last.y) / 2,
      Math.max(rx, 1),
      Math.max(ry, 1),
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
  } else {
    const dx = last.x - first.x
    const dy = last.y - first.y
    const length = Math.hypot(dx, dy)
    if (length > 0.5) {
      const angle = Math.atan2(dy, dx)
      const head = Math.max(lineWidth * 4, 8)
      ctx.beginPath()
      ctx.moveTo(first.x, first.y)
      ctx.lineTo(last.x, last.y)
      ctx.moveTo(
        last.x - head * Math.cos(angle - Math.PI / 6),
        last.y - head * Math.sin(angle - Math.PI / 6),
      )
      ctx.lineTo(last.x, last.y)
      ctx.lineTo(
        last.x - head * Math.cos(angle + Math.PI / 6),
        last.y - head * Math.sin(angle + Math.PI / 6),
      )
      ctx.stroke()
    }
  }
  ctx.restore()
}

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

  const [issues, setIssues] = useState<boolean[]>([])
  const [comment, setComment] = useState('')
  const [screenshot, setScreenshot] = useState<Blob | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')


  const canvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  const feedFrameRef = useRef<HTMLDivElement>(null)
  const annotationsRef = useRef<PatrolAnnotation[]>([])
  const activeAnnotationRef = useRef<PatrolAnnotation | null>(null)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool | null>(
    null,
  )
  const [annotationCount, setAnnotationCount] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamError, setStreamError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [, setCompleting] = useState(false)

  const redrawAnnotations = useCallback(() => {
    const canvas = annotationCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr))
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const annotations = activeAnnotationRef.current
      ? [...annotationsRef.current, activeAnnotationRef.current]
      : annotationsRef.current
    annotations.forEach((annotation) =>
      drawPatrolAnnotation(
        ctx,
        annotation,
        (point) => ({ x: point.x * rect.width, y: point.y * rect.height }),
        annotation.width,
      ),
    )
  }, [])

  useEffect(() => {
    const canvas = annotationCanvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(redrawAnnotations)
    observer.observe(canvas)
    redrawAnnotations()
    return () => observer.disconnect()
  }, [redrawAnnotations, index])

  useEffect(() => {
    setIssues(current.checklistTemplate.items.map(() => false))
    setComment('')
    setScreenshot(null)
    setScreenshotUrl('')
    annotationsRef.current = []
    activeAnnotationRef.current = null
    setAnnotationCount(0)
    setAnnotationTool(null)
    setError('')
    redrawAnnotations()
  }, [index, redrawAnnotations])

  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
    }
  }, [screenshotUrl])

  const getAnnotationPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const beginAnnotation = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!annotationTool) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const point = getAnnotationPoint(event)
    activeAnnotationRef.current = {
      id: Date.now(),
      tool: annotationTool,
      points: [point],
      color: ANNOTATION_COLOR,
      width: ANNOTATION_WIDTH,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    redrawAnnotations()
  }

  const moveAnnotation = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeAnnotationRef.current
    if (!active) return
    event.preventDefault()
    const point = getAnnotationPoint(event)
    if (active.tool === 'pen') {
      const previous = active.points[active.points.length - 1]
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) return
      activeAnnotationRef.current = { ...active, points: [...active.points, point] }
    } else {
      activeAnnotationRef.current = { ...active, points: [active.points[0], point] }
    }
    redrawAnnotations()
  }

  const finishAnnotation = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeAnnotationRef.current
    if (!active) return
    activeAnnotationRef.current = null
    if (active.tool !== 'pen') {
      const start = active.points[0]
      const end = active.points[active.points.length - 1] ?? start
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.004) {
        if (
          event &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        redrawAnnotations()
        return
      }
    }
    annotationsRef.current = [...annotationsRef.current, active]
    setAnnotationCount(annotationsRef.current.length)
    // A changed markup invalidates any previous capture to prevent stale evidence.
    setScreenshot(null)
    setScreenshotUrl('')
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    redrawAnnotations()
  }

  const undoAnnotation = () => {
    if (!annotationsRef.current.length) return
    annotationsRef.current = annotationsRef.current.slice(0, -1)
    setAnnotationCount(annotationsRef.current.length)
    setScreenshot(null)
    setScreenshotUrl('')
    redrawAnnotations()
  }

  const clearAnnotations = () => {
    if (!annotationsRef.current.length && !activeAnnotationRef.current) return
    annotationsRef.current = []
    activeAnnotationRef.current = null
    setAnnotationCount(0)
    setScreenshot(null)
    setScreenshotUrl('')
    redrawAnnotations()
  }

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

      // Composite the visible annotations into the captured evidence only.
      // The live <video> element is never modified. Account for object-fit: cover
      // so marks line up with what the operator saw even if the stream aspect
      // ratio differs from the displayed 16:9 frame.
      const frameRect = feedFrameRef.current?.getBoundingClientRect()
      const displayWidth = frameRect?.width || 640
      const displayHeight = frameRect?.height || 360
      const scale = Math.max(
        displayWidth / canvas.width,
        displayHeight / canvas.height,
      )
      const cropX = (canvas.width * scale - displayWidth) / 2
      const cropY = (canvas.height * scale - displayHeight) / 2
      const mapToCapture = (point: AnnotationPoint) => ({
        x: (point.x * displayWidth + cropX) / scale,
        y: (point.y * displayHeight + cropY) / scale,
      })
      annotationsRef.current.forEach((annotation) =>
        drawPatrolAnnotation(
          ctx,
          annotation,
          mapToCapture,
          annotation.width / scale,
        ),
      )

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

  const toggleIssue = (i: number) => {
    setIssues((arr) => arr.map((v, idx) => (idx === i ? !v : v)))
  }

  const buildChecklistState = () =>
    current.checklistTemplate.items.map((item, i) => ({
      label: item.label,
      checked: !issues[i],
    }))

  const saveCurrent = async () => {
    setError('')
    const anyIssue = issues.some(Boolean)
    if (anyIssue && !comment.trim()) {
      setError('A comment is required when an issue is flagged')
      return
    }
    if (!screenshot) {
      setError('Please capture a screenshot before continuing')
      return
    }
    setSaving(true)
    try {
      await patrolApi.saveCheckpoint(job.id, {
        checkpointId: current.id,
        allClear: !anyIssue,
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
          <div className="feed-frame" ref={feedFrameRef}>
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
            <canvas
              ref={annotationCanvasRef}
              className={`feed-annotation-canvas${annotationTool ? ' is-active' : ''}`}
              aria-label="Draw annotations on the live camera frame"
              role="img"
              onPointerDown={beginAnnotation}
              onPointerMove={moveAnnotation}
              onPointerUp={finishAnnotation}
              onPointerCancel={finishAnnotation}
            />
            <span className="feed-live">● LIVE</span>
          </div>

          <div
            className="annotation-tools"
            role="toolbar"
            aria-label="Camera annotation tools"
          >
            <div className="annotation-tools-head">
              <strong>Mark up live frame</strong>
              <span>
                {annotationCount} {annotationCount === 1 ? 'mark' : 'marks'}
              </span>
            </div>
            <div className="annotation-tools-actions">
              <button
                type="button"
                className={`annotation-tool-button${annotationTool === 'pen' ? ' active' : ''}`}
                aria-pressed={annotationTool === 'pen'}
                onClick={() =>
                  setAnnotationTool((tool) => (tool === 'pen' ? null : 'pen'))
                }
                title="Freehand draw"
              >
                <Pencil size={16} aria-hidden="true" /> <span>Draw</span>
              </button>
              <button
                type="button"
                className={`annotation-tool-button${annotationTool === 'circle' ? ' active' : ''}`}
                aria-pressed={annotationTool === 'circle'}
                onClick={() =>
                  setAnnotationTool((tool) => (tool === 'circle' ? null : 'circle'))
                }
                title="Circle an object"
              >
                <CircleIcon size={16} aria-hidden="true" /> <span>Circle</span>
              </button>
              <button
                type="button"
                className={`annotation-tool-button${annotationTool === 'arrow' ? ' active' : ''}`}
                aria-pressed={annotationTool === 'arrow'}
                onClick={() =>
                  setAnnotationTool((tool) => (tool === 'arrow' ? null : 'arrow'))
                }
                title="Point with an arrow"
              >
                <ArrowUpRight size={16} aria-hidden="true" /> <span>Arrow</span>
              </button>
              <button
                type="button"
                className="annotation-tool-button"
                onClick={undoAnnotation}
                disabled={annotationCount === 0}
                title="Undo last annotation"
              >
                <Undo2 size={16} aria-hidden="true" /> <span>Undo</span>
              </button>
              <button
                type="button"
                className="annotation-tool-button annotation-tool-clear"
                onClick={clearAnnotations}
                disabled={annotationCount === 0}
                title="Clear all annotations"
              >
                <Trash2 size={16} aria-hidden="true" /> <span>Clear</span>
              </button>
              {annotationTool && (
                <button
                  type="button"
                  className="annotation-tool-button annotation-tool-done"
                  onClick={() => setAnnotationTool(null)}
                  title="Exit drawing mode"
                >
                  <MousePointer2 size={16} aria-hidden="true" /> <span>Done</span>
                </button>
              )}
            </div>
            <p className="annotation-tools-hint">
              Choose Draw, Circle, or Arrow, then drag on the camera image. Marks are added to the screenshot when you capture it.
            </p>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <button className="btn-secondary capture-btn" onClick={capture}>
            📷 Capture Frame{annotationCount ? ' with Annotations' : ''}
          </button>
          {screenshotUrl ? (
            <div className="capture-preview">
              <img src={screenshotUrl} alt="Captured" />
              <span>{annotationCount ? 'Screenshot captured with annotations' : 'Screenshot captured'}</span>
            </div>
          ) : (
            <p className="capture-hint">
              A screenshot is required before you can continue to the next
              checkpoint.
            </p>
          )}
        </div>

        <div className="check-panel">
          <h3>{current.checklistTemplate.name}</h3>

          <div className="check-section">
            <div className="check-section-label">Checklist</div>
            <div className="check-list">
              {current.checklistTemplate.items.map(
                (item, i) =>
                  !issues[i] && (
                    <label key={item.id} className="check-item">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleIssue(i)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ),
              )}
              {issues.every(Boolean) && (
                <p className="check-empty">
                  All items have been flagged below.
                </p>
              )}
            </div>
          </div>

          {issues.some(Boolean) && (
            <div className="check-section check-section-issues">
              <div className="check-section-label check-section-label-issue">
                ⚠ Issues Found
              </div>
              <div className="check-list">
                {current.checklistTemplate.items.map(
                  (item, i) =>
                    issues[i] && (
                      <label key={item.id} className="check-item check-item-issue">
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => toggleIssue(i)}
                        />
                        <span className="check-failed">{item.label}</span>
                      </label>
                    ),
                )}
              </div>
              <div className="issue-comment">
                <label>Comment (required)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Describe any issues found…"
                  rows={3}
                />
              </div>
            </div>
          )}

          {error && <div className="patrol-error">{error}</div>}

          <div className="check-actions">
            <button
              className="btn-primary"
              onClick={saveCurrent}
              disabled={saving || !screenshot}
              title={!screenshot ? 'Capture a screenshot first' : undefined}
            >
              {saving
                ? 'Saving…'
                : index === checkpoints.length - 1
                  ? '🏁 Save & Complete Patrol'
                  : '✓ Save & Continue'}
            </button>
          </div>

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
          </div>
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
                  src={`https://virtual-patrol-platform-8ib6.vercel.app/uploads/${result.screenshotPath}`}
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