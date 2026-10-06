import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ReportIcon } from './userProfileIcons'

type ReportSuccessSheetProps = {
  onClose: () => void
}

export const ReportSuccessSheet = ({ onClose }: ReportSuccessSheetProps) => (
  <BottomSheet onClose={onClose}>
    <div className="user-profile-success">
      <div className="user-profile-success__icon" aria-hidden>
        <ReportIcon />
      </div>
      <h2 className="user-profile-success__title">Жалоба отправлена</h2>
      <p className="user-profile-success__text">Мы проверим профиль и примем меры при нарушении</p>
    </div>

    <button type="button" className="user-profile-sheet__primary" onClick={onClose}>
      Буду ждать
    </button>
  </BottomSheet>
)
