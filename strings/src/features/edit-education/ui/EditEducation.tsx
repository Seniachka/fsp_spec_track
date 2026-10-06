import { useMemo, useState } from 'react'
import type { EducationEntry } from '../../../entities/profile/model/types'
import {
  DEGREE_LABEL_TO_GRADE,
  getDegreeOptions,
} from '../../../entities/education/model/degrees'
import {
  searchUniversities,
  type University,
} from '../../../entities/university/model/universities'
import { useUniversitySearch } from '../../../entities/university/model/useUniversitySearch'
import { FACULTY_OPTIONS } from '../../../pages/onboarding/model/facultyOptions'
import { useEduDirections } from '../../../shared/lib/useEduDirections'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { Button } from '../../../shared/ui/button/Button'
import { FieldCheckbox, FieldInput } from '../../../shared/ui/input/FieldInput'
import {
  SelectDropdown,
  type SelectDropdownOption,
} from '../../../shared/ui/select-dropdown/SelectDropdown'
import { UniversitySelect } from './UniversitySelect'
import './edit-education.css'

type EditEducationProps = {
  entry: EducationEntry
  isNew?: boolean
  onClose: () => void
  onSave: (entry: EducationEntry) => Promise<void>
  onDelete: () => Promise<void>
  onForceClose: () => void
  allowManualCu?: boolean
}

const CU_UNIVERSITY_ID = 207

