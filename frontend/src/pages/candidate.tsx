import { FormEvent, useEffect, useState } from "react";
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
            <Link to="/c/settings">Привязать ID</Link>
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

export function TestPage() {
  const [me, setMe] = useState<Profile>(null);
  const [specs, setSpecs] = useState<any[]>([]);
  const [spec, setSpec] = useState("backend");
  const [grade, setGrade] = useState("middle");
  const [purpose, setPurpose] = useState("initial");
  const [session, setSession] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [sources, setSources] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/me").then((profile) => {
      setMe(profile);
      if (profile.policy?.can_start_down && !profile.policy?.can_start_initial) {
        setPurpose("down");
        setGrade("junior");
      }
    }).catch((err) => setError(err.message));
    api("/catalog/specializations").then(setSpecs).catch(() => undefined);
  }, []);

  const currentSpec = specs.find((item) => item.code === spec);
  const availableGrades: string[] = currentSpec?.grades_with_bank || [];

  async function start(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api("/assessments/sessions", "POST", { specialization_code: spec, claimed_grade: grade, purpose });
      setSession(created);
      const initialSources: Record<number, string> = {};
      created.items.forEach((item: any) => {
        if (item.kind === "code") initialSources[item.id] = item.starter || "";
      });
      setSources(initialSources);
      setStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function submit() {
    setError("");
    try {
      const payload = await api(`/assessments/sessions/${session.id}/submit`, "POST", {
        answers: session.items.map((item: any) => ({ item_id: item.id, choice_id: choices[item.id] || null, source: sources[item.id] || null })),
      });
      setResult(payload);
      setMe(await api("/me"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function confirm() {
    await api("/me/grade/confirm", "POST");
    setMe(await api("/me"));
  }

  async function intern() {
    await api("/me/grade/intern", "POST");
    setMe(await api("/me"));
  }

  if (result) {
    return (
      <section className="card stack">
        <p className="eyebrow">Результат</p>
        <div className="bib">{Math.round(result.score)}</div>
        <p>{result.outcome === "fail" ? "Заявленный грейд не подтверждён. Сам он не понижен." : "Результат записан."}</p>
        <ul>{result.review?.map((item: any) => <li key={item.id}>{item.topic}: {item.correct ? "верно" : "неверно"}</li>)}</ul>
        {result.policy?.can_confirm_pending && <button className="btn" onClick={confirm}>Оставить этот грейд</button>}
        {result.policy?.can_start_up && <button className="btn-ghost" onClick={() => { setResult(null); setSession(null); setPurpose("up"); setGrade("senior"); }}>Попробовать грейд выше</button>}
        {result.policy?.can_start_down && <button className="btn-ghost" onClick={() => { setResult(null); setSession(null); setPurpose("down"); setGrade("junior"); }}>Сдать тест на уровень ниже</button>}
        {result.policy?.can_accept_intern && <button className="btn-ghost" onClick={intern}>Принять полку «Стажёр»</button>}
        {me?.grade && <Link className="btn-red" to="/c">К категории</Link>}
      </section>
    );
  }

  if (!session) {
    return (
      <form className="card stack" onSubmit={start} style={{ maxWidth: 640 }}>
        <p className="eyebrow">Тест</p>
        <h2>Заявить специализацию и грейд</h2>
        <p className="muted">Заявка — гипотеза. Категорию назначает балл. Два человека получают разные задания одной сложности.</p>
        {error && <p className="banner">{error}</p>}
        <label className="field"><span>Специализация</span>
          <select value={spec} onChange={(e) => setSpec(e.target.value)}>
            {specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Заявленный грейд</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {["junior", "middle", "senior"].map((item) => (
              <option key={item} value={item} disabled={availableGrades.length > 0 && !availableGrades.includes(item)}>
                {item}{availableGrades.includes(item) ? "" : " — банка нет"}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">Цель попытки: {purpose === "initial" ? "первая" : purpose === "down" ? "уровень ниже" : "уровень выше"}</p>
        <button className="btn-red" type="submit">Собрать вариант</button>
      </form>
    );
  }

  const item = session.items[step];
  const last = step === session.items.length - 1;
  return (
    <section className="card stack">
      <p className="eyebrow">Вопрос {step + 1} из {session.items.length} · {item.topic}</p>
      <h2>{item.prompt}</h2>
      {error && <p className="banner">{error}</p>}
      {item.kind === "mcq" ? (
        <div className="stack">
          {item.options.map((option: any) => (
            <button type="button" key={option.id} className={choices[item.id] === option.id ? "choice on" : "choice"} onClick={() => setChoices({ ...choices, [item.id]: option.id })}>
              <b>{option.id}</b><span>{option.text}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="muted">{item.signature}</p>
          {item.public_example && <p className="muted">Открытый пример: {JSON.stringify(item.public_example.args)} → {JSON.stringify(item.public_example.expected)}</p>}
          <textarea value={sources[item.id] || ""} onChange={(e) => setSources({ ...sources, [item.id]: e.target.value })} />
        </>
      )}
      <div className="actions">
        {step > 0 && <button className="btn-ghost" type="button" onClick={() => setStep(step - 1)}>Назад</button>}
        {!last && <button className="btn" type="button" onClick={() => setStep(step + 1)}>Дальше</button>}
        {last && <button className="btn-red" type="button" onClick={submit}>Сдать</button>}
      </div>
    </section>
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

export function ProfilePage() {
  const [me, setMe] = useState<Profile>(null);
  const [tags, setTags] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api("/me").then(setMe);
    api("/catalog/stack-tags").then(setTags);
  }, []);
  if (!me || !tags) return <p>Загрузка…</p>;
  const catalog = tags;
  const selected = new Set((me.stack || []).map((tag: any) => tag.code));
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    try {
      const form = new FormData(event.target as HTMLFormElement);
      const stack = catalog.filter((tag) => form.get(`tag-${tag.code}`)).map((tag) => tag.code);
      const updated = await api("/me", "PATCH", {
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        about: form.get("about"),
        phone: form.get("phone"),
        telegram: form.get("telegram"),
        desired_salary_min: Number(form.get("smin") || 0) || null,
        desired_salary_max: Number(form.get("smax") || 0) || null,
        stack,
        soft_skills: String(form.get("soft") || "").split(",").map((item) => item.trim()).filter(Boolean),
        experiences: [{ role_title: form.get("role"), company_name: form.get("company"), start_year: form.get("year"), is_current: true }],
      });
      setMe(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }
  const exp = me.experiences?.[0] || {};
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Профиль</h2>
      {error && <p className="banner">{error}</p>}
      {saved && <p className="ok">Сохранено</p>}
      <div className="grid-2">
        <label className="field"><span>Имя</span><input name="first_name" defaultValue={me.first_name} /></label>
        <label className="field"><span>Фамилия</span><input name="last_name" defaultValue={me.last_name} /></label>
      </div>
      <label className="field"><span>О себе</span><textarea name="about" defaultValue={me.about} /></label>
      <div className="grid-2">
        <label className="field"><span>Телефон</span><input name="phone" defaultValue={me.phone} /></label>
        <label className="field"><span>Telegram</span><input name="telegram" defaultValue={me.telegram} /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Ожидания от, ₽</span><input name="smin" type="number" defaultValue={me.desired_salary_min || ""} /></label>
        <label className="field"><span>Ожидания до, ₽</span><input name="smax" type="number" defaultValue={me.desired_salary_max || ""} /></label>
      </div>
      <label className="field"><span>Роль</span><input name="role" defaultValue={exp.role_title || ""} /></label>
      <label className="field"><span>Компания</span><input name="company" defaultValue={exp.company_name || ""} /></label>
      <label className="field"><span>Год начала</span><input name="year" defaultValue={exp.start_year || ""} /></label>
      <label className="field"><span>Софт-скиллы через запятую</span><input name="soft" defaultValue={(me.soft_skills || []).join(", ")} /></label>
      <div className="checks">
        {catalog.map((tag) => (
          <label key={tag.code}><input type="checkbox" name={`tag-${tag.code}`} defaultChecked={selected.has(tag.code)} />{tag.title}</label>
        ))}
      </div>
      <button className="btn-red" type="submit">Сохранить</button>
    </form>
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
