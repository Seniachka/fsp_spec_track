import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, range } from "../api";

const STATUS: Record<string, string> = {
  sent: "отправлено",
  viewed: "просмотрено",
  accepted: "принято",
  declined: "отклонено",
};

function Person({ row, onInvite }: { row: any; onInvite?: (row: any) => void }) {
  return (
    <article className="rank">
      <div className="place">{String(row.rank || "–").padStart(2, "0")}</div>
      <div>
        <h3>{row.first_name} {row.last_name}</h3>
        <p>{row.specialization?.title} · {row.grade?.title} · тест {row.test_score == null ? "—" : Math.round(row.test_score)}</p>
        <div className="chips">{row.stack?.map((tag: any) => <span className="chip" key={tag.code}>{tag.title}</span>)}</div>
        <ul className="explain">{row.explanation?.map((line: string) => <li key={line}>{line}</li>)}</ul>
        {row.fsp_empty && <p>Истории ФСП нет, человек остаётся в подборке.</p>}
        {!row.fsp_empty && row.fsp?.slice(0, 2).map((item: any) => (
          <p key={item.competition} className="muted">{item.place ? `${item.place} место` : "Участие"} · {item.discipline} · {item.level}</p>
        ))}
        {row.contacts_locked ? <p className="muted">Контакты откроются после принятия приглашения или отклика.</p> : <p className="ok">{row.email} · {row.telegram}</p>}
      </div>
      <div>{onInvite && <button className="btn-red" onClick={() => onInvite(row)}>Пригласить</button>}</div>
    </article>
  );
}

export function EmployerHome() {
  const [needs, setNeeds] = useState<any[]>([]);
  useEffect(() => { api("/needs").then(setNeeds); }, []);
  return (
    <section className="stack">
      <div className="actions">
        <h2>Потребности</h2>
        <Link className="btn-red" to="/e/needs/new">Новая потребность</Link>
      </div>
      {needs.map((need) => (
        <Link className="card" key={need.id} to={`/e/needs/${need.id}`}>
          <h3>{need.title}</h3>
          <p>{need.specialization_title} · {need.grade_min}</p>
          <p className="money">{range(need.salary_min, need.salary_max)}</p>
        </Link>
      ))}
    </section>
  );
}

