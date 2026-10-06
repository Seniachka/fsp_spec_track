import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type PhotoCropperProps = {
  imageUrl: string
  onCancel: () => void
  onConfirm: (file: File, previewUrl: string) => void
  confirming?: boolean
  error?: string | null
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type DragMode =
  | { type: 'pan' }
  | { type: 'move-frame' }
  | { type: 'resize'; corner: Corner }
  | null

/**
 * Итог всегда пережимается в JPEG 1024×1024: сервер принимает только
 * JPEG/PNG/GIF/WebP по магическим байтам и тело запроса ≤10 МБ, а с камеры
 * iPhone/из пикера может прийти HEIC на десятки мегапикселей. Квадрат 1024 при
 * quality 0.92 — это ~200–400 КБ, с огромным запасом до лимита.
 */
const OUTPUT_SIZE = 1024
const OUTPUT_QUALITY = 0.92
const MIN_CROP_PX = 72
const MIN_CROP_RATIO = 0.2
const MIN_SCALE = 1
const MAX_SCALE = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const PhotoCropper = ({
  imageUrl,
  onCancel,
  onConfirm,
  confirming = false,
  error = null,
}: PhotoCropperProps) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [baseSize, setBaseSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 200 })
  const [ready, setReady] = useState(false)
  /** Картинку не открыть/не пережать — без этого «Использовать» просто молчит */
  const [imageError, setImageError] = useState<string | null>(null)

  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startOffset: { x: number; y: number }
    startCrop: { x: number; y: number; size: number }
    pointers: Map<number, { x: number; y: number }>
    pinchDist: number
    pinchScale: number
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    startOffset: { x: 0, y: 0 },
    startCrop: { x: 0, y: 0, size: 0 },
    pointers: new Map(),
    pinchDist: 0,
    pinchScale: 1,
  })

  const measureViewport = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setViewport({ w: rect.width, h: rect.height })
  }, [])

  useEffect(() => {
    measureViewport()
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measureViewport())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measureViewport])

  useEffect(() => {
    if (!natural.w || !natural.h || !viewport.w || !viewport.h) return

    const fit = Math.min(viewport.w / natural.w, viewport.h / natural.h)
    const bw = natural.w * fit
    const bh = natural.h * fit
    setBaseSize({ w: bw, h: bh })

    const size = Math.min(bw, bh) * 0.86
    setCrop({
      x: (viewport.w - size) / 2,
      y: (viewport.h - size) / 2,
      size,
    })
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setReady(true)
  }, [natural, viewport.w, viewport.h])

  const displayW = baseSize.w * scale
  const displayH = baseSize.h * scale
  const imgLeft = (viewport.w - displayW) / 2 + offset.x
  const imgTop = (viewport.h - displayH) / 2 + offset.y

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextScale: number, nextCrop: { x: number; y: number; size: number }) => {
      const dw = baseSize.w * nextScale
      const dh = baseSize.h * nextScale
      let x = next.x
      let y = next.y

      const left = (viewport.w - dw) / 2 + x
      const top = (viewport.h - dh) / 2 + y

      if (dw >= nextCrop.size) {
        if (left > nextCrop.x) x -= left - nextCrop.x
        if (left + dw < nextCrop.x + nextCrop.size) x += nextCrop.x + nextCrop.size - (left + dw)
      } else {
        x = nextCrop.x + nextCrop.size / 2 - viewport.w / 2
      }

      if (dh >= nextCrop.size) {
        if (top > nextCrop.y) y -= top - nextCrop.y
        if (top + dh < nextCrop.y + nextCrop.size) y += nextCrop.y + nextCrop.size - (top + dh)
      } else {
        y = nextCrop.y + nextCrop.size / 2 - viewport.h / 2
      }

      return { x, y }
    },
    [baseSize.h, baseSize.w, viewport.h, viewport.w],
  )

  const getCropLimits = useCallback(
    (dw: number, dh: number) => {
      const maxSize = Math.min(dw, dh, viewport.w, viewport.h)
      const minSize = Math.min(maxSize, Math.max(MIN_CROP_PX, maxSize * MIN_CROP_RATIO))
      return { minSize, maxSize }
    },
    [viewport.h, viewport.w],
  )

  const clampCrop = useCallback(
    (next: { x: number; y: number; size: number }, left: number, top: number, dw: number, dh: number) => {
      const { minSize, maxSize } = getCropLimits(dw, dh)
      const size = clamp(next.size, minSize, maxSize)
      const x = clamp(next.x, Math.max(0, left), Math.min(viewport.w - size, left + dw - size))
      const y = clamp(next.y, Math.max(0, top), Math.min(viewport.h - size, top + dh - size))
      return { x, y, size }
    },
    [getCropLimits, viewport.h, viewport.w],
  )

  const imageBounds = (nextScale: number, nextOffset: { x: number; y: number }) => {
    const dw = baseSize.w * nextScale
    const dh = baseSize.h * nextScale
    return {
      left: (viewport.w - dw) / 2 + nextOffset.x,
      top: (viewport.h - dh) / 2 + nextOffset.y,
      dw,
      dh,
    }
  }

  const applyScale = (nextScale: number, anchorX?: number, anchorY?: number) => {
    const s = clamp(nextScale, MIN_SCALE, MAX_SCALE)
    const ax = anchorX ?? crop.x + crop.size / 2
    const ay = anchorY ?? crop.y + crop.size / 2

    const prevW = baseSize.w * scale
    const prevH = baseSize.h * scale
    const prevLeft = (viewport.w - prevW) / 2 + offset.x
    const prevTop = (viewport.h - prevH) / 2 + offset.y
    const relX = prevW > 0 ? (ax - prevLeft) / prevW : 0.5
    const relY = prevH > 0 ? (ay - prevTop) / prevH : 0.5

    const nextW = baseSize.w * s
    const nextH = baseSize.h * s
    const nextOffset = {
      x: ax - relX * nextW - (viewport.w - nextW) / 2,
      y: ay - relY * nextH - (viewport.h - nextH) / 2,
    }

    const { left, top, dw, dh } = imageBounds(s, nextOffset)
    const nextCrop = clampCrop(crop, left, top, dw, dh)

    setScale(s)
    setCrop(nextCrop)
    setOffset(clampOffset(nextOffset, s, nextCrop))
  }

  const { minSize: currentMinCropSize, maxSize: currentMaxCropSize } = getCropLimits(displayW, displayH)
  const cropSizePercent =
    currentMaxCropSize <= currentMinCropSize
      ? 100
      : Math.round(((crop.size - currentMinCropSize) / (currentMaxCropSize - currentMinCropSize)) * 100)

  const setCropSizePercent = (percent: number) => {
    const p = clamp(percent, 0, 100)
    const { left, top, dw, dh } = imageBounds(scale, offset)
    const { minSize, maxSize } = getCropLimits(dw, dh)
    const nextSize = minSize + (maxSize - minSize) * (p / 100)
    const centerX = crop.x + crop.size / 2
    const centerY = crop.y + crop.size / 2
    const nextCrop = clampCrop(
      {
        x: centerX - nextSize / 2,
        y: centerY - nextSize / 2,
        size: nextSize,
      },
      left,
      top,
      dw,
      dh,
    )
    setCrop(nextCrop)
    setOffset((prev) => clampOffset(prev, scale, nextCrop))
  }

  const onPointerDown = (e: ReactPointerEvent, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    const drag = dragRef.current
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (drag.pointers.size === 2) {
      const pts = [...drag.pointers.values()]
      drag.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      drag.pinchScale = scale
      drag.mode = { type: 'pan' }
      return
    }

    drag.mode = mode
    drag.startX = e.clientX
    drag.startY = e.clientY
    drag.startOffset = { ...offset }
    drag.startCrop = { ...crop }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag.pointers.has(e.pointerId)) return
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (drag.pointers.size === 2) {
      const pts = [...drag.pointers.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (drag.pinchDist > 0) {
        const rect = viewportRef.current?.getBoundingClientRect()
        const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0)
        const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0)
        applyScale(drag.pinchScale * (dist / drag.pinchDist), midX, midY)
      }
      return
    }

    if (!drag.mode) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (drag.mode.type === 'pan') {
      setOffset(clampOffset({ x: drag.startOffset.x + dx, y: drag.startOffset.y + dy }, scale, crop))
      return
    }

    const { left, top, dw, dh } = imageBounds(scale, offset)

    if (drag.mode.type === 'move-frame') {
      setCrop(
        clampCrop(
          {
            x: drag.startCrop.x + dx,
            y: drag.startCrop.y + dy,
            size: drag.startCrop.size,
          },
          left,
          top,
          dw,
          dh,
        ),
      )
      return
    }

    const start = drag.startCrop
    const corner = drag.mode.corner
    let x = start.x
    let y = start.y
    let size = start.size

    if (corner === 'se') {
      size = start.size + (dx + dy) / 2
      x = start.x
      y = start.y
    } else if (corner === 'nw') {
      size = start.size - (dx + dy) / 2
      x = start.x + start.size - size
      y = start.y + start.size - size
    } else if (corner === 'ne') {
      size = start.size + (dx - dy) / 2
      x = start.x
      y = start.y + start.size - size
    } else {
      size = start.size + (-dx + dy) / 2
      x = start.x + start.size - size
      y = start.y
    }

    setCrop(clampCrop({ x, y, size }, left, top, dw, dh))
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    drag.pointers.delete(e.pointerId)
    if (drag.pointers.size === 0) {
      drag.mode = null
      drag.pinchDist = 0
      return
    }
    if (drag.pointers.size === 1) {
      const remaining = [...drag.pointers.values()][0]
      drag.startX = remaining.x
      drag.startY = remaining.y
      drag.startOffset = { ...offset }
      drag.startCrop = { ...crop }
      drag.mode = { type: 'pan' }
    }
  }

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img || !natural.w || displayW <= 0) return

    const ratio = natural.w / displayW
    const sx = (crop.x - imgLeft) * ratio
    const sy = (crop.y - imgTop) * ratio
    const sSize = crop.size * ratio

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    // toBlob с явным 'image/jpeg' — единственный выход наружу: что бы ни выбрали
    // (HEIC, PNG, гигантский кадр), на сервер уходит JPEG нужного размера
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', OUTPUT_QUALITY),
    )
    if (!blob) {
      setImageError('Не удалось подготовить фото. Попробуй ещё раз')
      return
    }

    const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' })
    onConfirm(file, URL.createObjectURL(blob))
  }

  return (
    <div className="photo-crop">
      <div
        ref={viewportRef}
        className="photo-crop__viewport"
        onPointerDown={(e) => onPointerDown(e, { type: 'pan' })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          e.preventDefault()
          const rect = viewportRef.current?.getBoundingClientRect()
          if (!rect) return
          applyScale(
            scale * (e.deltaY < 0 ? 1.08 : 0.92),
            e.clientX - rect.left,
            e.clientY - rect.top,
          )
        }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          className="photo-crop__image"
          draggable={false}
          style={{
            width: displayW || undefined,
            height: displayH || undefined,
            left: imgLeft,
            top: imgTop,
            opacity: ready ? 1 : 0,
          }}
          onLoad={(e) => {
            const el = e.currentTarget
            setImageError(null)
            setNatural({ w: el.naturalWidth, h: el.naturalHeight })
          }}
          onError={() => {
            // Формат, который движок не декодирует (напр. HEIC на старой iOS):
            // без этого кнопка «Использовать» остаётся выключенной молча
            setImageError('Не удалось открыть это изображение. Выбери другое фото')
          }}
        />

        {ready && (
          <>
            <div className="photo-crop__shade photo-crop__shade--top" style={{ height: crop.y }} />
            <div
              className="photo-crop__shade photo-crop__shade--left"
              style={{ top: crop.y, height: crop.size, width: crop.x }}
            />
            <div
              className="photo-crop__shade photo-crop__shade--right"
              style={{
                top: crop.y,
                height: crop.size,
                left: crop.x + crop.size,
                width: Math.max(0, viewport.w - crop.x - crop.size),
              }}
            />
            <div
              className="photo-crop__shade photo-crop__shade--bottom"
              style={{
                top: crop.y + crop.size,
                height: Math.max(0, viewport.h - crop.y - crop.size),
              }}
            />

            <div
              className="photo-crop__frame"
              style={{ left: crop.x, top: crop.y, width: crop.size, height: crop.size }}
              onPointerDown={(e) => onPointerDown(e, { type: 'move-frame' })}
            >
              <span className="photo-crop__grid" aria-hidden />
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label="Изменить размер рамки"
                  className={`photo-crop__handle photo-crop__handle--${corner}`}
                  onPointerDown={(e) => onPointerDown(e, { type: 'resize', corner })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <label className="photo-crop__zoom">
        <span>Масштаб</span>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.01}
          value={scale}
          onChange={(e) => applyScale(Number(e.target.value))}
        />
      </label>

      <label className="photo-crop__zoom">
        <span>Размер рамки</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={cropSizePercent}
          onChange={(e) => setCropSizePercent(Number(e.target.value))}
        />
      </label>

      {(imageError || error) && <p className="photo-modal__error">{imageError || error}</p>}

      <div className="preview-modal__actions">
        <button type="button" className="preview-modal__btn preview-modal__btn--secondary" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="preview-modal__btn preview-modal__btn--primary"
          disabled={!ready || confirming}
          onClick={() => void handleConfirm()}
        >
          {confirming ? 'Загрузка…' : 'Использовать'}
        </button>
      </div>
    </div>
  )
}
