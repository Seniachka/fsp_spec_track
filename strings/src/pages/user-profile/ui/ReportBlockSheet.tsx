import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'

type ReportBlockSheetProps = {
  onClose: () => void
  onReport: () => void
  onBlock: () => void
}

export const ReportBlockSheet = ({ onClose, onReport, onBlock }: ReportBlockSheetProps) => (
  <BottomSheet onClose={onClose}>
    <button type="button" className="user-profile-sheet__action" onClick={onReport}>
      Пожаловаться
    </button>
    <button type="button" className="user-profile-sheet__danger" onClick={onBlock}>
      Заблокировать
    </button>
  </BottomSheet>
)
