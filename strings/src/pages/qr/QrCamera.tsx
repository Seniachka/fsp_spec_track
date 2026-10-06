import { useCallback, useEffect, useRef } from 'react'
import { Html5Qrcode, type Html5QrcodeCameraScanConfig } from 'html5-qrcode'
import { isPermissionDeniedError, requestMediaPermission } from '../../shared/lib/mediaPermissions'
import styles from './QrModal.module.css'

interface QrCameraProps {
  onScan: (data: string) => void
  onError: (err: unknown) => void
  /** Доступ к камере запрещён: диалог «попробовать ещё раз» тут бесполезен */
  onPermissionDenied: () => void
  /** Блокирует повторный callback, пока идёт обработка */
  paused?: boolean
}

/** Доля короткой стороны кадра под зону декодирования */
const QR_BOX_RATIO = 0.78

/** Меньше html5-qrcode не принимает (Constants.MIN_QR_BOX_SIZE) и бросает исключение */
const QR_BOX_MIN_PX = 50

/**
 * Сторона квадрата декодирования в координатах элемента <video>.
 * Считаем ровно тем же способом, что и config.qrbox ниже: по этому же числу
 * QrCamera рисует рамку на превью, и она обязана совпадать с реальной зоной.
 */
const qrBoxSide = (viewfinderWidth: number, viewfinderHeight: number): number =>
  Math.max(QR_BOX_MIN_PX, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * QR_BOX_RATIO))

export const QrCamera = ({
  onScan,
  onError,
  onPermissionDenied,
  paused = false,
}: QrCameraProps) => {
  const scannerId = 'qr-camera-scanner'
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isStarted = useRef(false)
  const handledRef = useRef(false)
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)
  const onPermissionDeniedRef = useRef(onPermissionDenied)
  const pausedRef = useRef(paused)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onPermissionDeniedRef.current = onPermissionDenied
  }, [onPermissionDenied])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  /**
   * Рамка на превью = настоящая зона декодирования: человек наводит QR по
   * уголкам, и всё, что внутри них, декодер обязан видеть.
   */
  const applyScanBoxSize = useCallback((side: number) => {
    frameRef.current?.style.setProperty('--qr-frame-size', `${side}px`)
  }, [])

  /**
   * Запасной путь пересчёта (ресайз окна). Зону html5-qrcode считает от размеров
   * самого <video> — видео сохраняет пропорции потока и по высоте обычно меньше
   * сцены, поэтому меряем элемент видео, а не контейнер. Центр совпадает с
   * центром сцены: контейнер отцентрован флексом, зона — по центру видео.
   */
  const syncScanFrame = useCallback(() => {
    const video = stageRef.current?.querySelector('video')
    if (!video) return

    const width = video.clientWidth
    const height = video.clientHeight
    if (!width || !height) return

    applyScanBoxSize(qrBoxSide(width, height))
  }, [applyScanBoxSize])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    // Основной момент подгонки — вызов config.qrbox из html5-qrcode (ниже):
    // ResizeObserver в фоновой вкладке не срабатывает, а размеры видео
    // приезжают уже после старта. Наблюдатель и слушатели — только страховка.
    const observer = new ResizeObserver(() => syncScanFrame())
    observer.observe(stage)
    const container = stage.querySelector(`#${scannerId}`)
    if (container) observer.observe(container)

    const onResize = () => syncScanFrame()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [syncScanFrame])

  useEffect(() => {
    let cancelled = false
    handledRef.current = false

    const startScanner = async () => {
      try {
        const permission = await requestMediaPermission('camera')
        if (cancelled) return
        if (permission === 'denied') {
          onPermissionDeniedRef.current()
          return
        }
        // 'unknown' — веб или молчащий плагин: спросит сам getUserMedia ниже

        const scanner = new Html5Qrcode(scannerId)
        scannerRef.current = scanner

        // Без жёсткого aspectRatio — иначе на широком превью зона декода «уезжает»
        const config: Html5QrcodeCameraScanConfig = {
          // 10–15 кадров: чаще не помогает, а греет телефон
          fps: 12,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const side = qrBoxSide(viewfinderWidth, viewfinderHeight)
            // html5-qrcode зовёт это, когда поток уже играет и размеры <video>
            // настоящие — самый надёжный момент подогнать рамку под зону
            // декодирования (после start() видео ещё 300×150 по умолчанию).
            applyScanBoxSize(side)
            return { width: side, height: side }
          },
          // Зеркальный проход нужен: без него QR с экрана/через стекло не читается
          disableFlip: false,
          videoConstraints: {
            facingMode: 'environment',
            // Просим кадр покрупнее: канвас декодера всё равно меньше, но
            // резкий исходник даёт заметно более читаемые модули QR.
            // Никакого zoom/advanced — оптический зум ломает наводку.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }

        await scanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (cancelled || pausedRef.current || handledRef.current) return
            handledRef.current = true
            onScanRef.current(decodedText)

            if (isStarted.current) {
              scanner
                .stop()
                .catch(() => {})
                .finally(() => {
                  isStarted.current = false
                })
            }
          },
          () => {
            // непрерывные ошибки декода — норма
          },
        )

        if (cancelled) {
          await scanner.stop().catch(() => {})
          scanner.clear()
          return
        }
        isStarted.current = true
        // Рамку тут не считаем: start() резолвится раньше события playing, и
        // размеры видео ещё дефолтные 300×150 — подгонит вызов config.qrbox.

        // Если успели прочитать QR до флага isStarted — уже handled, останавливаем
        if (handledRef.current) {
          await scanner.stop().catch(() => {})
          isStarted.current = false
        }
      } catch (err) {
        if (cancelled) return
        // getUserMedia отказал уже после плагина (веб, гонка с системным
        // диалогом) — это тот же «нет доступа», а не сбой запуска камеры
        if (isPermissionDeniedError(err)) {
          onPermissionDeniedRef.current()
          return
        }
        onErrorRef.current(err)
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner && isStarted.current) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear()
            } catch {
              // ignore
            }
          })
        isStarted.current = false
      } else if (scanner) {
        try {
          scanner.clear()
        } catch {
          // ignore
        }
      }
      scannerRef.current = null
    }
    // applyScanBoxSize — useCallback без зависимостей, ссылка стабильна:
    // сканер по-прежнему стартует ровно один раз на монтирование
  }, [applyScanBoxSize])

  return (
    <>
      <div ref={stageRef} className={styles.cameraStage}>
        <div id={scannerId} className={styles.cameraContainer} />
      </div>
      <div ref={frameRef} className={styles.qrFrame}>
        <div className={styles.frameCorner} />
        <div className={styles.frameCorner} />
        <div className={styles.frameCorner} />
        <div className={styles.frameCorner} />
        <span className={styles.frameLabel}>Наведи на QR</span>
      </div>
    </>
  )
}
