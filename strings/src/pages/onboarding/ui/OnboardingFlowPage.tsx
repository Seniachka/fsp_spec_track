import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addKeySkill,
  addSoftSkill,
  completeOnboarding,
  createEduPlace,
  getMe,
  removeKeySkill,
  removeSoftSkill,
  updateEduPlace,
  updateMe,
} from '../../../api/Me'
import { ApiRequestError } from '../../../api/client'
import {
  buildUpdateMePayload,
  mapEduEntryToApi,
} from '../../../entities/profile/lib/apiMappers'
import {
  createSocialLink,
  deleteSocialLink,
  updateSocialLink,
} from '../../../entities/profile/lib/socialMutations'
import type { SkillType } from '../../../entities/skill/model/types'
import type { Skill, SocialLink } from '../../../entities/profile/model/types'
import { ADDABLE_SOCIAL_NETWORKS } from '../../../entities/profile/model/types'
import { AddSocialNetwork } from '../../../features/add-social-network/ui/AddSocialNetwork'
import { EditProfilePhoto } from '../../../features/edit-profile-photo/ui/EditProfilePhoto'
import { EditSocialNetwork } from '../../../features/edit-social-network/ui/EditSocialNetwork'
import { SelectSkillsScreen } from '../../../features/select-skills/ui/SelectSkillsScreen'
import { useQr } from '../../../app/providers/QrContext'
import { useProfile } from '../../../shared/lib/useProfile'
import { useWorkPositions } from '../../../shared/lib/useWorkPositions'
import { Button } from '../../../shared/ui/button/Button'
import { FieldTextarea } from '../../../shared/ui/input/FieldTextarea'
import { SelectDropdown } from '../../../shared/ui/select-dropdown/SelectDropdown'
import { SkillTag } from '../../../shared/ui/skill-tag/SkillTag'
import { SocialNetworkIcon } from '../../../shared/ui/social-network-icon/SocialNetworkIcon'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { ThreadsNetwork } from '../../welcome/ui/ThreadsNetwork'
import qrCellImg from '../../../assets/qr-cell.png'
import { FACULTY_OPTIONS } from '../model/facultyOptions'
import { setOnboardingCompleted } from '../model/onboardingStorage'
import { resolvePostAuthPath } from '../../../shared/lib/appLinks'
import { OnboardingAlertSheet } from './OnboardingAlertSheet'
import { OnboardingShell } from './OnboardingShell'
import './onboarding.css'
import '../../welcome/ui/welcome-page.css'
import '../../../features/edit-social-network/ui/edit-social-network.css'

type FlowStep = 'student' | 'role' | 'skills' | 'photo' | 'done'

type AlertState = {
  title: string
  subtitle: string
} | null

/** Центральный Университет */
const CU_UNIVERSITY_ID = 207
const DEFAULT_DEGREE = 'Магистратура'
const DEFAULT_COURSE = '1 курс'

const formatCourseLabel = (raw: string | undefined | null): string => {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_COURSE
  if (/курс/i.test(value)) return value
  if (/^\d+$/.test(value)) return `${value} курс`
  return value
}

