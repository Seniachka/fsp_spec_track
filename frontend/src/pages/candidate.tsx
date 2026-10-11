import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, range } from "../api";

const STATUS: Record<string, string> = {
  sent: "отправлено",
  viewed: "просмотрено",
  accepted: "принято",
  declined: "отклонено",
};

type Profile = any;

export function CandidateHome() {
  const [me, setMe] = useState<Profile>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/me").then(setMe).catch((err) => setError(err.message));
  }, []);
  if (!me) return <p>{error || "Загрузка…"}</p>;
  const grade = me.grade?.title || "Грейд не подтверждён";
  return (
    <div className="grid-2">
      <section className="card stack">
        <p className="eyebrow">Категория</p>
        <div className="bib">{grade}</div>
        <h2>{me.specialization?.title || "Специализация появится после теста"}</h2>
        <p>{me.about}</p>
        {me.test_score != null && <p>Тест: <b>{Math.round(me.test_score)}</b> из 100</p>}
        {!me.grade && <Link className="btn-red" to="/c/test">Пройти тест</Link>}
        {me.policy?.can_confirm_pending && <p className="ok">Есть сильный результат. Его можно оставить или попробовать грейд выше.</p>}
        <div className="chips">{me.stack?.map((tag: any) => <span className="chip" key={tag.code}>{tag.title}</span>)}</div>
      </section>
      <section className="card stack">
        <p className="eyebrow">ФСП</p>
        {me.fsp_empty ? (
          <>
            <h2>Истории ФСП нет</h2>
            <p>Это обычное состояние. Категория и приглашения от него не зависят. Бонуса достижений в ранге просто нет.</p>
            <Link to="/c/profile">Привязать ID</Link>
          </>
        ) : (
          me.fsp.map((item: any) => (
            <article key={item.competition + item.discipline}>
              <h3>{item.place ? `${item.place} место` : "Участие"} · {item.discipline}</h3>
              <p className="muted">{item.competition}. {item.level}. Роль: {item.role}.</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}


export function CandidateInvites() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  async function load() { setRows(await api("/me/invitations")); }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  async function act(id: number, kind: "accept" | "decline") {
    await api(`/me/invitations/${id}/${kind}`, "POST");
    await load();
  }
  return (
    <section className="stack">
      <h2>Приглашения</h2>
      {error && <p className="banner">{error}</p>}
      {rows.length === 0 && <p className="card">Пока никто не написал. Категория уже видна работодателям, если тест сдан.</p>}
      {rows.map((row) => (
        <article className="card stack" key={row.id}>
          <p className="status">{STATUS[row.status] || row.status}</p>
          <h3>{row.company_name}</h3>
          <p className="muted">{row.company_industry}</p>
          <div className="money">{range(row.salary_min, row.salary_max)}</div>
          <p>{row.body}</p>
          <p>Связь: {row.contact_channel}</p>
          {row.status !== "accepted" && row.status !== "declined" && (
            <div className="actions">
              <button className="btn-red" onClick={() => act(row.id, "accept")}>Принять и открыть контакт</button>
              <button className="btn-ghost" onClick={() => act(row.id, "decline")}>Отклонить</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

export function SettingsPage() {
  const [me, setMe] = useState<Profile>(null);
  const [participant, setParticipant] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api("/me").then(setMe); }, []);
  if (!me) return <p>Загрузка…</p>;
  async function toggle(published: boolean) {
    setError("");
    try { setMe({ ...me, ...(await api("/me/privacy", "PUT", { published, show_in_search: published })) }); }
    catch (err) { setError(err instanceof Error ? err.message : "Ошибка"); }
  }
  async function link(event: FormEvent) {
    event.preventDefault();
    setError("");
    try { setMe(await api("/me/fsp-link", "POST", { participant_id: participant })); }
    catch (err) { setError(err instanceof Error ? err.message : "Ошибка"); }
  }
  return (
    <section className="stack">
      <article className="card stack">
        <h2>Кто меня видит</h2>
        {error && <p className="banner">{error}</p>}
        <p>Публикация профиля: {me.published ? "включена" : "выключена"}.</p>
        <button className="btn" onClick={() => toggle(!me.published)}>{me.published ? "Скрыть из подборок" : "Снова показывать"}</button>
      </article>
      <article className="card stack">
        <h2>ID участника ФСП</h2>
        <p>{me.fsp_participant_id ? `Привязан ${me.fsp_participant_id}` : "История не привязана. Профиль от этого не ломается."}</p>
        <form className="actions" onSubmit={link}>
          <input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="FSP-1001" />
          <button className="btn-red" type="submit">Привязать</button>
        </form>
        {me.fsp_participant_id && <button className="btn-ghost" onClick={async () => setMe(await api("/me/fsp-link", "DELETE"))}>Отвязать</button>}
      </article>
    </section>
  );
}

export function VacanciesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  async function load() { setRows(await api("/vacancies")); }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  async function apply(id: number) {
    setError("");
    try { await api(`/vacancies/${id}/applications`, "POST"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Ошибка"); }
  }
  return (
    <section className="stack">
      <h2>Открытые вакансии</h2>
      <p className="muted">Это запасной ход. Основной — приглашение работодателя.</p>
      {error && <p className="banner">{error}</p>}
      {rows.map((row) => (
        <article className="card stack" key={row.id}>
          <h3>{row.title}</h3>
          <p>{row.company_name}</p>
          <div className="money">{range(row.salary_min, row.salary_max)}</div>
          <p>{row.description}</p>
          {row.applied ? <p className="ok">Отклик отправлен · {row.application_status}</p> : <button className="btn" onClick={() => apply(row.id)}>Откликнуться</button>}
        </article>
      ))}
    </section>
  );
}
