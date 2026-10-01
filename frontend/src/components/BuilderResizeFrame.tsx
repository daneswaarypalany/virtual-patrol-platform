import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import './BuilderResizeFrame.css'

/*
 * Shared outer frame for the Report Builder and Summary Report Builder.
 *
 * - Renders the existing `.report-builder` container and puts the builder's
 *   content in an inner wrapper, so the frame can have a fixed size without
 *   any visible scrollbars (the wrapper scrolls with its scrollbars hidden).
 * - Adds a single pill-shaped handle at the bottom-right corner that resizes
 *   the frame horizontally and vertically in real time.
 * - Until the user touches the handle the frame has no explicit size, so the
 *   initial layout is exactly what it was before.
 *
 * The children are rendered by the parent, so builder state is untouched and
 * children are not re-rendered while resizing.
 */

const MIN_W = 720
const MAX_W = 2400
const MIN_H = 480
const MAX_H = 2400
const KEY_STEP = 16
const KEY_STEP_LARGE = 64

type Size = { w: number; h: number }

// Keeps a dimension within [min, max]. If the frame's natural size is already
// outside that range (e.g. a very narrow window) the natural size is
// respected so the first interaction never causes a jump.
function clampDim(value: number, min: number, max: number, start: number) {
  return Math.min(Math.max(value, Math.min(min, start)), Math.max(max, start))
}

export default function BuilderResizeFrame({
  children,
}: {
  children: ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    x: number
    y: number
    start: Size
  } | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [dragging, setDragging] = useState(false)

  // Keep the cursor as `grabbing` and avoid text selection for the whole
  // drag, even when the pointer leaves the handle.
  useEffect(() => {
    if (!dragging) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
    }
  }, [dragging])

  const measure = (): Size | null => {
    const el = frameRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { w: rect.width, h: rect.height }
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const start = measure()
    if (!start) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, start }
    setSize(start)
    setDragging(true)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setSize({
      w: clampDim(
        drag.start.w + e.clientX - drag.x,
        MIN_W,
        MAX_W,
        drag.start.w,
      ),
      h: clampDim(
        drag.start.h + e.clientY - drag.y,
        MIN_H,
        MAX_H,
        drag.start.h,
      ),
    })
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  // Keyboard support: arrow keys resize, double-click resets to auto size.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let dx = 0
    let dy = 0
    if (e.key === 'ArrowRight') dx = step
    else if (e.key === 'ArrowLeft') dx = -step
    else if (e.key === 'ArrowDown') dy = step
    else if (e.key === 'ArrowUp') dy = -step
    else return
    e.preventDefault()
    const current = size ?? measure()
    if (!current) return
    setSize({
      w: clampDim(current.w + dx, MIN_W, MAX_W, current.w),
      h: clampDim(current.h + dy, MIN_H, MAX_H, current.h),
    })
  }

  return (
    <div
      ref={frameRef}
      className="report-builder rb-frame"
      style={size ? { width: size.w, height: size.h } : undefined}
    >
      <div className={`rb-frame-scroll${size ? ' is-sized' : ''}`}>
        {children}
      </div>
      <div
        className={`rb-resize-pill${dragging ? ' is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Resize builder. Drag, or use the arrow keys."
        title="Drag to resize (double-click to reset)"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setSize(null)}
      />
    </div>
  )
}