import { useEffect, useRef, useState } from 'react'
import { deleteMePhoto, updateMe } from '../../../api/Me'
import type { UserProfile } from '../../../api/types'
import {
  canOpenAppSettings,
  isPermissionDeniedError,
  openAppSettings,
  requestMediaPermission,
} from '../../../shared/lib/mediaPermissions'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { Toast } from '../../../shared/ui/toast/Toast'
import { PhotoCropper } from './PhotoCropper'
import { toUserError } from '../../../shared/lib/userError'
import './edit-profile-photo.css'

type EditProfilePhotoProps = {
  onClose: () => void
  /** Есть ли уже фото — показывает кнопку «Удалить» */
  hasPhoto?: boolean
  onUploaded: (user: UserProfile, localPreviewUrl: string) => Promise<void>
  onDeleted?: () => Promise<void>
}

type Step = 'options' | 'camera' | 'crop'

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop())
}

export const EditProfilePhoto = ({
  onClose,
  hasPhoto = false,
  onUploaded,
  onDeleted,
}: EditProfilePhotoProps) => {
  const [step, setStep] = useState<Step>('options')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [openingCamera, setOpeningCamera] = useState(false)
  /** Доступ к камере запрещён — тост бесполезен, нужен экран со ссылкой в Настройки */
  const [cameraDenied, setCameraDenied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  // Состояние обновляется асинхронно — от двойного тапа защищаемся ref'ом
  const openingCameraRef = useRef(false)

  const revokeSource = () => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = null
    }
  }

  const openCrop = (file: File) => {
    // На шаге crop toast рендерится строкой ошибки в шторке и сам не гаснет —
    // сообщение с прошлого шага («Не удалось сделать снимок») висело бы над новым кадром
    setToast(null)
    revokeSource()
    const url = URL.createObjectURL(file)
    sourceUrlRef.current = url
    setSourceUrl(url)
    setStep('crop')
  }

  const closeCamera = () => {
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const openCamera = async () => {
    // Двойной тап запускал два getUserMedia: второй стрим перетирал streamRef.current,
    // первый никто не останавливал — камера горела и после закрытия шторки
    if (openingCameraRef.current) return
    openingCameraRef.current = true
    setOpeningCamera(true)
    setToast(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setToast('Камера недоступна в этом браузере')
        return
      }

      const permission = await requestMediaPermission('camera')
      if (!mountedRef.current) return
      if (permission === 'denied') {
        setCameraDenied(true)
        return
      }
      // 'unknown' — веб или молчащий плагин: спросит сам getUserMedia

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
        })
        // Шторку могли закрыть, пока браузер спрашивал доступ — иначе камера
        // останется включённой (горит индикатор)
        if (!mountedRef.current) {
          stopStream(stream)
          return
        }
        // Страховка: чужой стрим в ref не оставляем включённым
        stopStream(streamRef.current)
        streamRef.current = stream
        setStep('camera')
      } catch (err) {
        if (!mountedRef.current) return
        // Отказ мимо плагина (веб, гонка с системным диалогом) — тот же случай
        if (isPermissionDeniedError(err)) {
          setCameraDenied(true)
          return
        }
        setToast('Не удалось открыть камеру. Попробуй ещё раз')
      }
    } finally {
      openingCameraRef.current = false
      if (mountedRef.current) setOpeningCamera(false)
    }
  }

  /**
   * Галерея открывается системным пикером <input type="file">: он отдаёт только
   * выбранный файл и разрешения не требует. Спрашивать доступ к «Фото» здесь
   * незачем (и Apple такой запрос считает лишним) — сразу открываем пикер.
   */
  const openGallery = () => {
    setToast(null)
    galleryRef.current?.click()
  }

  useEffect(() => {
    if (step !== 'camera') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    video.srcObject = stream
    void video.play().catch(() => {
      setToast('Не удалось запустить камеру')
    })
  }, [step])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopStream(streamRef.current)
      streamRef.current = null
      revokeSource()
    }
  }, [])

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Зеркало для фронтальной камеры — как в превью
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(
      (blob) => {
        // Колбэк асинхронный: шторку могли закрыть, пока кодировался кадр.
        // Тогда openCrop создал бы object URL уже после cleanup — отзывать его
        // было бы некому (утечка), а setToast ушёл бы в размонтированный компонент.
        if (!mountedRef.current) return
        if (!blob) {
          setToast('Не удалось сделать снимок')
          return
        }
        closeCamera()
        openCrop(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.95,
    )
  }

  const handleCropped = async (file: File, previewUrl: string) => {
    setUploading(true)
    setToast(null)
    try {
      const updated = await updateMe({ photo: file })
      // Без photoUrl фото могло не сохраниться / не просигнуться — не маскируем успехом
      if (!updated.photoUrl?.trim()) {
        throw new Error('Сервер не вернул ссылку на фото — попробуй ещё раз')
      }
      await onUploaded(updated, previewUrl)
      URL.revokeObjectURL(previewUrl)
      revokeSource()
      onClose()
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setToast(toUserError(err, 'Не удалось загрузить фото'))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!onDeleted) return
    setDeleting(true)
    setToast(null)
    try {
      await deleteMePhoto()
      await onDeleted()
      onClose()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить фото'))
    } finally {
      setDeleting(false)
    }
  }

  const backToOptions = () => {
    closeCamera()
    revokeSource()
    setSourceUrl(null)
    setToast(null)
    setStep('options')
  }

  if (step === 'camera') {
    return (
      <>
        <BottomSheet
          title="Сделать фото"
          onClose={() => {
            closeCamera()
            onClose()
          }}
        >
          <div className="photo-camera">
            <div className="photo-camera__viewport">
              <video
                ref={videoRef}
                className="photo-camera__video"
                playsInline
                muted
                autoPlay
              />
            </div>
            <div className="preview-modal__actions">
              <button
                type="button"
                className="preview-modal__btn preview-modal__btn--secondary"
                onClick={backToOptions}
              >
                Отмена
              </button>
              <button
                type="button"
                className="preview-modal__btn preview-modal__btn--primary"
                onClick={capturePhoto}
              >
                Снять
              </button>
            </div>
          </div>
        </BottomSheet>
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (step === 'crop' && sourceUrl) {
    return (
      <BottomSheet title="Новое фото" onClose={onClose}>
        <PhotoCropper
          imageUrl={sourceUrl}
          confirming={uploading}
          // Ошибку загрузки показываем прямо в шторке — тоста тут нет
          error={toast}
          onCancel={backToOptions}
          onConfirm={(file, previewUrl) => void handleCropped(file, previewUrl)}
        />
      </BottomSheet>
    )
  }

  return (
    <>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) openCrop(file)
          e.target.value = ''
        }}
      />
      <BottomSheet title="" onClose={onClose}>
        {cameraDenied ? (
          <div className="photo-modal__denied">
            <h3 className="photo-modal__denied-title">Нет доступа к камере</h3>
            <p className="photo-modal__denied-text">
              Чтобы сделать фото, разреши доступ к камере: Настройки → Нити → Камера
            </p>
            <div className="preview-modal__actions">
              <button
                type="button"
                className="preview-modal__btn preview-modal__btn--secondary"
                onClick={() => setCameraDenied(false)}
              >
                Назад
              </button>
              {canOpenAppSettings() && (
                <button
                  type="button"
                  className="preview-modal__btn preview-modal__btn--primary"
                  onClick={() => {
                    openAppSettings()
                  }}
                >
                  Открыть Настройки
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="photo-modal__options">
            <button
              type="button"
              className="photo-modal__option"
              disabled={openingCamera}
              onClick={() => void openCamera()}
            >
              {openingCamera ? 'Открываем камеру…' : 'Сделать фото'}
            </button>
            <button type="button" className="photo-modal__option" onClick={openGallery}>
              Выбрать из галереи
            </button>
            {hasPhoto && (
              <button
                type="button"
                className="photo-modal__option photo-modal__option--danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            )}
          </div>
        )}
      </BottomSheet>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}
