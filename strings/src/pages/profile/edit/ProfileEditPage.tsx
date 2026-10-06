import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import {
  addKeySkill,
  addSoftSkill,
  createEduPlace,
  createWorkPlace,
  deleteEduPlace,
  deleteWorkPlace,
  removeKeySkill,
  removeSoftSkill,
  updateEduPlace,
  updateMe,
  updateWorkPlace,
} from '../../../api/Me'
import {
  mapEduEntryToApi,
  buildUpdateMePayload,
  mapWorkEntryToApi,
  sortEducationEntries,
} from '../../../entities/profile/lib/apiMappers'
import {
  createSocialLink,
  deleteSocialLink,
  updateSocialLink,
} from '../../../entities/profile/lib/socialMutations'
import {
  formatBirthdateDisplay,
  formatEducationSubtitle,
  formatEducationTitle,
  formatWorkPeriod,
} from '../../../entities/profile/lib/formatters'
import type { SkillType } from '../../../entities/skill/model/types'
import type {
  EducationEntry,
  ProfileEditData,
  Skill,
  SocialLink,
  WorkEntry,
} from '../../../entities/profile/model/types'
import {
  ADDABLE_SOCIAL_NETWORKS,
  STATUS_OPTIONS,
  emptyProfileEditData,
  getStatusIdByLabel,
} from '../../../entities/profile/model/types'
import { AddSocialNetwork } from '../../../features/add-social-network/ui/AddSocialNetwork'
import { EditEducation } from '../../../features/edit-education/ui/EditEducation'
import { EditProfilePhoto } from '../../../features/edit-profile-photo/ui/EditProfilePhoto'
import { EditSocialNetwork } from '../../../features/edit-social-network/ui/EditSocialNetwork'
import { EditWork } from '../../../features/edit-work/ui/EditWork'
import { SelectSkillsScreen } from '../../../features/select-skills/ui/SelectSkillsScreen'
import { useProfile } from '../../../shared/lib/useProfile'
import { getAdminSession } from '../../../api/client'
import { useWorkPositions } from '../../../shared/lib/useWorkPositions'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import EditIcon from '../../../assets/edit.svg'
import { Button } from '../../../shared/ui/button/Button'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { DatePickerSheet } from '../../../shared/ui/date-picker/DatePickerSheet'
import { SelectDropdown } from '../../../shared/ui/select-dropdown/SelectDropdown'
import { FieldTextarea } from '../../../shared/ui/input/FieldTextarea'
import { SkillTag } from '../../../shared/ui/skill-tag/SkillTag'
import { SocialNetworkIcon } from '../../../shared/ui/social-network-icon/SocialNetworkIcon'
import { Toast } from '../../../shared/ui/toast/Toast'
import { ProfileCompleteness } from '../../../shared/ui/profile-completeness/ProfileCompleteness'
import { toUserError } from '../../../shared/lib/userError'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { useProfileCompleteness } from './useProfileCompleteness'
import './profile-edit-page.css'

const COMPLETENESS_WEIGHTS = {
  photo: 15,
  speciality: 15,
  bio: 10,
  birthdate: 5,
  social: 5,
  education: 5,
  skill: 5,
  work: 15,
} as const

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

