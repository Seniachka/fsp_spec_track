import { Navigate, Route, Routes } from "react-router-dom";
import { Guard, HomeRedirect, Shell } from "./shell";
import { AuthPage, Landing } from "./pages/public";
import { CandidateHome, CandidateInvites, SettingsPage, TestPage, VacanciesPage } from "./pages/candidate";
import { ProfileExperience, ProfileLayout, ProfilePersonal, ProfileSkills } from "./pages/profile";
import { CompanyPage, EmployerHome, EmployerInvites, NeedForm, SearchPage, ShortlistPage } from "./pages/employer";
import { SkillsPage } from "./pages/skills";

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
          <Route path="/c/settings" element={<SettingsPage />} />
          <Route path="/c/vacancies" element={<VacanciesPage />} />
        </Route>
        <Route element={<Guard role="employer" />}>
          <Route path="/e" element={<EmployerHome />} />
          <Route path="/e/needs/new" element={<NeedForm />} />
          <Route path="/e/needs/:id" element={<ShortlistPage />} />
          <Route path="/e/search" element={<SearchPage />} />
          <Route path="/e/invitations" element={<EmployerInvites />} />
          <Route path="/e/company" element={<CompanyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
