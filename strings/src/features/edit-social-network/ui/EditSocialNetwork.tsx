import { useState } from 'react'
import type { SocialLink } from '../../../entities/profile/model/types'
import { SOCIAL_NETWORK_META } from '../../../entities/profile/model/types'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { Button } from '../../../shared/ui/button/Button'
import { FieldCheckbox, FieldInput } from '../../../shared/ui/input/FieldInput'
import { toUserError } from '../../../shared/lib/userError'
import './edit-social-network.css'

/** id для связи поля с текстом ошибки (aria-describedby) */
const ERROR_ID = 'edit-social-error'

type EditSocialNetworkProps = {
  social: SocialLink
  /** Единственная соцсеть всегда приоритетная */
  lockPriority?: boolean
  onClose: () => void
  onSave: (social: SocialLink) => Promise<void>
  onDelete: () => Promise<void>
  onRequestClose: () => void
}

export const EditSocialNetwork = ({
  social,
  lockPriority = false,
  onClose,
  onSave,
  onDelete,
  onRequestClose,
}: EditSocialNetworkProps) => {
  const [href, setHref] = useState(social.href)
  const [isPriority, setIsPriority] = useState(lockPriority || social.isPriority)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = SOCIAL_NETWORK_META[social.networkId]
  const effectivePriority = lockPriority || isPriority
  const isDirty = href !== social.href || effectivePriority !== social.isPriority

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...social, href, isPriority: effectivePriority })
      onClose()
    } catch (err) {
      // Ошибку показываем под полем, а не тостом сверху
      setError(
        toUserError(err, 'Не удалось сохранить изменения', { socialNetworkId: social.networkId }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <BottomSheet
        title="Редактировать соц сеть"
        onClose={onClose}
        canClose={() => {
          if (isDirty) {
            setShowExitConfirm(true)
            return false
          }
          return true
        }}
      >
        <section className="social-edit__fields">
          <div>
            <p className="social-edit__label">{meta.label}</p>
            <FieldInput
              value={href}
              onChange={(e) => {
                setHref(e.target.value)
                setError(null)
              }}
              placeholder={meta.hint}
              className={error ? 'field-input--error' : ''}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
            />
            {error && (
              <p className="new-social__error" id={ERROR_ID} role="alert">
                {error}
              </p>
            )}
          </div>
          <FieldCheckbox
            checked={effectivePriority}
            onChange={setIsPriority}
            label="Приоритетный способ связи"
            disabled={lockPriority}
          />
        </section>
        <button type="button" className="social-edit__delete" onClick={() => setShowDeleteConfirm(true)}>
          Удалить
        </button>
        <div className="social-edit__actions">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </BottomSheet>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Удалить соц сеть?"
          confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
          cancelLabel="Не надо"
          confirmDisabled={deleting}
          onConfirm={() => {
            setDeleting(true)
            void onDelete()
              .then(() => {
                setShowDeleteConfirm(false)
                onClose()
              })
              // Ошибку уже показал тостом ProfileEditPage; диалог оставляем открытым
              .catch(() => {})
              .finally(() => setDeleting(false))
          }}
          onCancel={() => {
            if (!deleting) setShowDeleteConfirm(false)
          }}
        />
      )}

      {showExitConfirm && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={onRequestClose}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </>
  )
}