export const EditEducation = ({
  entry,
  isNew,
  onClose,
  onSave,
  onDelete,
  onForceClose,
  allowManualCu = false,
}: EditEducationProps) => {
  const { names: allDirections } = useEduDirections()
  // Справочник вузов ищем на сервере: после импорта мирового списка в нём
  // порядка десяти тысяч записей, целиком его на клиент не тянем.
  const [universityQuery, setUniversityQuery] = useState('')
  const { universities, loading: universitiesLoading } = useUniversitySearch(universityQuery)
  const [form, setForm] = useState(entry)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isDirty = JSON.stringify(form) !== JSON.stringify(entry)

  const update = (patch: Partial<EducationEntry>) => setForm((prev) => ({ ...prev, ...patch }))
  const isCu = form.universityId === CU_UNIVERSITY_ID
  // Учёбу в ЦУ подтягивает интеграция с университетом — её не удаляют руками.
  // Смотрим на сохранённую запись, а не на форму: смена вуза в форме не должна открывать удаление.
  const canDelete = !isNew && (allowManualCu || entry.universityId !== CU_UNIVERSITY_ID)
  // ЦУ — свои факультеты; остальные вузы — справочник направлений (+ уже сохранённое значение)
  const directionOptions = isCu
    ? FACULTY_OPTIONS
    : Array.from(new Set([...allDirections, form.specialty?.trim() || ''].filter(Boolean)))

  // ЦУ — бак/маг/ДПО; в других вузах бывают специалитет, аспирантура и ординатура
  const degreeOptions = getDegreeOptions(isCu, form.degree)

  const entryIsCu = !isNew && entry.universityId === CU_UNIVERSITY_ID && !allowManualCu

  // Вузы, которых может не быть в текущей странице поиска, но которые обязаны
  // оставаться выбираемыми: уже выбранный в форме (иначе после ввода другого
  // запроса поле опустеет) и сохранённый в записи — он может быть и вовсе не из
  // справочника (находка #53), и без него после смены вуза его не вернуть.
  const pinnedUniversities = useMemo<University[]>(() => {
    const pinned: University[] = []
    const add = (id: number, name: string, shortName: string) => {
      if (!id || pinned.some((item) => item.id === id)) return
      pinned.push({ id, name, shortName })
    }
    add(form.universityId, form.university, form.universityShort)
    add(entry.universityId, entry.university, entry.universityShort)
    return pinned
  }, [
    form.universityId,
    form.university,
    form.universityShort,
    entry.universityId,
    entry.university,
    entry.universityShort,
  ])

  // Пока ответ не пришёл, в universities лежит выдача прошлого запроса. Показывать
  // её под новым вводом нельзя: список секунду стоит с чужими вузами, и тап
  // попадает не туда. Правило фильтра то же, что у бэкенда (имя или аббревиатура),
  // поэтому над свежей выдачей он ничего не срезал бы — и там не применяется.
  const shownUniversities = useMemo(
    () =>
      universitiesLoading ? searchUniversities(universityQuery, universities) : universities,
    [universitiesLoading, universityQuery, universities],
  )

  // В списке — короткое имя (как в карточке профиля), искать можно и по полному названию
  const universityOptions = useMemo<SelectDropdownOption[]>(() => {
    const isSelectable = (item: University) =>
      entryIsCu ? item.id === CU_UNIVERSITY_ID : allowManualCu || item.id !== CU_UNIVERSITY_ID
    const selectable = shownUniversities.filter(isSelectable)
    // В справочнике есть вузы с одинаковой аббревиатурой (два «КГМУ») —
    // для дублей показываем полное название, иначе пункты неотличимы.
    const shortNameCounts = new Map<string, number>()
    selectable.forEach((item) => {
      if (item.shortName) {
        shortNameCounts.set(item.shortName, (shortNameCounts.get(item.shortName) ?? 0) + 1)
      }
    })
    const toOption = (item: University, useShortName: boolean): SelectDropdownOption => ({
      value: String(item.id),
      label: item.shortName && useShortName ? item.shortName : item.name,
      // Аббревиатура всегда в searchText: у дублей label — полное название,
      // и иначе «кгму» их бы не находил.
      searchText: item.shortName ? `${item.shortName} ${item.name}` : item.name,
    })
    const options = selectable.map((item) =>
      toOption(item, (shortNameCounts.get(item.shortName) ?? 0) < 2),
    )
    // Закреплённые вузы дописываем в начало — но только те, что подходят под ввод:
    // выдача пришла с сервера, и клиентской фильтрации над ней больше нет.
    pinnedUniversities
      .filter(
        (item) =>
          isSelectable(item) &&
          !selectable.some((found) => found.id === item.id) &&
          searchUniversities(universityQuery, [item]).length > 0,
      )
      .forEach((item) => options.unshift(toOption(item, true)))
    return options
  }, [shownUniversities, entryIsCu, allowManualCu, pinnedUniversities, universityQuery])

  // Подпись в поле берём из самой записи, а не из текущей страницы поиска.
  // Через страницу нельзя: у дублей аббревиатуры подпись становится полным
  // названием, оно уходит в поле, по нему идёт новый запрос — и подпись
  // возвращается обратно к аббревиатуре, зациклив поиск.
  const selectedUniversityLabel = form.universityId
    ? form.universityShort || form.university
    : ''

  const canSave =
    Boolean(form.universityId) &&
    Boolean(form.degree) &&
    Boolean(form.specialty.trim()) &&
    (isCu
      ? form.isStudyingNow || Boolean((form.endYear || form.graduationYear).trim())
      : Boolean((form.endYear || form.graduationYear).trim()))

  return (
    <>
      <BottomSheet
        title="Место учёбы"
        onClose={onClose}
        canClose={() => {
          if (isDirty) {
            setShowExitConfirm(true)
            return false
          }
          return true
        }}
      >
        <section className="education-edit__fields">
          <UniversitySelect
            value={form.universityId ? String(form.universityId) : ''}
            selectedLabel={selectedUniversityLabel}
            placeholder="Название заведения"
            options={universityOptions}
            query={universityQuery}
            onQueryChange={setUniversityQuery}
            hint={universitiesLoading ? 'Ищем…' : 'Ничего не нашлось'}
            onChange={(next) => {
              const university =
                universities.find((item) => String(item.id) === next) ??
                pinnedUniversities.find((item) => String(item.id) === next) ??
                null
              if (!university) return
              const nextIsCu = university.id === CU_UNIVERSITY_ID
              update({
                universityId: university.id,
                university: university.name,
                universityShort: university.shortName,
                // ЦУ — полный набор полей (курс, год начала, «учусь сейчас»).
                // Остальные вузы — только год выпуска, без курса/начала.
                ...(nextIsCu
                  ? { isStudyingNow: true }
                  : { isStudyingNow: false, level: '', startYear: '' }),
              })
            }}
          />
          <SelectDropdown
            value={form.degree}
            placeholder="Степень образования"
            options={degreeOptions}
            onChange={(degree) => {
              update({
                degree,
                grade: DEGREE_LABEL_TO_GRADE[degree] ?? 'bachelor',
              })
            }}
          />
          <SelectDropdown
            value={form.specialty}
            placeholder="Направление"
            options={directionOptions}
            searchable
            onChange={(specialty) => update({ specialty })}
          />
          {isCu ? (
            <>
              {/* Курс и год начала ЦУ приходят из интеграции и заполняются один раз
                  при регистрации — обычному пользователю их не даём редактировать,
                  иначе затёртый «Курс» уже не восстановится (и сломает подпись
                  «Маг ‘1 — …» в поиске/нитях). Правка — только тестовым аккаунтам. */}
              {allowManualCu && (
                <>
                  <FieldInput
                    value={form.level}
                    onChange={(e) => update({ level: e.target.value })}
                    placeholder="Курс"
                  />
                  <FieldInput
                    value={form.startYear}
                    onChange={(e) => update({ startYear: e.target.value })}
                    placeholder="Год начала"
                    inputMode="numeric"
                  />
                </>
              )}
              <FieldCheckbox
                checked={form.isStudyingNow}
                onChange={(checked) =>
                  update({
                    isStudyingNow: checked,
                    endYear: checked ? '' : form.endYear,
                    graduationYear: checked ? '' : form.graduationYear,
                  })
                }
                label="Учусь сейчас"
              />
              {!form.isStudyingNow && (
                <FieldInput
                  value={form.endYear || form.graduationYear}
                  onChange={(e) =>
                    update({ endYear: e.target.value, graduationYear: e.target.value })
                  }
                  placeholder="Год выпуска"
                  inputMode="numeric"
                />
              )}
            </>
          ) : (
            <FieldInput
              value={form.endYear || form.graduationYear}
              onChange={(e) =>
                update({ endYear: e.target.value, graduationYear: e.target.value })
              }
              placeholder="Год выпуска"
              inputMode="numeric"
            />
          )}
        </section>
        {canDelete && (
          <button type="button" className="education-edit__delete" onClick={() => setShowDeleteConfirm(true)}>
            Удалить
          </button>
        )}
        <section className="education-edit__actions">
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
          title="Удалить место учёбы?"
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
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showExitConfirm && (
        <ConfirmDialog
          title="Выйти без сохранения?"
          confirmLabel="Выйти"
          cancelLabel="Остаться"
          onConfirm={onForceClose}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </>
  )
}