export function NeedForm() {
  const [specs, setSpecs] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [spec, setSpec] = useState("backend");
  const [error, setError] = useState("");
  useEffect(() => { api("/catalog/specializations").then(setSpecs); }, []);
  useEffect(() => { api(`/catalog/stack-tags?specialization=${spec}`).then(setTags); }, [spec]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const stack = tags.filter((tag) => form.get(`tag-${tag.code}`)).map((tag) => tag.code);
    try {
      const need = await api("/needs", "POST", {
        title: form.get("title"),
        team_description: form.get("team"),
        specialization_code: spec,
        grade_min: form.get("gmin"),
        grade_max: form.get("gmax"),
        salary_min: Number(form.get("smin")),
        salary_max: Number(form.get("smax")),
        stack,
        prefer_fsp: Boolean(form.get("fsp")),
      });
      location.assign(`/e/needs/${need.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Кого ищете</h2>
      {error && <p className="banner">{error}</p>}
      <label className="field"><span>Название</span><input name="title" required defaultValue="Middle Backend на Go" /></label>
      <label className="field"><span>Команда</span><textarea name="team" defaultValue="Платежи и внутренние API." /></label>
      <label className="field"><span>Специализация</span>
        <select value={spec} onChange={(e) => setSpec(e.target.value)}>{specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}</select>
      </label>
      <div className="grid-2">
        <label className="field"><span>Грейд от</span><select name="gmin" defaultValue="middle"><option>junior</option><option>middle</option><option>senior</option></select></label>
        <label className="field"><span>Грейд до</span><select name="gmax" defaultValue="middle"><option>junior</option><option>middle</option><option>senior</option></select></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Вилка от, ₽</span><input name="smin" type="number" required defaultValue={200000} /></label>
        <label className="field"><span>Вилка до, ₽</span><input name="smax" type="number" required defaultValue={280000} /></label>
      </div>
      <div className="checks">{tags.map((tag) => <label key={tag.code}><input type="checkbox" name={`tag-${tag.code}`} defaultChecked={tag.code === "go" || tag.code === "postgres"} />{tag.title}</label>)}</div>
      <label><input type="checkbox" name="fsp" /> Сначала участники ФСП</label>
      <button className="btn-red">Собрать подборку</button>
    </form>
  );
}

export function ShortlistPage() {
  const { id } = useParams();
  const [need, setNeed] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [fspOnly, setFspOnly] = useState(false);
  const [target, setTarget] = useState<any>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  async function load(only = fspOnly) {
    const [needRow, people] = await Promise.all([
      api(`/needs/${id}`),
      api(`/needs/${id}/shortlist?fsp_only=${only}`),
    ]);
    setNeed(needRow);
    setRows(people);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, [id]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    setError("");
    try {
      await api("/invitations", "POST", {
        candidate_id: target.id,
        need_id: Number(id),
        body: form.get("body"),
        salary_min: Number(form.get("smin")),
        salary_max: Number(form.get("smax")),
        contact_channel: form.get("channel"),
      });
      setSent(`${target.first_name} получит вилку до того, как откроет контакт.`);
      setTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <section className="stack">
      {need && (
        <div>
          <p className="eyebrow">Подборка</p>
          <h2>{need.title}</h2>
          <p className="money">{range(need.salary_min, need.salary_max)}</p>
          <p>{need.team_description}</p>
        </div>
      )}
      <label><input type="checkbox" checked={fspOnly} onChange={(e) => { setFspOnly(e.target.checked); load(e.target.checked); }} /> Только с достижениями ФСП</label>
      {error && <p className="banner">{error}</p>}
      {sent && <p className="ok">{sent}</p>}
      {target && (
        <form className="card stack" onSubmit={invite}>
          <h3>Приглашение для {target.first_name} {target.last_name}</h3>
          <label className="field"><span>Текст</span><textarea name="body" required defaultValue="Нужен человек в платёжный контур. Команда небольшая, задачи доходят до продакшена." /></label>
          <div className="grid-2">
            <label className="field"><span>Вилка от</span><input name="smin" type="number" required defaultValue={need?.salary_min || 220000} /></label>
            <label className="field"><span>Вилка до</span><input name="smax" type="number" required defaultValue={need?.salary_max || 260000} /></label>
          </div>
          <label className="field"><span>Как с вами связаться</span><input name="channel" required defaultValue="@marina_demo" /></label>
          <button className="btn-red">Отправить приглашение</button>
        </form>
      )}
      <div className="card">
        {rows.map((row) => <Person key={row.id} row={row} onInvite={setTarget} />)}
        {rows.length === 0 && <p>В этой категории пока никого нет.</p>}
      </div>
    </section>
  );
}

export function SearchPage() {
  const [specs, setSpecs] = useState<any[]>([]);
  const [spec, setSpec] = useState("backend");
  const [grade, setGrade] = useState("middle");
  const [fspOnly, setFspOnly] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/catalog/specializations").then(setSpecs); }, []);
  useEffect(() => {
    api(`/candidates/search?specialization=${spec}&grade=${grade}&fsp_only=${fspOnly}`).then(setRows);
  }, [spec, grade, fspOnly]);
  return (
    <section className="stack">
      <h2>Банк кандидатов</h2>
      <div className="grid-2">
        <select value={spec} onChange={(e) => setSpec(e.target.value)}>{specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}</select>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}><option>junior</option><option>middle</option><option>senior</option></select>
      </div>
      <label><input type="checkbox" checked={fspOnly} onChange={(e) => setFspOnly(e.target.checked)} /> Только с достижениями ФСП</label>
      <div className="card">{rows.map((row) => <Person key={row.id} row={row} />)}</div>
    </section>
  );
}

export function EmployerInvites() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/invitations").then(setRows); }, []);
  return (
    <section className="stack">
      <h2>Исходящие приглашения</h2>
      {rows.length === 0 && <p>Пока пусто.</p>}
      {rows.map((row) => (
        <article className="card" key={row.id}>
          <p className="status">{STATUS[row.status] || row.status}</p>
          <h3>{row.candidate?.first_name} {row.candidate?.last_name}</h3>
          <p className="money">{range(row.salary_min, row.salary_max)}</p>
          <p>{row.body}</p>
          {row.candidate?.contacts_locked ? <p className="muted">Контакт ещё закрыт.</p> : <p className="ok">{row.candidate?.email} · {row.candidate?.telegram}</p>}
        </article>
      ))}
    </section>
  );
}

export function CompanyPage() {
  const [company, setCompany] = useState<any>(null);
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/company").then(setCompany);
    api("/company/vacancies").then(setVacancies);
  }, []);
  if (!company) return <p>Загрузка…</p>;
  async function save(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    setCompany(await api("/company", "PATCH", {
      name: form.get("name"),
      industry: form.get("industry"),
      contact_email: form.get("email"),
      about: form.get("about"),
    }));
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.target as HTMLFormElement);
    try {
      await api("/vacancies", "POST", {
        title: form.get("title"),
        description: form.get("description"),
        specialization_code: "backend",
        grade: "middle",
        salary_min: Number(form.get("smin")),
        salary_max: Number(form.get("smax")),
      });
      setVacancies(await api("/company/vacancies"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }
  return (
    <div className="grid-2">
      <form className="card stack" onSubmit={save}>
        <h2>Компания</h2>
        <label className="field"><span>Название</span><input name="name" defaultValue={company.name} /></label>
        <label className="field"><span>Направление</span><input name="industry" defaultValue={company.industry} /></label>
        <label className="field"><span>Почта</span><input name="email" defaultValue={company.contact_email} /></label>
        <label className="field"><span>О компании</span><textarea name="about" defaultValue={company.about} /></label>
        <button className="btn">Сохранить</button>
      </form>
      <div className="stack">
        <form className="card stack" onSubmit={publish}>
          <h2>Открытая вакансия</h2>
          {error && <p className="banner">{error}</p>}
          <label className="field"><span>Название</span><input name="title" required defaultValue="Backend-разработчик" /></label>
          <label className="field"><span>Описание</span><textarea name="description" defaultValue="Запасной контур для тех, кому ещё не написали." /></label>
          <div className="grid-2">
            <label className="field"><span>От</span><input name="smin" type="number" required defaultValue={220000} /></label>
            <label className="field"><span>До</span><input name="smax" type="number" required defaultValue={270000} /></label>
          </div>
          <button className="btn-red">Опубликовать</button>
        </form>
        {vacancies.map((row) => <article className="card" key={row.id}><h3>{row.title}</h3><p>{range(row.salary_min, row.salary_max)}</p></article>)}
      </div>
    </div>
  );
}
