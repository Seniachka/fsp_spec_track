import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, range } from "../api";

const STATUS: Record<string, string> = {
  sent: "отправлено",
  viewed: "просмотрено",
  accepted: "принято",
  declined: "отклонено",
};

type Spec = { code: string; title: string };
type Grade = { code: string; title: string; rank: number };
type Tag = { code: string; title: string };

const BARS = [
  { key: "test", label: "Результат теста", tone: "test" },
  { key: "stack", label: "Совпадение стека", tone: "stack" },
  { key: "fsp", label: "Достижения ФСП", tone: "fsp" },
  { key: "fit", label: "Соответствие потребности", tone: "fit" },
] as const;

function RatingPanel({ rating }: { rating: any }) {
  return (
    <div className="rating">
      <div className="rating-bars">
        {BARS.map((bar) => {
          const value = Math.max(0, Math.min(100, Number(rating[bar.key]) || 0));
          return (
            <div className="rate-row" key={bar.key}>
              <span>{bar.label}</span>
              <span className="rate-track"><span className={`rate-fill ${bar.tone}`} style={{ width: `${value}%` }} /></span>
              <b>{value}%</b>
            </div>
          );
        })}
        {rating.freshness < 1 && <p className="muted rate-note">Тест старше 90 дней, соответствие умножено на 0,85</p>}
      </div>
      <aside className="rating-why">
        <p>Почему в топе</p>
        <ul>
          {(rating.reasons || []).map((reason: any) => (
            <li key={reason.code} className={reason.ok ? "on" : "off"}>
              {reason.ok ? "✓" : "–"} {reason.title}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Person({ row, onInvite, invited }: { row: any; onInvite?: (row: any) => void; invited?: boolean }) {
  return (
    <article className="person">
      <div className="person-head">
        <div className="place">{String(row.rank || "–").padStart(2, "0")}</div>
        <div className="person-body">
          <h3>{row.first_name} {row.last_name}</h3>
          <p className="muted">{row.specialization?.title} · {row.grade?.title}</p>
        </div>
        {row.rating && (
          <div className="fit-num">
            {row.rating.fit}%
            <span>подходит</span>
          </div>
        )}
        {onInvite && <button className="btn-red" onClick={() => onInvite(row)}>Пригласить</button>}
        {invited && <p className="ok person-mark">Отправлено</p>}
      </div>
      {row.rating && <RatingPanel rating={row.rating} />}
      <div className="chips">{row.stack?.map((tag: any) => <span className="chip" key={tag.code}>{tag.title}</span>)}</div>
      {!row.fsp_empty && row.fsp?.slice(0, 2).map((item: any) => (
        <p key={item.competition} className="muted">{item.place ? `${item.place} место` : "Участие"} · {item.discipline} · {item.level}</p>
      ))}
      {!row.contacts_locked && <p className="ok">{row.email} · {row.telegram}</p>}
    </article>
  );
}

function SkillPicker({ tags, value, onChange }: { tags: Tag[]; value: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tags
      .filter((tag) => !value.includes(tag.code))
      .filter((tag) => !needle || tag.title.toLowerCase().includes(needle) || tag.code.includes(needle))
      .slice(0, 8);
  }, [tags, value, query]);

  function add(code: string) {
    if (value.length >= 5 || value.includes(code)) return;
    onChange([...value, code]);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="skill-pick">
      <label className="field">
        <span>Навыки</span>
        <input
          value={query}
          disabled={value.length >= 5}
          placeholder="Поиск"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        />
      </label>
      {open && options.length > 0 && (
        <div className="skill-menu">
          {options.map((tag) => (
            <button key={tag.code} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(tag.code)}>
              {tag.title}
            </button>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <div className="chips">
          {value.map((code) => (
            <button key={code} type="button" className="chip chip-x" onClick={() => onChange(value.filter((item) => item !== code))}>
              {tags.find((tag) => tag.code === code)?.title || code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useCatalog() {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  useEffect(() => {
    api<Spec[]>("/catalog/specializations").then(setSpecs);
    api<Grade[]>("/catalog/grades").then(setGrades);
  }, []);
  return { specs, grades };
}

export function EmployerHome() {
  const [needs, setNeeds] = useState<any[]>([]);
  useEffect(() => { api("/needs").then(setNeeds); }, []);
  return (
    <section className="stack">
      <div className="vac-head">
        <h2>Вакансии</h2>
        <Link className="btn-red" to="/e/new">Новая вакансия</Link>
      </div>
      <div className="vac-grid">
        {needs.map((need) => (
          <Link className="card vac-card" key={need.id} to={`/e/v/${need.id}`}>
            <div className="vac-top">
              <span className="lvl">{need.grade_title}</span>
              {need.applications > 0 && <span className="status">Отклики · {need.applications}</span>}
            </div>
            <h3>{need.specialization_title}</h3>
            <p className="vac-text">{need.team_description}</p>
            <div className="chips">{need.stack?.map((tag: Tag) => <span className="chip" key={tag.code}>{tag.title}</span>)}</div>
            <p className="vac-pay">{range(need.salary_min, need.salary_max)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function NeedForm() {
  const navigate = useNavigate();
  const { specs, grades } = useCatalog();
  const [spec, setSpec] = useState("");
  const [grade, setGrade] = useState("");
  const [description, setDescription] = useState("");
  const [smin, setSmin] = useState("");
  const [smax, setSmax] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [stack, setStack] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!spec && specs[0]) setSpec(specs[0].code);
  }, [specs, spec]);
  useEffect(() => {
    if (!grade && grades[0]) setGrade(grades.find((item) => item.code === "middle")?.code || grades[0].code);
  }, [grades, grade]);
  useEffect(() => {
    if (!spec) return;
    api<Tag[]>(`/catalog/stack-tags?specialization=${spec}`).then((rows) => {
      setTags(rows);
      setStack((current) => current.filter((code) => rows.some((tag) => tag.code === code)));
    });
  }, [spec]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const specTitle = specs.find((item) => item.code === spec)?.title || spec;
    const gradeTitle = grades.find((item) => item.code === grade)?.title || grade;
    setError("");
    try {
      const need = await api("/needs", "POST", {
        title: `${specTitle} · ${gradeTitle}`,
        team_description: description,
        specialization_code: spec,
        grade_min: grade,
        grade_max: grade,
        salary_min: Number(smin),
        salary_max: Number(smax),
        stack,
      });
      navigate(`/e/v/${need.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <form className="card vac-form stack" onSubmit={submit}>
      <h2>Новая вакансия</h2>
      {error && <p className="banner">{error}</p>}
      <div className="grid-2">
        <label className="field">
          <span>Должность</span>
          <select value={spec} onChange={(event) => setSpec(event.target.value)}>
            {specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Грейд</span>
          <select value={grade} onChange={(event) => setGrade(event.target.value)}>
            {grades.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Описание</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <div className="grid-2">
        <label className="field"><span>Вилка от, ₽</span><input value={smin} onChange={(event) => setSmin(event.target.value)} type="number" min={0} required /></label>
        <label className="field"><span>Вилка до, ₽</span><input value={smax} onChange={(event) => setSmax(event.target.value)} type="number" min={0} required /></label>
      </div>
      <SkillPicker tags={tags} value={stack} onChange={setStack} />
      <button className="btn-red">Опубликовать</button>
    </form>
  );
}

export function ShortlistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { specs, grades } = useCatalog();
  const [need, setNeed] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [invited, setInvited] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [spec, setSpec] = useState("");
  const [grade, setGrade] = useState("");
  const [description, setDescription] = useState("");
  const [smin, setSmin] = useState("");
  const [smax, setSmax] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [stack, setStack] = useState<string[]>([]);
  const [fspOnly, setFspOnly] = useState(false);

  async function load(only = fspOnly) {
    const [needRow, people] = await Promise.all([
      api(`/needs/${id}`),
      api(`/needs/${id}/shortlist${only ? "?fsp_only=true" : ""}`),
    ]);
    setNeed(needRow);
    setRows(people);
    setSpec(needRow.specialization_code || "");
    setGrade(needRow.grade_min || "");
    setDescription(needRow.team_description || "");
    setSmin(String(needRow.salary_min ?? ""));
    setSmax(String(needRow.salary_max ?? ""));
    setStack((needRow.stack || []).map((tag: Tag) => tag.code));
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, [id]);
  useEffect(() => {
    if (!spec) return;
    api<Tag[]>(`/catalog/stack-tags?specialization=${spec}`).then(setTags);
  }, [spec]);

  async function invite(row: any) {
    setError("");
    try {
      await api("/invitations", "POST", { candidate_id: row.id, need_id: Number(id) });
      setInvited((current) => [...current, row.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const specTitle = specs.find((item) => item.code === spec)?.title || spec;
    const gradeTitle = grades.find((item) => item.code === grade)?.title || grade;
    setError("");
    try {
      const updated = await api(`/needs/${id}`, "PATCH", {
        title: `${specTitle} · ${gradeTitle}`,
        team_description: description,
        specialization_code: spec,
        grade_min: grade,
        grade_max: grade,
        salary_min: Number(smin),
        salary_max: Number(smax),
        stack,
        prefer_fsp: Boolean(need?.prefer_fsp),
      });
      setNeed(updated);
      setConfirm(false);
      setEditing(false);
      setRows(await api(`/needs/${id}/shortlist${fspOnly ? "?fsp_only=true" : ""}`));
    } catch (err) {
      setConfirm(false);
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <section className="stack">
      <button className="btn-ghost back" type="button" onClick={() => navigate("/e")}>Вакансии</button>
      {need && !editing && (
        <article className="card vac-hero">
          <div className="stack">
            <div className="vac-top">
              <span className="lvl">{need.grade_title}</span>
              {need.applications > 0 && <span className="status">Отклики · {need.applications}</span>}
            </div>
            <h2>{need.specialization_title}</h2>
            <p>{need.team_description}</p>
            <div className="chips">{need.stack?.map((tag: Tag) => <span className="chip" key={tag.code}>{tag.title}</span>)}</div>
          </div>
          <div className="vac-side">
            <p className="vac-pay">{range(need.salary_min, need.salary_max)}</p>
            {need.editable && <button className="btn" type="button" onClick={() => setEditing(true)}>Изменить</button>}
          </div>
        </article>
      )}
      {need && editing && (
        <form className="card vac-form stack" onSubmit={(event) => { event.preventDefault(); setConfirm(true); }}>
          <h2>Вакансия</h2>
          <div className="grid-2">
            <label className="field">
              <span>Должность</span>
              <select value={spec} onChange={(event) => { setSpec(event.target.value); setStack([]); }}>
                {specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Грейд</span>
              <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                {grades.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Описание</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          <div className="grid-2">
            <label className="field"><span>Вилка от, ₽</span><input value={smin} onChange={(event) => setSmin(event.target.value)} type="number" min={0} required /></label>
            <label className="field"><span>Вилка до, ₽</span><input value={smax} onChange={(event) => setSmax(event.target.value)} type="number" min={0} required /></label>
          </div>
          <SkillPicker tags={tags} value={stack} onChange={setStack} />
          <div className="actions">
            <button className="btn-ghost" type="button" onClick={() => setEditing(false)}>Отмена</button>
            <button className="btn-red" type="submit">Сохранить</button>
          </div>
        </form>
      )}
      {error && <p className="banner">{error}</p>}
      <div className="vac-head">
        <h2>Кандидаты</h2>
        <label className="consent">
          <input
            type="checkbox"
            checked={fspOnly}
            onChange={(event) => {
              const next = event.target.checked;
              setFspOnly(next);
              api(`/needs/${id}/shortlist${next ? "?fsp_only=true" : ""}`).then(setRows).catch((err) => setError(err.message));
            }}
          />
          Только с достижениями ФСП
        </label>
      </div>
      <p className="muted">Список отсортирован по соответствию потребности: насколько человек подходит этой вакансии. Полоски показывают, из чего сложился процент.</p>
      <div className="people">
        {rows.map((row) => (
          <Person key={row.id} row={row} invited={invited.includes(row.id)} onInvite={invited.includes(row.id) ? undefined : invite} />
        ))}
      </div>
      <p className="muted">Факторы видны в карточке кандидата. Фильтр «только с достижениями ФСП» можно включить и выключить.</p>
      {confirm && (
        <div className="confirm-backdrop" onClick={() => setConfirm(false)}>
          <form className="card confirm-dialog stack" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h3>Сохранить изменения?</h3>
            <div className="actions">
              <button className="btn-ghost" type="button" onClick={() => setConfirm(false)}>Отмена</button>
              <button className="btn-red">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export function EmployerInvites() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/invitations").then(setRows); }, []);
  return (
    <section className="stack">
      <h2>Отклики</h2>
      <div className="vac-grid">
        {rows.map((row) => (
          <article className="card vac-card" key={row.id}>
            <p className="status">{STATUS[row.status] || row.status}</p>
            <h3>{row.candidate?.first_name} {row.candidate?.last_name}</h3>
            <p className="vac-pay">{range(row.salary_min, row.salary_max)}</p>
            <p className="vac-text">{row.body}</p>
            {!row.candidate?.contacts_locked && <p className="ok">{row.candidate?.email} · {row.candidate?.telegram}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export function CompanyPage() {
  const [company, setCompany] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api("/company").then(setCompany); }, []);
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
    setSaved(true);
  }
  return (
    <form className="card vac-form stack" onSubmit={save}>
      <h2>Компания</h2>
      {saved && <p className="ok">Сохранено</p>}
      <label className="field"><span>Название</span><input name="name" defaultValue={company.name} /></label>
      <label className="field"><span>Направление</span><input name="industry" defaultValue={company.industry} /></label>
      <label className="field"><span>Почта</span><input name="email" defaultValue={company.contact_email} /></label>
      <label className="field"><span>О компании</span><textarea name="about" defaultValue={company.about} /></label>
      <button className="btn-red">Сохранить</button>
    </form>
  );
}