export const ProfileEditPage = () => {
  const navigate = useNavigate()
  const { profile: loadedProfile, loading, error, refetch, setCachedProfile } = useProfile()
  const { refetch: refetchCompleteness } = useProfileCompleteness()
  const {
    names: specialityOptions,
    loading: specialitiesLoading,
  } = useWorkPositions()

  // Списки (соцсети, учёба…) — из профиля
  const [data, setData] = useState<ProfileEditData>(() => emptyProfileEditData())

  // Скаляры формы — ОТДЕЛЬНО, чтобы refetch их не затирал
  const [speciality, setSpeciality] = useState('')
  const [statusId, setStatusId] = useState<number | null>(null)
  const [bio, setBio] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [showBirthdate, setShowBirthdate] = useState(true)

  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [showPageExitConfirm, setShowPageExitConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const formHydrated = useRef(false)

  const [photoOpen, setPhotoOpen] = useState(false)
  const [birthdateOpen, setBirthdateOpen] = useState(false)
  const [addSocialOpen, setAddSocialOpen] = useState(false)
  const [editingSocial, setEditingSocial] = useState<SocialLink | null>(null)
  const [editingEducation, setEditingEducation] = useState<EducationEntry | null>(null)
  const [isNewEducation, setIsNewEducation] = useState(false)
  const [editingWork, setEditingWork] = useState<WorkEntry | null>(null)
  const [isNewWork, setIsNewWork] = useState(false)
  const [skillsPicker, setSkillsPicker] = useState<SkillType | null>(null)

  const hasBlockingOverlay =
    photoOpen ||
    birthdateOpen ||
    addSocialOpen ||
    editingSocial != null ||
    editingEducation != null ||
    editingWork != null ||
    skillsPicker != null

  const allowLeaveRef = useRef(false)
  const isDirtyRef = useRef(false)
  // Снимок полей формы «прямо сейчас» — нужен внутри async-сохранения,
  // где обычные значения из замыкания уже устарели
  const formSnapshotRef = useRef('')

  const { rootRef, rootClassName, navigateBack, runExitThen } = usePageSwipeRight({
    edgeSwipeEnabled: !hasBlockingOverlay && !showPageExitConfirm,
    canEdgeSwipeCommit: () => !isDirtyRef.current,
    onEdgeSwipeBack: () => {
      if (isDirtyRef.current) {
        setShowPageExitConfirm(true)
        return
      }
      allowLeaveRef.current = true
      navigate('/profile')
    },
  })

  const displayName = [data.firstName, data.lastName].filter(Boolean).join(' ')

  // Все соцсети уже добавлены — кнопку «Добавить» прячем, иначе откроется пустая шторка
  const canAddSocial = ADDABLE_SOCIAL_NETWORKS.some(
    (id) => !data.socials.some((social) => social.networkId === id),
  )

  const snapshotOf = (s: string, id: number | null, b: string, d: string, show: boolean) =>
    JSON.stringify({ speciality: s, statusId: id, bio: b, birthdate: d, showBirthdate: show })

  const currentSnapshot = snapshotOf(speciality, statusId, bio, birthdate, showBirthdate)
  const isDirty = formHydrated.current && currentSnapshot !== savedSnapshot
  isDirtyRef.current = isDirty
  formSnapshotRef.current = currentSnapshot
  const localCompletenessPercent = useMemo(() => {
    let total = 0
    if (Boolean(data.avatarUrl)) total += COMPLETENESS_WEIGHTS.photo
    if (speciality.trim()) total += COMPLETENESS_WEIGHTS.speciality
    if (bio.trim()) total += COMPLETENESS_WEIGHTS.bio
    if (birthdate.trim()) total += COMPLETENESS_WEIGHTS.birthdate
    total += data.socials.length * COMPLETENESS_WEIGHTS.social
    total += data.education.length * COMPLETENESS_WEIGHTS.education
    total += data.work.length * COMPLETENESS_WEIGHTS.work
    total += (data.hardSkills.length + data.softSkills.length) * COMPLETENESS_WEIGHTS.skill
    return clampPercent(total)
  }, [
    bio,
    birthdate,
    data.avatarUrl,
    data.education.length,
    data.hardSkills.length,
    data.softSkills.length,
    data.socials.length,
    data.work.length,
    speciality,
  ])

  // Списки всегда синхронизируем; поля формы — только один раз при первой загрузке
  useEffect(() => {
    if (loading) return

    setData(loadedProfile)

    if (!formHydrated.current) {
      const nextSpeciality = loadedProfile.product
      const nextStatusId = loadedProfile.statusId
      const nextBio = loadedProfile.about
      const nextBirthdate = loadedProfile.dateOfBirth
      const nextShow = loadedProfile.showBirthdate
      setSpeciality(nextSpeciality)
      setStatusId(nextStatusId)
      setBio(nextBio)
      setBirthdate(nextBirthdate)
      setShowBirthdate(nextShow)
      setSavedSnapshot(snapshotOf(nextSpeciality, nextStatusId, nextBio, nextBirthdate, nextShow))
      formHydrated.current = true
    }
  }, [loadedProfile, loading])

  const handleSave = async () => {
    setSaving(true)
    // Что именно ушло на сервер — чтобы понять, правил ли пользователь поля,
    // пока шёл запрос
    const sentSnapshot = currentSnapshot
    try {
      const payload = buildUpdateMePayload({
        speciality,
        statusId,
        bio,
        birthdate,
        showBirthdate,
      })

      const updated = await updateMe({ data: payload })

      // Обновляем поля из ответа PUT, а не из старого кэша
      const nextSpeciality = updated.speciality ?? ''
      const nextBio = updated.bio ?? ''
      const nextBirthdate = updated.birthdate ?? ''
      const nextShow = updated.showBirthdate !== false
      const nextStatusId =
        updated.status != null ? (getStatusIdByLabel(updated.status) ?? statusId) : statusId

      // Пока шёл запрос, пользователь мог что-то дописать — его правки не затираем,
      // остаёмся «грязными», чтобы их можно было сохранить следующим нажатием
      if (formSnapshotRef.current === sentSnapshot) {
        setSpeciality(nextSpeciality)
        setBio(nextBio)
        setBirthdate(nextBirthdate)
        setShowBirthdate(nextShow)
        setStatusId(nextStatusId)
      }
      setSavedSnapshot(snapshotOf(nextSpeciality, nextStatusId, nextBio, nextBirthdate, nextShow))
      setToast('Изменения сохранены')

      // Сразу пишем скаляры в кэш, затем подтягиваем полные данные
      setCachedProfile({
        ...data,
        product: nextSpeciality,
        about: nextBio,
        dateOfBirth: nextBirthdate,
        showBirthdate: nextShow,
        statusId: nextStatusId,
        startupStatus: updated.status ?? data.startupStatus,
        avatarUrl: updated.photoUrl || data.avatarUrl,
      })

      await refetch({ silent: true })
      void refetchCompleteness()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить изменения'))
    } finally {
      setSaving(false)
    }
  }

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowLeaveRef.current &&
      isDirty &&
      !hasBlockingOverlay &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowPageExitConfirm(true)
    }
  }, [blocker.state])

  const goBack = () => {
    // Пока открыт sheet/picker — не показываем page-exit (клик «насквозь» давал 2 диалога)
    if (hasBlockingOverlay) return
    if (isDirty) {
      setShowPageExitConfirm(true)
      return
    }
    navigateBack()
  }

  const confirmPageExit = () => {
    allowLeaveRef.current = true
    setShowPageExitConfirm(false)
    setSavedSnapshot(currentSnapshot)
    if (blocker.state === 'blocked') {
      runExitThen(() => blocker.proceed?.())
    } else {
      navigateBack()
    }
  }

  const cancelPageExit = () => {
    allowLeaveRef.current = false
    setShowPageExitConfirm(false)
    if (blocker.state === 'blocked') blocker.reset?.()
  }

  const refreshProfile = async () => {
    const next = await refetch({ silent: true })
    setData(next)
    void refetchCompleteness()
  }

  const removeSkill = async (type: 'hard' | 'soft', id: number) => {
    if (!data) return
    try {
      if (type === 'hard') await removeKeySkill(id)
      else await removeSoftSkill(id)
      await refreshProfile()
      setToast(type === 'hard' ? 'Скилл удалён' : 'Интерес удалён')
    } catch (err) {
      setToast(toUserError(err, type === 'hard' ? 'Не удалось удалить скилл' : 'Не удалось удалить интерес'))
    }
  }

  const openNewEducation = () => {
    setEditingEducation({
      id: 0,
      universityId: 0,
      university: '',
      universityShort: '',
      degree: '',
      grade: 'bachelor',
      level: '',
      specialty: '',
      startYear: '',
      endYear: '',
      graduationYear: '',
      isStudyingNow: true,
    })
    setIsNewEducation(true)
  }

  const openNewWork = () => {
    setEditingWork({
      id: 0,
      company: '',
      grade: 'intern',
      position: '',
      startYear: '',
      endYear: '',
      isWorkingNow: false,
    })
    setIsNewWork(true)
  }

  const saveEducation = async (entry: EducationEntry) => {
    try {
      const body = mapEduEntryToApi(entry)
      if (isNewEducation) await createEduPlace(body)
      else await updateEduPlace(entry.id, body)
      await refreshProfile()
      setToast('Место учёбы сохранено')
      setEditingEducation(null)
      setIsNewEducation(false)
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить изменения'))
      throw err
    }
  }

  const deleteEducation = async (id: number) => {
    try {
      await deleteEduPlace(id)
      await refreshProfile()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить'))
      // Пробрасываем дальше, иначе onDelete покажет «удалено» и закроет шторку
      throw err
    }
  }

  const saveWork = async (entry: WorkEntry) => {
    try {
      const body = mapWorkEntryToApi(entry)
      if (isNewWork) await createWorkPlace(body)
      else await updateWorkPlace(entry.id, body)
      await refreshProfile()
      setToast('Место работы сохранено')
      setEditingWork(null)
      setIsNewWork(false)
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить изменения'))
      throw err
    }
  }

  const deleteWork = async (id: number) => {
    try {
      await deleteWorkPlace(id)
      await refreshProfile()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить'))
      // Пробрасываем дальше, иначе onDelete покажет «удалено» и закроет шторку
      throw err
    }
  }

  // Ошибку сохранения/добавления соцсети показывает сама шторка красной
  // надписью под полем — здесь её не перехватываем и тостом не дублируем.
  const saveSocial = async (social: SocialLink) => {
    await updateSocialLink(social, data.socials)
    await refreshProfile()
    setToast('Соц сеть сохранена')
  }

  const addSocial = async (social: Omit<SocialLink, 'id'>) => {
    await createSocialLink(social, data.socials)
    await refreshProfile()
    setToast('Соц сеть добавлена')
  }

  const removeSocialLink = async (id: number) => {
    try {
      await deleteSocialLink(id, data.socials)
      await refreshProfile()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить'))
      // Пробрасываем дальше, иначе onDelete покажет «удалено» и закроет шторку
      throw err
    }
  }

  const saveSkills = async (type: SkillType, skills: Skill[]) => {
    const current = type === 'hard' ? data.hardSkills : data.softSkills
    const currentIds = new Set(current.map((s) => s.id))
    const nextIds = new Set(skills.map((s) => s.id))
    const toAdd = [...nextIds].filter((id) => !currentIds.has(id))
    const toRemove = [...currentIds].filter((id) => !nextIds.has(id))

    try {
      if (type === 'hard') {
        await Promise.all([
          ...toAdd.map((id) => addKeySkill(id)),
          ...toRemove.map((id) => removeKeySkill(id)),
        ])
      } else {
        await Promise.all([
          ...toAdd.map((id) => addSoftSkill(id)),
          ...toRemove.map((id) => removeSoftSkill(id)),
        ])
      }
      await refreshProfile()
      if (toAdd.length > 0 && toRemove.length === 0) {
        if (type === 'hard') {
          setToast(toAdd.length === 1 ? 'Скилл добавлен' : 'Скиллы добавлены')
        } else {
          setToast(toAdd.length === 1 ? 'Интерес добавлен' : 'Интересы добавлены')
        }
      } else if (toRemove.length > 0 && toAdd.length === 0) {
        setToast(type === 'hard' ? 'Скиллы обновлены' : 'Интересы обновлены')
      } else {
        setToast(type === 'hard' ? 'Скиллы обновлены' : 'Интересы обновлены')
      }
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить навыки'))
      throw err
    }
  }

  return (
    <main ref={rootRef} className={`profile-edit ${rootClassName}`}>
      <div className="profile-edit__scroll">
        {error && (
          <p className="profile-edit__status" role="alert">
            {error}
          </p>
        )}
        <header className="profile-edit__header">
          <button type="button" className="profile-edit__back" onClick={goBack} aria-label="Назад">
            <ArrowBackIcon />
          </button>
          <h1 className="text-title-lg">Профиль</h1>
        </header>

        <button
          type="button"
          className="profile-edit__avatar-wrap"
          onClick={() => setPhotoOpen(true)}
          aria-label={
            localCompletenessPercent != null
              ? `Изменить фото. Профиль заполнен на ${Math.round(localCompletenessPercent)}%`
              : 'Изменить фото'
          }
        >
          <ProfileCompleteness percent={localCompletenessPercent}>
            <UserAvatar
              userId={data.id}
              photoUrl={data.avatarUrl}
              size="fill"
              className="profile-edit__avatar"
              alt=""
            />
            <span className="profile-edit__camera" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M14.8795 10.1678C16.4365 11.7248 16.4365 14.2492 14.8795 15.8062C13.3225 17.3633 10.798 17.3633 9.24101 15.8062C7.68399 14.2492 7.68399 11.7248 9.24101 10.1678C10.798 8.61075 13.3225 8.61075 14.8795 10.1678"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M21 9V18C21 19.105 20.105 20 19 20H5C3.895 20 3 19.105 3 18V9C3 7.895 3.895 7 5 7H7L8.462 4.496C8.641 4.189 8.97 4 9.326 4H14.63C14.981 4 15.306 4.184 15.487 4.484L17 7H19C20.105 7 21 7.895 21 9Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </ProfileCompleteness>
        </button>

        {displayName ? <p className="profile-edit__name">{displayName}</p> : null}

        <section className="profile-edit__fields">
          <SelectDropdown
            value={speciality}
            placeholder="Специализация"
            options={specialityOptions}
            searchable
            onChange={setSpeciality}
          />
          {specialitiesLoading && specialityOptions.length === 0 ? (
            <p className="profile-edit__hint">Загрузка специализаций…</p>
          ) : null}
          <SelectDropdown
            value={statusId != null ? String(statusId) : ''}
            placeholder="Статус"
            options={STATUS_OPTIONS.map((opt) => ({ value: String(opt.id), label: opt.label }))}
            fitContent
            onChange={(next) => setStatusId(Number(next))}
          />
        </section>

        <section className="profile-edit__section">
          <h2 className="profile-edit__section-title">Социальные сети</h2>
          <div className="profile-edit__chips">
            {data.socials.map((social) => (
              <button
                key={social.id}
                type="button"
                className="profile-edit__chip"
                onClick={() => setEditingSocial(social)}
              >
                <SocialNetworkIcon networkId={social.networkId} />
                {social.label}
              </button>
            ))}
            {canAddSocial && (
              <button
                type="button"
                className="profile-edit__chip profile-edit__chip--add"
                onClick={() => setAddSocialOpen(true)}
              >
                + Добавить
              </button>
            )}
          </div>
        </section>

        <section className="profile-edit__section">
          <h2 className="profile-edit__section-title">Учёба</h2>
          <div className="profile-edit__cards">
            {sortEducationEntries(data.education).map((edu) => (
              <button
                key={edu.id}
                type="button"
                className="profile-edit__card"
                onClick={() => {
                  setEditingEducation(edu)
                  setIsNewEducation(false)
                }}
              >
                <div className="profile-edit__card-body">
                  <p className="profile-edit__card-title">{formatEducationTitle(edu)}</p>
                  <p className="profile-edit__card-subtitle">{formatEducationSubtitle(edu)}</p>
                </div>
                <img src={EditIcon} alt="" className="profile-edit__card-edit" />
              </button>
            ))}
            <button type="button" className="profile-edit__add-card" onClick={openNewEducation}>
              + Добавить
            </button>
          </div>
        </section>

        <section className="profile-edit__section">
          <h2 className="profile-edit__section-title">Карьера</h2>
          <div className="profile-edit__cards">
            {data.work.map((job) => (
              <button
                key={job.id}
                type="button"
                className="profile-edit__card"
                onClick={() => {
                  setEditingWork(job)
                  setIsNewWork(false)
                }}
              >
                <div className="profile-edit__card-body">
                  <p className="profile-edit__card-title">{job.company}</p>
                  <p className="profile-edit__card-position">{job.position}</p>
                  <p className="profile-edit__card-subtitle">{formatWorkPeriod(job)}</p>
                </div>
                <img src={EditIcon} alt="" className="profile-edit__card-edit" />
              </button>
            ))}
            <button type="button" className="profile-edit__add-card" onClick={openNewWork}>
              + Добавить
            </button>
          </div>
        </section>

        <section className="profile-edit__section">
          <button type="button" className="profile-edit__section-head" onClick={() => setSkillsPicker('hard')}>
            <h2 className="profile-edit__section-title">Скиллы</h2>
            <span className="profile-edit__section-chevron">›</span>
          </button>
          <div className="profile-edit__skills">
            {data.hardSkills.map((skill: Skill) => (
              <SkillTag key={skill.id} skill={skill} onRemove={() => void removeSkill('hard', skill.id)} />
            ))}
            {data.hardSkills.length === 0 && (
              <button
                type="button"
                className="profile-edit__skill-add-empty"
                onClick={() => setSkillsPicker('hard')}
              >
                + Добавить
              </button>
            )}
          </div>
        </section>

        <section className="profile-edit__section">
          <button type="button" className="profile-edit__section-head" onClick={() => setSkillsPicker('soft')}>
            <h2 className="profile-edit__section-title">Интересы</h2>
            <span className="profile-edit__section-chevron">›</span>
          </button>
          <div className="profile-edit__skills">
            {data.softSkills.map((skill: Skill) => (
              <SkillTag key={skill.id} skill={skill} onRemove={() => void removeSkill('soft', skill.id)} />
            ))}
            {data.softSkills.length === 0 && (
              <button
                type="button"
                className="profile-edit__skill-add-empty"
                onClick={() => setSkillsPicker('soft')}
              >
                + Добавить
              </button>
            )}
          </div>
        </section>

        <section className="profile-edit__about">
          <h2 className="profile-edit__section-title">Обо мне</h2>
          <FieldTextarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </section>

        <section className="profile-edit__section">
          <button
            type="button"
            className="profile-edit__birthdate"
            onClick={() => setBirthdateOpen(true)}
          >
            <span className={birthdate ? undefined : 'profile-edit__birthdate-placeholder'}>
              {birthdate ? formatBirthdateDisplay(birthdate) : 'Дата рождения'}
            </span>
            <span className="profile-edit__birthdate-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M5.25 5.49674C4.83579 5.49674 4.5 5.16095 4.5 4.74674V4.00001C3.67157 4.00001 3 4.67159 3 5.50001V6.50001H13V5.50001C13 4.67159 12.3284 4.00001 11.5 4.00001V4.75003C11.5 5.16425 11.1642 5.50003 10.75 5.50003C10.3358 5.50003 10 5.16425 10 4.75003V4.00001H6V4.74674C6 5.16095 5.66421 5.49674 5.25 5.49674ZM10 2.50001H6V1.74756C6 1.33334 5.66421 0.997559 5.25 0.997559C4.83579 0.997559 4.5 1.33334 4.5 1.74756V2.50001C2.84315 2.50001 1.5 3.84316 1.5 5.50001V11.5C1.5 13.1569 2.84315 14.5 4.5 14.5H11.5C13.1569 14.5 14.5 13.1569 14.5 11.5V5.50001C14.5 3.84316 13.1569 2.50001 11.5 2.50001V1.75001C11.5 1.3358 11.1642 1.00001 10.75 1.00001C10.3358 1.00001 10 1.3358 10 1.75001V2.50001ZM3 8.00001V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V8.00001H3Z"
                  fill="black"
                  fillOpacity="0.5"
                />
              </svg>
            </span>
          </button>
          <label className="profile-edit__birthdate-visibility">
            <input
              type="checkbox"
              checked={showBirthdate}
              onChange={(e) => setShowBirthdate(e.target.checked)}
            />
            <span>Показывать дату рождения другим</span>
          </label>
        </section>
      </div>

      <footer className="profile-edit__footer">
        <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </footer>

      {birthdateOpen && (
        <DatePickerSheet
          value={birthdate}
          onChange={setBirthdate}
          onClose={() => setBirthdateOpen(false)}
        />
      )}

      {skillsPicker && (
        <SelectSkillsScreen
          type={skillsPicker}
          selected={skillsPicker === 'hard' ? data.hardSkills : data.softSkills}
          onClose={() => setSkillsPicker(null)}
          onSave={async (skills) => {
            await saveSkills(skillsPicker, skills)
            setSkillsPicker(null)
          }}
        />
      )}

      {photoOpen && (
        <EditProfilePhoto
          onClose={() => setPhotoOpen(false)}
          hasPhoto={Boolean(data.avatarUrl)}
          onUploaded={async (updated) => {
            const avatarUrl = updated.photoUrl?.trim() || null
            setData((prev) => ({ ...prev, avatarUrl }))
            setCachedProfile({
              ...data,
              avatarUrl,
            })
            void refetchCompleteness()
            setToast('Фотография обновлена')
          }}
          onDeleted={async () => {
            setData((prev) => ({ ...prev, avatarUrl: null }))
            setCachedProfile({
              ...data,
              avatarUrl: null,
            })
            void refetchCompleteness()
            setToast('Фотография удалена')
          }}
        />
      )}

      {addSocialOpen && (
        <AddSocialNetwork
          existingIds={data.socials.map((s) => s.networkId)}
          onClose={() => setAddSocialOpen(false)}
          onAdd={async (social) => {
            await addSocial(social)
            setAddSocialOpen(false)
          }}
        />
      )}

      {editingSocial && (
        <EditSocialNetwork
          social={editingSocial}
          onClose={() => setEditingSocial(null)}
          onRequestClose={() => setEditingSocial(null)}
          onSave={async (social) => {
            await saveSocial(social)
            setEditingSocial(null)
          }}
          onDelete={async () => {
            await removeSocialLink(editingSocial.id)
            setToast('Соц сеть удалена')
            setEditingSocial(null)
          }}
        />
      )}

      {editingEducation && (
        <EditEducation
          entry={editingEducation}
          isNew={isNewEducation}
          onClose={() => {
            setEditingEducation(null)
            setIsNewEducation(false)
          }}
          onForceClose={() => {
            setEditingEducation(null)
            setIsNewEducation(false)
          }}
          onSave={saveEducation}
          allowManualCu={Boolean(getAdminSession())}
          onDelete={async () => {
            if (!isNewEducation) await deleteEducation(editingEducation.id)
            setToast('Место учёбы удалено')
            setEditingEducation(null)
            setIsNewEducation(false)
          }}
        />
      )}

      {editingWork && (
        <EditWork
          entry={editingWork}
          isNew={isNewWork}
          onClose={() => {
            setEditingWork(null)
            setIsNewWork(false)
          }}
          onForceClose={() => {
            setEditingWork(null)
            setIsNewWork(false)
          }}
          onSave={saveWork}
          onDelete={async () => {
            if (!isNewWork) await deleteWork(editingWork.id)
            setToast('Место работы удалено')
            setEditingWork(null)
            setIsNewWork(false)
          }}
        />
      )}

      {showPageExitConfirm && !hasBlockingOverlay && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={confirmPageExit}
          onCancel={cancelPageExit}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
