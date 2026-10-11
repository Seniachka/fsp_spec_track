import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Constellation } from "./constellation";

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === "employer"
    ? [["/e", "Вакансии"], ["/e/search", "Банк"], ["/e/invitations", "Отклики"], ["/e/company", "Компания"]]
    : [["/c/invitations", "Приглашения"], ["/c/vacancies", "Вакансии"], ["/c/profile", "Профиль"]];
  const brandTo = user?.role === "candidate" ? "/c" : user?.role === "employer" ? "/e" : "/";
  return (
    <>
      <Constellation />
      <header className="topbar">
        <NavLink to={brandTo} className="brand" end>РАЗ<span>РЯД</span></NavLink>
        <nav className="nav">
          {user && links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/e"}>{label}</NavLink>
          ))}
          {user && user.role !== "employer" && <NavLink to="/skills">Навыки и задания</NavLink>}
        </nav>
        {user && (
          <div className="spacer">
            <span className="who">{user.name || user.email}</span>
            <button className="btn-ghost" onClick={() => { logout(); navigate("/login"); }}>Выйти</button>
          </div>
        )}
      </header>
      <main className="page"><Outlet /></main>
    </>
  );
}

export function Guard({ role }: { role: "candidate" | "employer" }) {
  const { user, ready } = useAuth();
  if (!ready) return <p>Загрузка…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === "employer" ? "/e" : "/c"} replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user?.role === "employer") return <Navigate to="/e" replace />;
  if (user?.role === "candidate") return <Navigate to="/c" replace />;
  return null;
}
