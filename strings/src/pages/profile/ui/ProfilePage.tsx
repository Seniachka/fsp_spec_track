import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  formatBirthdateDisplay,
  formatEducationSubtitle,
  formatEducationTitle,
  formatWorkPeriod,
} from '../../../entities/profile/lib/formatters'
import { sortEducationEntries } from '../../../entities/profile/lib/apiMappers'
import { getPrioritySocialId } from '../../../entities/profile/lib/socialLinks'
import { useProfile } from '../../../shared/lib/useProfile'
import { SkillTag } from '../../../shared/ui/skill-tag/SkillTag'
import { SocialChip } from '../../../entities/profile/ui/SocialChip'
import EditIcon from '../../../assets/edit.svg'
import SettingsIcon from '../../../assets/settings.svg'
import { StatusBadge } from '../../../shared/ui/status-badge/StatusBadge'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { ProfileAnnouncementsSection } from '../../../widgets/profile-announcements/ProfileAnnouncementsSection'
import './profile-page.css'
import '../../../shared/ui/profile-card/profile-card.css'

const displayNameParts = (firstName: string, lastName: string) => {
  const first = firstName.trim()
  const last = lastName.trim()
  if (!first && !last) return null
  return { first, last }
}

export const ProfilePage = () => {
  const navigate = useNavigate()
  const { profile, error } = useProfile()

  const [activeTab, setActiveTab] = useState<'studies' | 'career'>('studies')
  const [activeSkillsTab, setActiveSkillsTab] = useState<'hard' | 'soft'>('hard')
  const [isStudiesExpanded, setIsStudiesExpanded] = useState(false)
  const [isCareerExpanded, setIsCareerExpanded] = useState(false)

  const prioritySocialId = getPrioritySocialId(profile.socials)
  const education = sortEducationEntries(profile.education)
  const displayEducation = isStudiesExpanded ? education : education.slice(0, 2)
  const displayWork = isCareerExpanded ? profile.work : profile.work.slice(0, 2)
  const hasMoreStudies = education.length > 2
  const hasMoreCareer = profile.work.length > 2
  const skills = activeSkillsTab === 'hard' ? profile.hardSkills : profile.softSkills
  const nameParts = displayNameParts(profile.firstName, profile.lastName)

  return (
    <main className="profile-page">
      <header className="profile-page__toolbar">
        <div className="profile-buttons">
          <button type="button" onClick={() => navigate('/profile/edit')}>
            <img src={EditIcon} alt="edit" />
          </button>
          <button type="button" onClick={() => navigate('/profile/settings')}>
            <img src={SettingsIcon} alt="settings" />
          </button>
        </div>
      </header>

      <div className="profile-page__content">
        {error && (
          <p className="profile-page__status" role="alert">
            {error}
          </p>
        )}

        <div className="profile-page__header-content">
          <div className="profile-page__avatar-wrap profile-page__enter profile-page__enter--2">
            <div className="profile-page__avatar">
              <UserAvatar
                userId={profile.id}
                photoUrl={profile.avatarUrl}
                size="fill"
                className="profile-page__avatar-image"
                alt=""
              />
            </div>
            <StatusBadge
              className="profile-page__avatar-btn"
              statusId={profile.statusId}
              label={profile.startupStatus}
              as="button"
              type="button"
              onClick={() => navigate('/profile/edit')}
              aria-label="Изменить статус"
            />
          </div>
          {nameParts ? (
            <h1 className="profile-page__name profile-page__enter profile-page__enter--3">
              {nameParts.first}
              {nameParts.first && nameParts.last ? <br /> : null}
              {nameParts.last}
            </h1>
          ) : (
            <p className="profile-page__empty profile-page__empty--inline profile-page__enter profile-page__enter--3">
              Добавьте имя в профиле
            </p>
          )}
          {profile.product ? (
            <p className="profile-page__position profile-page__enter profile-page__enter--4">
              {profile.product}
            </p>
          ) : (
            <p className="profile-page__empty profile-page__empty--inline profile-page__enter profile-page__enter--4">
              Добавьте направление в профиле
            </p>
          )}
        </div>

        <div className="profile-page_information-block profile-page__enter profile-page__enter--5">
          {profile.socials.length > 0 ? (
            <div className="profile-page__contacts">
              {profile.socials.map((social, index) => {
                const isPrimal = social.id === prioritySocialId
                return (
                  <SocialChip
                    key={social.id}
                    social={social}
                    className={`profile-page__contacts-btn${isPrimal ? ' profile-page__contacts-btn--primal' : ''}`}
                    iconWrapClassName="profile-page__contacts-btn-icon"
                    iconClassName="mt-0.5"
                    style={{ animationDelay: `${220 + index * 45}ms` }}
                  />
                )
              })}
            </div>
          ) : (
            <p className="profile-page__empty">Добавьте соцсети в профиле</p>
          )}

          <div className="profile-page__tabs">
            <button
              type="button"
              className={`profile-page__skills-tab ${activeTab === 'studies' ? 'profile-page__skills-tab--active' : ''}`}
              onClick={() => setActiveTab('studies')}
            >
              Учёба
            </button>
            <div className="profile-page__tab-line" />
            <button
              type="button"
              className={`profile-page__skills-tab ${activeTab === 'career' ? 'profile-page__skills-tab--active' : ''}`}
              onClick={() => setActiveTab('career')}
            >
              Карьера
            </button>
          </div>

          <div key={activeTab} className="profile-page__tab-content">
            {activeTab === 'studies' && (
              <>
                {displayEducation.length > 0 ? (
                  <div className="profile-card-list">
                    {displayEducation.map((edu, index) => (
                      <article
                        key={edu.id}
                        className="profile-card profile-page__list-item"
                        style={{ animationDelay: `${index * 55}ms` }}
                      >
                        <div className="profile-card__body">
                          <p className="profile-card__title">{formatEducationTitle(edu)}</p>
                          <p className="profile-card__subtitle">{formatEducationSubtitle(edu)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="profile-page__empty">Добавьте место учёбы в профиле</p>
                )}
                {hasMoreStudies && (
                  <button
                    type="button"
                    className="profile-page__expand-btn"
                    onClick={() => setIsStudiesExpanded(!isStudiesExpanded)}
                  >
                    {isStudiesExpanded ? 'Свернуть' : `Ещё ${education.length - 2} ▼`}
                  </button>
                )}
              </>
            )}

            {activeTab === 'career' && (
              <>
                {displayWork.length > 0 ? (
                  <div className="profile-card-list">
                    {displayWork.map((job, index) => (
                      <article
                        key={job.id}
                        className="profile-card profile-page__list-item"
                        style={{ animationDelay: `${index * 55}ms` }}
                      >
                        <div className="profile-card__body">
                          {job.company && <p className="profile-card__title">{job.company}</p>}
                          {job.position && <p className="profile-card__position">{job.position}</p>}
                          {formatWorkPeriod(job) && (
                            <p className="profile-card__subtitle">{formatWorkPeriod(job)}</p>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="profile-page__empty">Добавьте место работы в профиле</p>
                )}
                {hasMoreCareer && (
                  <button
                    type="button"
                    className="profile-page__expand-btn"
                    onClick={() => setIsCareerExpanded(!isCareerExpanded)}
                  >
                    {isCareerExpanded ? 'Свернуть' : `Ещё ${profile.work.length - 2} ▼`}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="profile-page__skills-tabs">
            <button
              type="button"
              className={`profile-page__skills-tab ${activeSkillsTab === 'hard' ? 'profile-page__skills-tab--active' : ''}`}
              onClick={() => setActiveSkillsTab('hard')}
            >
              Скиллы
            </button>
            <div className="profile-page__skills-tab-line" />
            <button
              type="button"
              className={`profile-page__skills-tab ${activeSkillsTab === 'soft' ? 'profile-page__skills-tab--active' : ''}`}
              onClick={() => setActiveSkillsTab('soft')}
            >
              Интересы
            </button>
          </div>

          <div key={activeSkillsTab} className="profile-page__skills-tab-content">
            {skills.length > 0 ? (
              <div className="profile-page__skills">
                {skills.map((skill, index) => (
                  <span
                    key={skill.id}
                    className="profile-page__skill-enter"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <SkillTag skill={skill} />
                  </span>
                ))}
              </div>
            ) : (
              <p className="profile-page__empty">
                {activeSkillsTab === 'hard'
                  ? 'Добавьте скиллы в профиле'
                  : 'Добавьте интересы в профиле'}
              </p>
            )}

            <section className="profile-page__about">
              <h3 className="profile-page__section-title profile-page__section-title--about">Обо мне</h3>
              {profile.about ? (
                <p>{profile.about}</p>
              ) : (
                <p className="profile-page__empty">Добавьте описание в профиле</p>
              )}
              {profile.dateOfBirth && (
                <div className="profile-page__birthday-tag">
                  <span className="profile-page__birthday-label">🎂</span>
                  <span className="profile-page__birthday-date">
                    {formatBirthdateDisplay(profile.dateOfBirth)}
                  </span>
                </div>
              )}
            </section>
          </div>

          {/* Вне .profile-page__skills-tab-content: у того key={activeSkillsTab},
              и раздел перезагружался бы при каждом переключении Скиллы/Интересы */}
          <ProfileAnnouncementsSection userId={profile.id} />
        </div>
      </div>
    </main>
  )
}
