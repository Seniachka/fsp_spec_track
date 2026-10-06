import { useState } from 'react'
import type { WorkEntry } from '../../../entities/profile/model/types'
import { WORK_GRADE_OPTIONS } from '../../../entities/profile/model/types'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { Button } from '../../../shared/ui/button/Button'
import { FieldCheckbox, FieldInput } from '../../../shared/ui/input/FieldInput'
import { SelectDropdown } from '../../../shared/ui/select-dropdown/SelectDropdown'
import './edit-work.css'

type EditWorkProps = {
  entry: WorkEntry
  isNew?: boolean
  onClose: () => void
  onSave: (entry: WorkEntry) => Promise<void>
  onDelete: () => Promise<void>
  onForceClose: () => void
}

export const EditWork = ({ entry, isNew, onClose, onSave, onDelete, onForceClose }: EditWorkProps) => {
  const [form, setForm] = useState(entry)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isDirty = JSON.stringify(form) !== JSON.stringify(entry)

  const update = (patch: Partial<WorkEntry>) => setForm((prev) => ({ ...prev, ...patch }))

  // Год окончания у бэка необязателен (endYear может быть null), и старые записи
  // приходят без него. Требовать его задним числом нельзя — иначе такую запись
  // не сохранить даже после правки названия компании. Просим год только когда
  // пользователь сам трогает этот блок (снял «Работаю сейчас» / правил год) или
  // когда место работы новое.
  const endYearTouched =
    form.isWorkingNow !== entry.isWorkingNow || form.endYear !== entry.endYear
  const needEndYear = !form.isWorkingNow && (Boolean(isNew) || endYearTouched)

  // Бэк отбивает пустые поля общим 400 «Заполни обязательные поля» —
  // проверяем на клиенте и подсказываем, чего именно не хватает
  const missingFields = [
    form.company.trim() ? '' : 'Компания',
    form.position.trim() ? '' : 'Должность',
    form.startYear.trim() ? '' : 'Год начала',
    !needEndYear || form.endYear.trim() ? '' : 'Год окончания',
  ].filter(Boolean)
  const canSave = missingFields.length === 0

  return (
    <>
      <BottomSheet
        title="Место работы"
        onClose={onClose}
        canClose={() => {
          if (isDirty) {
            setShowExitConfirm(true)
            return false
          }
          return true
        }}
      >
        <section className="work-edit__fields">
          <FieldInput
            value={form.company}
            onChange={(e) => update({ company: e.target.value })}
            placeholder="Компания"
          />
          <SelectDropdown
            value={form.grade}
            placeholder="Грейд"
            options={WORK_GRADE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            onChange={(grade) => update({ grade: grade as WorkEntry['grade'] })}
          />
          <FieldInput
            value={form.position}
            onChange={(e) => update({ position: e.target.value })}
            placeholder="Должность"
          />
          <FieldInput
            value={form.startYear}
            onChange={(e) => update({ startYear: e.target.value })}
            placeholder="Год начала"
            inputMode="numeric"
          />
          <FieldCheckbox
            checked={form.isWorkingNow}
            onChange={(checked) => update({ isWorkingNow: checked, endYear: checked ? '' : form.endYear })}
            label="Работаю сейчас"
          />
          {!form.isWorkingNow && (
            <FieldInput
              value={form.endYear}
              onChange={(e) => update({ endYear: e.target.value })}
              placeholder="Год окончания"
              inputMode="numeric"
            />
          )}
          {missingFields.length > 0 && (
            <p className="work-edit__hint">Заполни: {missingFields.join(', ')}</p>
          )}
        </section>
        {!isNew && (
          <button type="button" className="work-edit__delete" onClick={() => setShowDeleteConfirm(true)}>
            Удалить
          </button>
        )}
        <section className="work-edit__actions">
          <Button
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(form)
                onClose()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </section>
      </BottomSheet>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Удалить место работы?"
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
          onConfirm={onForceClose}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </>
  )
}
