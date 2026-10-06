import { useState } from 'react'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { NOTE_MAX } from '../../../shared/lib/noteLimits'

type NoteBottomSheetProps = {
  initialNote: string
  onClose: () => void
  onSave: (note: string) => void | Promise<void>
}

export const NoteBottomSheet = ({ initialNote, onClose, onSave }: NoteBottomSheetProps) => {
  const [text, setText] = useState(initialNote)
  const [confirmExit, setConfirmExit] = useState(false)
  const [saving, setSaving] = useState(false)

  const isDirty = text !== initialNote

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(text.slice(0, NOTE_MAX))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <BottomSheet
        title="Заметка"
        subtitle="Запиши важное о вашем знакомстве"
        onClose={onClose}
        canClose={() => {
          if (isDirty) {
            setConfirmExit(true)
            return false
          }
          return true
        }}
      >
        <textarea
          className="user-profile-sheet__textarea"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
          placeholder="Напишите заметку"
          rows={5}
          autoFocus
        />
        <div className="user-profile-sheet__counter">
          {text.length}/{NOTE_MAX}
        </div>

        <button
          type="button"
          className="user-profile-sheet__primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          Сохранить
        </button>
      </BottomSheet>

      {confirmExit && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={onClose}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </>
  )
}
