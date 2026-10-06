import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface QrContextType {
  isQrModalOpen: boolean
  openQrModal: () => void
  closeQrModal: () => void
}

const QrContext = createContext<QrContextType | undefined>(undefined)

export const QrProvider = ({ children }: { children: ReactNode }) => {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false)

  // Ссылки стабильные: App держит openQrModal в зависимостях эффекта,
  // который открывает модалку по ссылке из внешнего QR.
  const openQrModal = useCallback(() => setIsQrModalOpen(true), [])
  const closeQrModal = useCallback(() => setIsQrModalOpen(false), [])

  const value = useMemo(
    () => ({ isQrModalOpen, openQrModal, closeQrModal }),
    [isQrModalOpen, openQrModal, closeQrModal],
  )

  return <QrContext.Provider value={value}>{children}</QrContext.Provider>
}

export const useQr = () => {
  const context = useContext(QrContext)
  if (!context) {
    throw new Error('useQr must be used within QrProvider')
  }
  return context
}
