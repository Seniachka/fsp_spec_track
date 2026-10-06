import ArrowBackIcon from '../../../assets/components/arrowBack'
import { LEGAL_DOCUMENTS, type LegalDocId } from '../../legal/model/legalDocuments'
import '../../legal/ui/legal-document-page.css'
import './legal-doc-sheet.css'

type LegalDocSheetProps = {
  docId: LegalDocId
  onClose: () => void
}

/**
 * Документ поверх шторки «Формальности»: тот же текст, что и на /legal/:docId,
 * но без ухода со страницы — иначе теряются отмеченные согласия и сессия входа.
 */
export const LegalDocSheet = ({ docId, onClose }: LegalDocSheetProps) => {
  const document = LEGAL_DOCUMENTS[docId]

  return (
    <div className="legal-doc-sheet" role="dialog" aria-modal aria-label={document.title}>
      <div className="legal-document-page legal-doc-sheet__page">
        <div className="legal-document-page__scroll">
          <header className="legal-document-page__header">
            <button
              type="button"
              className="legal-document-page__back"
              onClick={onClose}
              aria-label="Назад"
            >
              <ArrowBackIcon />
            </button>
            <h1 className="legal-document-page__title">{document.title}</h1>
          </header>
          <pre className="legal-document-page__body">{document.body}</pre>
        </div>
      </div>
    </div>
  )
}
