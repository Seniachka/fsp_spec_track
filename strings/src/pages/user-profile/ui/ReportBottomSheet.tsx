import { useState } from 'react'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'

const REPORT_REASONS = [
  'Спам или мошенничество',
  'Оскорбления или травля',
  'Нарушение правил',
  'Раскрытие чужих данных',
  'Другое',
] as const

const COMMENT_MAX = 500

type ReportBottomSheetProps = {
  onClose: () => void
  onSubmit: (payload: { reason: string; text: string }) => void | Promise<void>
  submitting?: boolean
}

export const ReportBottomSheet = ({ onClose, onSubmit, submitting = false }: ReportBottomSheetProps) => {
  const [selected, setSelected] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)

  const isDirty = selected != null || comment.trim().length > 0

  const toggleReason = (reason: string) => {
    setSelected((prev) => (prev === reason ? null : reason))
  }

  return (
    <>
      <BottomSheet
        title="Пожаловаться"
        subtitle="Выберите, почему хотите оставить жалобу"
        onClose={onClose}
        canClose={() => {
          if (isDirty) {
            setConfirmExit(true)
            return false
          }
          return true
        }}
      >
        <ul className="user-profile-report__list">
          {REPORT_REASONS.map((reason) => {
            const checked = selected === reason
            return (
              <li key={reason}>
                <button
                  type="button"
                  className="user-profile-report__option"
                  onClick={() => toggleReason(reason)}
                  aria-pressed={checked}
                >
                  <span
                    className={`user-profile-report__check${checked ? ' user-profile-report__check--on' : ''}`}
                    aria-hidden
                  >
                    {checked ? '✓' : null}
                  </span>
                  <span>{reason}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="user-profile-report__label">Комментарий (необязательно)</p>
        <textarea
          className="user-profile-sheet__textarea user-profile-sheet__textarea--muted"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
          placeholder="Коротко опишите проблему"
          rows={3}
        />

        <button
          type="button"
          className="user-profile-sheet__primary"
          onClick={() => {
            if (!selected || submitting) return
            void onSubmit({ reason: selected, text: comment })
          }}
          disabled={!selected || submitting}
        >
          {submitting ? 'Отправляем…' : 'Отправить жалобу'}
        </button>
      </BottomSheet>

      {confirmExit && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Отменить"
          onConfirm={onClose}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </>
  )
}