export const OnboardingFlowPage = () => {
  const navigate = useNavigate()
  const { openQrModal } = useQr()
  const { profile, loading, refetch, setCachedProfile } = useProfile()
  const {
    names: specialityOptions,
    loading: specialitiesLoading,
    error: specialitiesError,
  } = useWorkPositions()

  const [step, setStep] = useState<FlowStep>('student')
  const [faculty, setFaculty] = useState('')
  const [speciality, setSpeciality] = useState('')
  const [bio, setBio] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [addSocialOpen, setAddSocialOpen] = useState(false)
  const [editingSocial, setEditingSocial] = useState<SocialLink | null>(null)
  const [skillsPicker, setSkillsPicker] = useState<SkillType | null>(null)
  const [removingSkillIds, setRemovingSkillIds] = useState<Set<number>>(() => new Set())
  const [photoOpen, setPhotoOpen] = useState(false)
  const formHydrated = useRef(false)
  const specialityTouched = useRef(false)
  const facultyTouched = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await getMe()
        if (cancelled || !me?.completedAt) return
        setOnboardingCompleted()
        navigate(resolvePostAuthPath(true), { replace: true })
      } catch {
        // остаёмся в онбординге
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const firstName = profile.firstName || 'друг'
  // Все соцсети уже добавлены — кнопку «Добавить» прячем, иначе откроется пустая шторка
  const canAddSocial = ADDABLE_SOCIAL_NETWORKS.some(
    (id) => !profile.socials.some((social) => social.networkId === id),
  )
  const edu = profile.education[0]
  const degreeLabel = edu?.degree || DEFAULT_DEGREE
  const courseLabel = formatCourseLabel(edu?.level)

  // Ждём профиль с сети и справочник специализаций — потом один раз ставим значение с бэка.
  // Fallback PRODUCT_OPTIONS в поле сами не подставляем.
  useEffect(() => {
    if (loading || specialitiesLoading || formHydrated.current) return

    const fromMe = profile.product?.trim() || ''
    setSpeciality(fromMe)
    setBio(profile.about ?? '')
    // Направление ЦУ пользователь выбирает сам — не подставляем specialization из edu.
    setFaculty('')
    formHydrated.current = true
  }, [loading, specialitiesLoading, profile])

  // Если профиль догрузился/обновился, а пользователь ещё не трогал поле — синхронизируем
  useEffect(() => {
    if (!formHydrated.current || specialityTouched.current) return
    const fromMe = profile.product?.trim() || ''
    setSpeciality((prev) => (prev === fromMe ? prev : fromMe))
  }, [profile.product])

  // Не синхронизируем faculty из профиля — поле только ручной выбор

  const refreshProfile = async (opts?: { skipUser?: boolean }) => {
    const next = await refetch({ silent: true, skipUser: opts?.skipUser ?? false })
    setCachedProfile(next)
    return next
  }

  const saveFaculty = async () => {
    const specialty = faculty.trim()
    const year = new Date().getFullYear()

    if (edu?.id) {
      try {
        await updateEduPlace(edu.id, mapEduEntryToApi({ ...edu, specialty }))
        await refreshProfile()
        return true
      } catch (err) {
        // Нет записи на бэке — создаём новую
        if (!(err instanceof ApiRequestError && err.status === 404)) throw err
      }
    }

    await createEduPlace({
      universityId: edu?.universityId || CU_UNIVERSITY_ID,
      grade: edu?.grade || 'master',
      level: formatCourseLabel(edu?.level),
      specialization: specialty,
      startYear: Number(edu?.startYear) || year,
      endYear: null,
      isStudyingNow: true,
    })
    await refreshProfile()
    return true
  }

  const saveSpeciality = async () => {
    const payload = buildUpdateMePayload({
      speciality: speciality.trim(),
      statusId: profile.statusId,
      bio: profile.about,
      birthdate: profile.dateOfBirth,
    })
    await updateMe({ data: payload })
    await refreshProfile({ skipUser: false })
  }

  const ensureSingleSocialPriority = async (socials: SocialLink[]) => {
    if (socials.length === 0) return socials
    if (socials.some((s) => s.isPriority)) return socials
    await updateSocialLink({ ...socials[0], isPriority: true }, socials)
    return refreshProfile().then((next) => next.socials)
  }

  // Ошибку добавления/сохранения соцсети показывает сама шторка красной
  // надписью под полем — здесь её не перехватываем и тостом не дублируем.
  const addSocial = async (social: Omit<SocialLink, 'id'>) => {
    await createSocialLink(social, profile.socials)
    await refreshProfile()
  }

  const saveSocial = async (social: SocialLink) => {
    await updateSocialLink(social, profile.socials)
    await refreshProfile()
  }

  const removeSocialLink = async (id: number) => {
    try {
      await deleteSocialLink(id, profile.socials)
      const next = await refreshProfile()
      await ensureSingleSocialPriority(next.socials)
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить'))
      throw err
    }
  }

  const saveSkills = async (type: SkillType, skills: Skill[]) => {
    const current = type === 'hard' ? profile.hardSkills : profile.softSkills
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
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить навыки'))
      throw err
    }
  }

  const removeSkill = async (type: SkillType, id: number) => {
    if (removingSkillIds.has(id)) return
    setRemovingSkillIds((prev) => new Set(prev).add(id))
    try {
      if (type === 'hard') await removeKeySkill(id)
      else await removeSoftSkill(id)
      await refreshProfile()
    } catch (err) {
      setToast(toUserError(err, type === 'hard' ? 'Не удалось удалить скилл' : 'Не удалось удалить интерес'))
    } finally {
      setRemovingSkillIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleStudentContinue = async () => {
    const picked = faculty.trim()
    const known = FACULTY_OPTIONS.some((opt) => opt.toLowerCase() === picked.toLowerCase())
    if (!picked || !known) {
      setAlert({
        title: 'Заполни направление',
        subtitle: 'Выбери направление ЦУ из списка — так тебя смогут найти однокурсники',
      })
      return
    }
    setSaving(true)
    try {
      const ok = await saveFaculty()
      if (ok) setStep('role')
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить'))
    } finally {
      setSaving(false)
    }
  }

  const handleRoleContinue = async () => {
    const picked = speciality.trim()
    const fromProfile = profile.product?.trim() || ''
    const known =
      specialitiesLoading ||
      specialityOptions.length === 0 ||
      specialityOptions.some((opt) => opt.toLowerCase() === picked.toLowerCase()) ||
      (Boolean(fromProfile) && picked.toLowerCase() === fromProfile.toLowerCase())
    if (!picked || !known || profile.socials.length === 0) {
      setAlert({
        title: 'Чего-то не хватает',
        subtitle: 'Укажи специализацию и любую соцсеть, чтобы с тобой можно было связаться',
      })
      return
    }
    setSaving(true)
    try {
      await saveSpeciality()
      await ensureSingleSocialPriority(profile.socials)
      setStep('skills')
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить'))
    } finally {
      setSaving(false)
    }
  }

  const handleSkillsContinue = () => {
    if (profile.hardSkills.length === 0 || profile.softSkills.length === 0) {
      setAlert({
        title: 'Это очень нужно',
        subtitle: 'Добавь хотя бы по одному пункту, чтобы единомышленники тебя легко нашли',
      })
      return
    }
    setStep('photo')
  }

  const handlePhotoContinue = async (skip: boolean) => {
    if (!skip && bio.trim()) {
      setSaving(true)
      try {
        const payload = buildUpdateMePayload({
          speciality: speciality.trim() || profile.product,
          statusId: profile.statusId,
          bio: bio.trim(),
          birthdate: profile.dateOfBirth,
          showBirthdate: profile.showBirthdate,
        })
        await updateMe({ data: payload })
        await refreshProfile({ skipUser: false })
      } catch (err) {
        setToast(toUserError(err, 'Не удалось сохранить'))
        setSaving(false)
        return
      } finally {
        setSaving(false)
      }
    }
    setStep('done')
  }

  const handleFinish = async () => {
    try {
      await completeOnboarding()
    } catch {
      // local flag всё равно ставим — иначе юзер застрянет
    }
    setOnboardingCompleted()
    navigate(resolvePostAuthPath(true), { replace: true })
  }

  if (step === 'done') {
    return (
      <main className="welcome-page onboarding-done">
        <div className="welcome-page__visual" aria-hidden="true">
          <ThreadsNetwork />
        </div>
        <div className="welcome-page__content">
          <h1 className="welcome-page__title">
            Онбординг
            <br />
            завершён
          </h1>
          <p className="welcome-page__subtitle">
            Находи единомышленников, общайся, заводи новые знакомства — добро пожаловать{' '}
            <span className="welcome-page__title-keep">в Нити</span>
          </p>
          <Button className="welcome-page__cta" onClick={handleFinish}>
            Начать
          </Button>
        </div>
      </main>
    )
  }

  if (skillsPicker) {
    return (
      <>
        <SelectSkillsScreen
          type={skillsPicker}
          selected={skillsPicker === 'hard' ? profile.hardSkills : profile.softSkills}
          onClose={() => setSkillsPicker(null)}
          onSave={async (skills) => {
            await saveSkills(skillsPicker, skills)
            setSkillsPicker(null)
          }}
        />
        {/* Без этого ошибка сохранения навыков не показывалась: Toast жил только в других ветках */}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (step === 'student') {
    return (
      <>
        <OnboardingShell
          title={firstName}
          subtitle="Привет, давай знакомиться"
          progress={25}
          footer={
            <>
              <button type="button" className="onboarding-qr-banner" onClick={openQrModal}>
                <img
                  className="onboarding-qr-banner__icon"
                  src={qrCellImg}
                  alt=""
                  width={48}
                  height={48}
                  aria-hidden
                />
                <span className="onboarding-qr-banner__text">
                  <strong>Твой QR уже активен</strong>
                  <span>
                    Ты можешь добавлять друзей! Позже заверши онбординг, чтобы пользоваться
                    приложением на полную
                  </span>
                </span>
              </button>
              <Button disabled={saving} onClick={() => void handleStudentContinue()}>
                {saving ? 'Сохранение…' : 'Продолжить'}
              </Button>
            </>
          }
        >
          <h2 className="onboarding-section__title">Начнем с учебы в ЦУ</h2>
          <div className="onboarding-fields">
            <div className="onboarding-field onboarding-field--readonly">{degreeLabel}</div>
            <div className="onboarding-field onboarding-field--readonly">{courseLabel}</div>
            <SelectDropdown
              value={faculty}
              placeholder="Направление"
              options={FACULTY_OPTIONS}
              searchable
              onChange={(next) => {
                facultyTouched.current = true
                setFaculty(next)
              }}
            />
          </div>
        </OnboardingShell>
        {alert && (
          <OnboardingAlertSheet title={alert.title} subtitle={alert.subtitle} onClose={() => setAlert(null)} />
        )}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (step === 'role') {
    return (
      <>
        <OnboardingShell
          title="Расскажи о себе"
          subtitle="Чтобы тебя могли найти"
          progress={50}
          onBack={() => setStep('student')}
          footer={
            <Button disabled={saving} onClick={() => void handleRoleContinue()}>
              {saving ? 'Сохранение…' : 'Продолжить'}
            </Button>
          }
        >
          <section className="onboarding-section">
            <h2 className="onboarding-section__title">Чем ты реально занимаешься?</h2>
            <p className="onboarding-section__desc">
              По этой роли люди будут искать тебя для проектов
            </p>
            <SelectDropdown
              value={speciality}
              placeholder="Специализация"
              options={specialityOptions}
              searchable
              onChange={(next) => {
                specialityTouched.current = true
                setSpeciality(next)
              }}
            />
            {specialitiesLoading && specialityOptions.length === 0 && (
              <p className="onboarding-field-hint">Загрузка специализаций…</p>
            )}
            {specialitiesError && specialityOptions.length === 0 && (
              <p className="onboarding-field-hint onboarding-field-hint--error">
                {specialitiesError}
              </p>
            )}
          </section>

          <section className="onboarding-section">
            <h2 className="onboarding-section__title">Соц сети</h2>
            <p className="onboarding-section__desc">
              В нашем приложении нельзя общаться напрямую — добавь минимум 1 соц сеть для связи
            </p>
            <div className="onboarding-chips">
              {profile.socials.map((social) => (
                <button
                  key={social.id}
                  type="button"
                  className={`onboarding-chip${social.isPriority ? ' onboarding-chip--priority' : ''}`}
                  onClick={() => setEditingSocial(social)}
                >
                  <SocialNetworkIcon networkId={social.networkId} />
                  {social.label}
                </button>
              ))}
              {canAddSocial && (
                <button
                  type="button"
                  className="onboarding-chip onboarding-chip--add"
                  onClick={() => setAddSocialOpen(true)}
                >
                  + Добавить
                </button>
              )}
            </div>
          </section>
        </OnboardingShell>

        {addSocialOpen && (
          <AddSocialNetwork
            existingIds={profile.socials.map((s) => s.networkId)}
            forcePriority={profile.socials.length === 0}
            onClose={() => setAddSocialOpen(false)}
            onAdd={addSocial}
          />
        )}
        {editingSocial && (
          <EditSocialNetwork
            social={editingSocial}
            lockPriority={profile.socials.length === 1}
            onClose={() => setEditingSocial(null)}
            onSave={saveSocial}
            onDelete={async () => {
              await removeSocialLink(editingSocial.id)
              setEditingSocial(null)
            }}
            onRequestClose={() => setEditingSocial(null)}
          />
        )}
        {alert && (
          <OnboardingAlertSheet title={alert.title} subtitle={alert.subtitle} onClose={() => setAlert(null)} />
        )}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (step === 'skills') {
    return (
      <>
        <OnboardingShell
          title="Расскажи о себе"
          subtitle="Чтобы тебя могли найти"
          progress={75}
          onBack={() => setStep('role')}
          footer={<Button onClick={handleSkillsContinue}>Продолжить</Button>}
        >
          <section className="onboarding-section">
            <h2 className="onboarding-section__title">Скиллы</h2>
            <p className="onboarding-section__desc">Твои профессиональные навыки — добавь хотя бы один</p>
            {profile.hardSkills.length > 0 && (
              <div className="onboarding-skills">
                {profile.hardSkills.map((skill) => (
                  <SkillTag
                    key={skill.id}
                    skill={skill}
                    onRemove={() => void removeSkill('hard', skill.id)}
                    removeDisabled={removingSkillIds.has(skill.id)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className="onboarding-add-btn"
              onClick={() => setSkillsPicker('hard')}
            >
              + Добавить
            </button>
          </section>

          <section className="onboarding-section">
            <h2 className="onboarding-section__title">Интересы</h2>
            <p className="onboarding-section__desc">
              Твои мягкие навыки и увлечения — добавь хотя бы один
            </p>
            {profile.softSkills.length > 0 && (
              <div className="onboarding-skills">
                {profile.softSkills.map((skill) => (
                  <SkillTag
                    key={skill.id}
                    skill={skill}
                    onRemove={() => void removeSkill('soft', skill.id)}
                    removeDisabled={removingSkillIds.has(skill.id)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className="onboarding-add-btn"
              onClick={() => setSkillsPicker('soft')}
            >
              + Добавить
            </button>
          </section>
        </OnboardingShell>
        {alert && (
          <OnboardingAlertSheet title={alert.title} subtitle={alert.subtitle} onClose={() => setAlert(null)} />
        )}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  // photo step
  return (
    <>
      <OnboardingShell
        title="Расскажи о себе"
        subtitle="Чтобы тебя могли найти"
        progress={90}
        onBack={() => setStep('skills')}
        footer={
          <div className="onboarding-photo-actions">
            <button
              type="button"
              className="onboarding-photo-actions__skip"
              disabled={saving}
              onClick={() => void handlePhotoContinue(true)}
            >
              Пропустить
            </button>
            <Button
              className="onboarding-photo-actions__continue"
              disabled={saving}
              onClick={() => void handlePhotoContinue(false)}
            >
              {saving ? 'Сохранение…' : 'Продолжить'}
            </Button>
          </div>
        }
      >
        <button type="button" className="onboarding-photo" onClick={() => setPhotoOpen(true)}>
          <UserAvatar
            userId={profile.id}
            photoUrl={profile.avatarUrl}
            size="fill"
            className="onboarding-photo__img"
            alt=""
          />
        </button>
        <p className="onboarding-section__desc onboarding-photo__hint">
          Добавь фотографию, чтобы тебя узнавали в университете
        </p>
        <FieldTextarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Пару слов о себе"
          className="onboarding-bio"
        />
      </OnboardingShell>

      {photoOpen && (
        <EditProfilePhoto
          onClose={() => setPhotoOpen(false)}
          hasPhoto={Boolean(profile.avatarUrl)}
          onUploaded={async (updated) => {
            setCachedProfile({
              ...profile,
              avatarUrl: updated.photoUrl?.trim() || null,
            })
          }}
          onDeleted={async () => {
            setCachedProfile({
              ...profile,
              avatarUrl: null,
            })
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}
