import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, saveSession } from "../api";
import { useAuth } from "../auth";

export function Landing() {
  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Протокол ИТ-подбора</p>
          <h1>Работодатель пишет первым.</h1>
          <p className="lead">Кандидат попадает в категорию по тесту, не по строчке в резюме. Приглашение приходит с вилкой. Контакт открывается после согласия.</p>
          <div className="actions">
            <Link className="btn-red" to="/login?email=marina@example.com">Кабинет работодателя</Link>
            <Link className="btn" to="/login?email=anna@example.com">Кабинет кандидата</Link>
            <Link className="btn-ghost" to="/register">Регистрация</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState(params.get("email") ? "demo1234" : "");
  const [role, setRole] = useState("candidate");
  const [personal, setPersonal] = useState(false);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await api("/auth/register", "POST", {
          email,
          password,
          role,
          consents: [personal ? "personal_data" : "", publish ? "profile_publication" : ""].filter(Boolean),
        });
      }
      const tokens = await api("/auth/login", "POST", { email, password });
      saveSession(tokens);
      await refresh();
      navigate(tokens.role === "employer" ? "/e" : "/c");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <div className="auth-stage">
      <form className="card stack auth-card" onSubmit={onSubmit}>
        <p className="eyebrow">{mode === "login" ? "Вход" : "Регистрация"}</p>
        <h2>{mode === "login" ? "Открыть кабинет" : "Создать кабинет"}</h2>
        {error && <p className="banner">{error}</p>}
        <label className="field"><span>Почта</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label className="field"><span>Пароль</span><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required /></label>
        {mode === "register" && (
          <>
            <label className="field"><span>Роль</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="candidate">Кандидат</option>
                <option value="employer">Работодатель</option>
              </select>
            </label>
            <label className="consent"><input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} /> Согласен на обработку персональных данных</label>
            <label className="consent"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Согласен на публикацию профиля работодателям</label>
          </>
        )}
        <button className="btn-red" type="submit">{mode === "login" ? "Войти" : "Создать и войти"}</button>
      </form>
    </div>
  );
}
