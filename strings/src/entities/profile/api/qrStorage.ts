export interface QrNote {
  name: string
  note: string
  date: string
}

export const saveQrNote = (friendId: string, note: QrNote) => {
  const savedNotes = JSON.parse(localStorage.getItem('qr_notes') || '{}')
  savedNotes[friendId] = note
  localStorage.setItem('qr_notes', JSON.stringify(savedNotes))
}

export const getQrNote = (friendId: string): QrNote | null => {
  const savedNotes = JSON.parse(localStorage.getItem('qr_notes') || '{}')
  return savedNotes[friendId] || null
}

export const getAllQrNotes = (): Record<string, QrNote> => {
  return JSON.parse(localStorage.getItem('qr_notes') || '{}')
}