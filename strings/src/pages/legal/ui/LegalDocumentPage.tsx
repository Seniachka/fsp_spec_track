import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import { LEGAL_DOCUMENTS, type LegalDocId } from '../model/legalDocuments'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import './legal-document-page.css'

const isLegalDocId = (value: string | undefined): value is LegalDocId =>
  value === 'terms' || value === 'privacy' || value === 'consent'

export const LegalDocumentPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { docId } = useParams<{ docId: string }>()
  const fromSettings = location.pathname.startsWith('/profile/settings/legal')
  const backTo = fromSettings ? '/profile/settings' : '/'

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo,
    onEdgeSwipeBack: () => {
      if (fromSettings) navigate('/profile/settings')
      else navigate(-1)
    },
  })

  if (!isLegalDocId(docId)) {
    return <Navigate to="/" replace />
  }

  const document = LEGAL_DOCUMENTS[docId]

  return (
    <main ref={rootRef} className={`legal-document-page ${rootClassName}`}>
      <div className="legal-document-page__scroll">
        <header className="legal-document-page__header">
          <button
            type="button"
            className="legal-document-page__back"
            onClick={() => {
              if (fromSettings) navigateBack()
              else navigate(-1)
            }}
            aria-label="Назад"
          >
            <ArrowBackIcon />
          </button>
          <h1 className="legal-document-page__title">{document.title}</h1>
        </header>
        <pre className="legal-document-page__body">{document.body}</pre>
        {/* В настройках поддержка уже есть отдельным пунктом — дублировать не надо. */}
        {!fromSettings ? (
          <button
            type="button"
            className="legal-document-page__support"
            onClick={() => navigate('/support')}
          >
            Поддержка
          </button>
        ) : null}
      </div>
    </main>
  )
}
