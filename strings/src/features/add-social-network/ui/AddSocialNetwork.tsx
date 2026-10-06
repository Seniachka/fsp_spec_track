import { useLayoutEffect, useRef, useState } from 'react'
import type { SocialLink, SocialNetworkId } from '../../../entities/profile/model/types'
import {
  ADDABLE_SOCIAL_NETWORKS,
  SOCIAL_NETWORK_META,
} from '../../../entities/profile/model/types'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { Button } from '../../../shared/ui/button/Button'
import { FieldCheckbox, FieldInput } from '../../../shared/ui/input/FieldInput'
import { SocialNetworkIcon } from '../../../shared/ui/social-network-icon/SocialNetworkIcon'
import '../../../features/edit-social-network/ui/edit-social-network.css'
import { toUserError } from '../../../shared/lib/userError'

type AddSocialNetworkProps = {
  existingIds: SocialNetworkId[]
  /** Единственная соцсеть всегда приоритетная */
  forcePriority?: boolean
  onClose: () => void
  onAdd: (social: Omit<SocialLink, 'id'>) => Promise<void>
}

type Step = 'pick' | 'form'

/** id для связи поля с текстом ошибки (aria-describedby) */
const ERROR_ID = 'add-social-error'

export const AddSocialNetwork = ({
  existingIds,
  forcePriority = false,
  onClose,
  onAdd,
}: AddSocialNetworkProps) => {
  const [step, setStep] = useState<Step>('pick')
  const [networkId, setNetworkId] = useState<SocialNetworkId | null>(null)
  const [href, setHref] = useState('')
  const [isPriority, setIsPriority] = useState(forcePriority)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const available = ADDABLE_SOCIAL_NETWORKS.filter((id) => !existingIds.includes(id))
  const autoPriority = forcePriority || existingIds.length === 0
  const isForm = step === 'form' && networkId !== null

  /**
   * Фокус ставим синхронно, в том же такте, что и тап по соцсети: WKWebView
   * поднимает клавиатуру только для focus() внутри пользовательского жеста
   * (keyboardDisplayRequiresUserAction Capacitor не отключает). Отложенный
   * фокус (таймер, animationend) дал бы каретку без клавиатуры — молчаливая
   * поломка. Тап по списку возможен только когда шторка уже видна, а от
   * прошлого дёрганья спасает то, что шторка больше не перемонтируется.
   */
  useLayoutEffect(() => {
    if (!isForm) return
    inputRef.current?.focus()
  }, [isForm])

  const resetToPick = () => {
    setStep('pick')
    setNetworkId(null)
    setHref('')
    setError(null)
  }

  const handleBack = () => {
    if (href.trim()) {
      window.setTimeout(() => setShowExitConfirm(true), 0)
      return
    }
    resetToPick()
  }

  return (
    <>
      {/* Один экземпляр BottomSheet на оба шага: при смене шага он остаётся
       * смонтированным, поэтому анимация входа не проигрывается второй раз. */}
      <BottomSheet
        title={isForm ? 'Новая соц сеть' : 'Добавить соц сеть'}
        onClose={onClose}
        showBack={isForm}
        onBack={handleBack}
        canClose={() => {
          if (isForm && href.trim()) {
            setShowExitConfirm(true)
            return false
          }
          return true
        }}
      >
        {step === 'form' && networkId ? (
          <>
            <section className="new-social__fields">
              <p className="new-social__label">{SOCIAL_NETWORK_META[networkId].label}</p>
              <div>
                <FieldInput
                  ref={inputRef}
                  value={href}
                  onChange={(e) => {
                    setHref(e.target.value)
                    setError(null)
                  }}
                  placeholder={SOCIAL_NETWORK_META[networkId].hint}
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
                checked={autoPriority || isPriority}
                onChange={setIsPriority}
                label="Приоритетный способ связи"
                disabled={autoPriority}
              />
            </section>
            <section className="new-social__actions">
              <Button
                disabled={!href.trim() || saving}
                onClick={async () => {
                  setSaving(true)
                  setError(null)
                  try {
                    await onAdd({
                      networkId,
                      label: SOCIAL_NETWORK_META[networkId].label,
                      href: href.trim(),
                      isPriority: autoPriority || isPriority,
                    })
                    onClose()
                  } catch (err) {
                    setError(
                      toUserError(err, 'Не удалось добавить соцсеть', {
                        socialNetworkId: networkId,
                      }),
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {saving ? 'Добавление…' : 'Добавить'}
              </Button>
            </section>
          </>
        ) : (
          <div className="add-social__list">
            {available.map((id) => {
              const meta = SOCIAL_NETWORK_META[id]
              return (
                <button
                  key={id}
                  type="button"
                  className="add-social__item"
                  onClick={() => {
                    setNetworkId(id)
                    setHref('')
                    setError(null)
                    setIsPriority(autoPriority)
                    setStep('form')
                  }}
                >
                  <span className="add-social__icon">
                    <SocialNetworkIcon networkId={id} />
                  </span>
                  {meta.label}
                </button>
              )
            })}
          </div>
        )}
      </BottomSheet>

      {showExitConfirm && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={() => {
            setShowExitConfirm(false)
            resetToPick()
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </>
  )
}
