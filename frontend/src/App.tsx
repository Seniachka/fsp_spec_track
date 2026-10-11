import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Guard, HomeRedirect, Shell } from "./shell";
import { AuthPage, Landing } from "./pages/public";
import { CandidateHome, CandidateInvites, VacanciesPage } from "./pages/candidate";
import { TestPage } from "./pages/exam";
import { ProfileExperience, ProfileLayout, ProfilePersonal, ProfileSkills } from "./pages/profile";
import { CompanyPage, EmployerHome, EmployerInvites, NeedForm, ShortlistPage } from "./pages/employer";
import { SkillsPage } from "./pages/skills";

function NeedRedirect() {
  const { id } = useParams();
  return <Navigate to={`/e/v/${id}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<><HomeRedirect /><Landing /></>} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route element={<Guard role="candidate" />}>
          <Route path="/c" element={<CandidateHome />} />
          <Route path="/c/test" element={<TestPage />} />
          <Route path="/c/invitations" element={<CandidateInvites />} />
          <Route path="/c/profile" element={<ProfileLayout />}>
            <Route index element={<ProfilePersonal />} />
            <Route path="experience" element={<ProfileExperience />} />
            <Route path="skills" element={<ProfileSkills />} />
          </Route>
          <Route path="/c/settings" element={<Navigate to="/c/profile" replace />} />
          <Route path="/c/vacancies" element={<VacanciesPage />} />
        </Route>
        <Route element={<Guard role="employer" />}>
          <Route path="/e" element={<EmployerHome />} />
          <Route path="/e/new" element={<NeedForm />} />
          <Route path="/e/v/:id" element={<ShortlistPage />} />
          <Route path="/e/needs/new" element={<Navigate to="/e/new" replace />} />
          <Route path="/e/needs/:id" element={<NeedRedirect />} />
          <Route path="/e/search" element={<Navigate to="/e" replace />} />
          <Route path="/e/invitations" element={<EmployerInvites />} />
          <Route path="/e/company" element={<CompanyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
