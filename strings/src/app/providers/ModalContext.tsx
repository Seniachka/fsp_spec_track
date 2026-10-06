import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ModalContextType {
  isAnyModalOpen: boolean
  openModal: () => void
  closeModal: () => void
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const countRef = useRef(0)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)

  const openModal = useCallback(() => {
    countRef.current += 1
    setIsAnyModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    setIsAnyModalOpen(countRef.current > 0)
  }, [])

  return (
    <ModalContext.Provider value={{ isAnyModalOpen, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  )
}

export const useModal = () => {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within ModalProvider')
  }
  return context
}
