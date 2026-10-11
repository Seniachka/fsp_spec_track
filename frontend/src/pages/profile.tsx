import { FormEvent, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";

type Experience = {
  role_title: string;
  company_name: string;
  start_year: string;
  end_year: string;
  is_current: boolean;
};

type Skill = {
  code: string;
  title: string;
  category: string | null;
  exam_positions: string[];
};

const CATEGORY_TITLE: Record<string, string> = {
  language: "Языки",
  framework: "Фреймворки",
  database: "Базы данных",
  messaging: "Очереди и шины",
  tooling: "Инструменты",
  infra: "Инфраструктура",
  concept: "Практики и области",
};

const EMPTY_JOB: Experience = { role_title: "", company_name: "", start_year: "", end_year: "", is_current: false };

export function ProfileLayout() {
  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Профиль</p>
        <h2>Заполняйте по частям</h2>
        <p className="muted">Каждая страница сохраняется отдельно. Можно закрыть и вернуться к любому шагу.</p>
      </div>
      <nav className="steps">
        <NavLink to="/c/profile" end>1. Личные данные</NavLink>
        <NavLink to="/c/profile/experience">2. Опыт</NavLink>
        <NavLink to="/c/profile/skills">3. Навыки</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

function useProfile() {
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api("/me").then(setMe).catch((err) => setError(err.message));
  }, []);

  async function save(body: unknown, next?: string) {
    setError("");
    setSaved(false);
    const updated = await api("/me", "PATCH", body);
    setMe(updated);
    setSaved(true);
    return updated;
  }

  return { me, error, setError, saved, save };
}

function Status({ error, saved }: { error: string; saved: boolean }) {
  return (
    <>
      {error && <p className="banner">{error}</p>}
      {saved && <p className="ok">Сохранено. Можно вернуться позже.</p>}
    </>
  );
}

export function ProfilePersonal() {
  const { me, error, setError, saved, save } = useProfile();
  const [profile, setProfile] = useState<any>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [smin, setSmin] = useState("");
  const [smax, setSmax] = useState("");
  const [participant, setParticipant] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!me || ready) return;
    setFirst(me.first_name || "");
    setLast(me.last_name || "");
    setAbout(me.about || "");
    setPhone(me.phone || "");
    setTelegram(me.telegram || "");
    setSmin(me.desired_salary_min ?? "");
    setSmax(me.desired_salary_max ?? "");
    setProfile(me);
    setReady(true);
  }, [me, ready]);

  if (!me || !profile) return <p>{error || "Загрузка…"}</p>;

  function payload() {
    return {
      first_name: first,
      last_name: last,
      about,
      phone,
      telegram,
      desired_salary_min: smin === "" ? null : Number(smin),
      desired_salary_max: smax === "" ? null : Number(smax),
    };
  }

  async function onSubmit(event: FormEvent, next?: string) {
    event.preventDefault();
    try {
      await save(payload());
      if (next) navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function toggle(published: boolean) {
    setError("");
    try {
      const updated = await api("/me/privacy", "PUT", { published, show_in_search: published });
      setProfile({ ...profile, ...updated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function link() {
    setError("");
    try {
      setProfile(await api("/me/fsp-link", "POST", { participant_id: participant }));
      setParticipant("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function unlink() {
    setError("");
    try {
      setProfile(await api("/me/fsp-link", "DELETE"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <form className="card stack" onSubmit={(event) => onSubmit(event)}>
      <h3>Личные данные</h3>
      <Status error={error} saved={saved} />
      <label className="field"><span>Почта</span><input value={profile.email || ""} readOnly /></label>
      <div className="grid-2">
        <label className="field"><span>Имя</span><input value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        <label className="field"><span>Фамилия</span><input value={last} onChange={(e) => setLast(e.target.value)} /></label>
      </div>
      <label className="field"><span>О себе</span><textarea value={about} onChange={(e) => setAbout(e.target.value)} /></label>
      <div className="grid-2">
        <label className="field"><span>Телефон</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7" /></label>
        <label className="field"><span>Telegram</span><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Ожидания от, ₽</span><input type="number" min={0} value={smin} onChange={(e) => setSmin(e.target.value)} /></label>
        <label className="field"><span>Ожидания до, ₽</span><input type="number" min={0} value={smax} onChange={(e) => setSmax(e.target.value)} /></label>
      </div>
      <div className="stack" id="fsp">
        <h3>ID участника ФСП</h3>
        <p>{profile.fsp_participant_id ? `Привязан ${profile.fsp_participant_id}` : "История не привязана."}</p>
        <div className="fsp-link">
          <input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="FSP-1001" />
          <button className="btn-red" type="button" onClick={link}>Привязать</button>
        </div>
        {profile.fsp_participant_id && <button className="btn-ghost" type="button" onClick={unlink}>Отвязать</button>}
      </div>
      <div className="stack">
        <h3>Кто меня видит</h3>
        <p>Публикация профиля: {profile.published ? "включена" : "выключена"}.</p>
        <button className="btn" type="button" onClick={() => toggle(!profile.published)}>{profile.published ? "Скрыть из подборок" : "Снова показывать"}</button>
      </div>
      <div className="actions">
        <button className="btn-red" type="submit">Сохранить</button>
        <button className="btn" type="button" onClick={(event) => onSubmit(event as unknown as FormEvent, "/c/profile/experience")}>Дальше: опыт</button>
      </div>
    </form>
  );
}

export function ProfileExperience() {
  const navigate = useNavigate();
  const { me, error, setError, saved, save } = useProfile();
  const [rows, setRows] = useState<Experience[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!me || ready) return;
    const savedRows = (me.experiences || []).map((item: Experience) => ({
      role_title: item.role_title || "",
      company_name: item.company_name || "",
      start_year: item.start_year || "",
      end_year: item.end_year || "",
      is_current: Boolean(item.is_current),
    }));
    setRows(savedRows.length ? savedRows : [{ ...EMPTY_JOB }]);
    setReady(true);
  }, [me, ready]);

  if (!me || !ready) return <p>{error || "Загрузка…"}</p>;

  function update(index: number, patch: Partial<Experience>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(event: FormEvent, next?: string) {
    event.preventDefault();
    try {
      await save({
        experiences: rows.filter((row) => row.role_title.trim() || row.company_name.trim()),
      });
      if (next) navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <form className="card stack" onSubmit={(event) => onSubmit(event)}>
      <h3>Опыт</h3>
      <p className="muted">Мест работы может быть несколько. Пустую карточку можно не заполнять.</p>
      <Status error={error} saved={saved} />
      {rows.map((row, index) => (
        <div className="exp-card" key={index}>
          <div className="grid-2">
            <label className="field"><span>Роль</span><input value={row.role_title} onChange={(e) => update(index, { role_title: e.target.value })} /></label>
            <label className="field"><span>Компания</span><input value={row.company_name} onChange={(e) => update(index, { company_name: e.target.value })} /></label>
          </div>
          <div className="grid-2">
            <label className="field"><span>Год начала</span><input value={row.start_year} onChange={(e) => update(index, { start_year: e.target.value })} placeholder="2022" /></label>
            <label className="field"><span>Год окончания</span><input value={row.end_year} disabled={row.is_current} onChange={(e) => update(index, { end_year: e.target.value })} placeholder={row.is_current ? "по настоящее время" : "2025"} /></label>
          </div>
          <label className="consent"><input type="checkbox" checked={row.is_current} onChange={(e) => update(index, { is_current: e.target.checked, end_year: e.target.checked ? "" : row.end_year })} /> Работаю здесь сейчас</label>
          {rows.length > 1 && <button className="btn-ghost" type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Убрать</button>}
        </div>
      ))}
      <button className="btn-ghost" type="button" onClick={() => setRows((current) => [...current, { ...EMPTY_JOB }])}>Добавить место</button>
      <div className="actions">
        <button className="btn-ghost" type="button" onClick={() => navigate("/c/profile")}>Назад</button>
        <button className="btn-red" type="submit">Сохранить</button>
        <button className="btn" type="button" onClick={(event) => onSubmit(event as unknown as FormEvent, "/c/profile/skills")}>Дальше: навыки</button>
      </div>
    </form>
  );
}

export function ProfileSkills() {
  const { me, error, setError, saved, save } = useProfile();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [soft, setSoft] = useState<{ code: string; title: string }[]>([]);
  const [specs, setSpecs] = useState<{ code: string; title: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedSoft, setPickedSoft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/bank/overview")
      .then((overview) => {
        setSkills(overview.skills || []);
        setSoft(overview.soft_skills || []);
        setSpecs(overview.specializations || []);
      })
      .catch((err) => setError(err.message));
  }, [setError]);

  useEffect(() => {
    if (!me || ready) return;
    setPicked((me.stack || []).map((tag: { code: string }) => tag.code));
    setPickedSoft(me.soft_skills || []);
    if (me.specialization?.code) setSpec(me.specialization.code);
    setReady(true);
  }, [me, ready]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (spec !== "all" && !(skill.exam_positions || []).some((position) => position.startsWith(`${spec}/`))) return false;
      if (!needle) return true;
      return skill.title.toLowerCase().includes(needle) || skill.code.includes(needle);
    });
  }, [skills, query, spec]);

  const groups = useMemo(() => {
    const buckets = new Map<string, Skill[]>();
    for (const skill of visible) {
      const key = skill.category || "concept";
      buckets.set(key, [...(buckets.get(key) || []), skill]);
    }
    return [...buckets.entries()];
  }, [visible]);

  if (!me || !ready) return <p>{error || "Загрузка…"}</p>;

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await save({ stack: picked, soft_skills: pickedSoft });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h3>Навыки</h3>
      <p className="muted">Список с актуальной карты навыков по вакансиям. Отметьте своё и сохраните — выбор останется, когда вернётесь.</p>
      <Status error={error} saved={saved} />
      <div className="picker">
        <label className="field">
          <span>Специализация</span>
          <select value={spec} onChange={(e) => setSpec(e.target.value)}>
            <option value="all">Все</option>
            {specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Поиск</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Python, React…" />
        </label>
      </div>
      {picked.length > 0 && (
        <div className="chips">
          {picked.map((code) => <span className="chip" key={code}>{skills.find((skill) => skill.code === code)?.title || code}</span>)}
        </div>
      )}
      <div className="skill-groups">
        {groups.map(([category, items]) => (
          <div key={category}>
            <h3>{CATEGORY_TITLE[category] || category}</h3>
            <div className="chips" style={{ marginTop: 8 }}>
              {items.map((skill) => (
                <button
                  key={skill.code}
                  className={picked.includes(skill.code) ? "chip-btn on" : "chip-btn"}
                  type="button"
                  onClick={() => toggle(picked, skill.code, setPicked)}
                >
                  {skill.title}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="muted">Ничего не нашлось. Смените специализацию или запрос.</p>}
      </div>
      <h3>Софт-скиллы</h3>
      <div className="chips">
        {soft.map((skill) => (
          <button
            key={skill.code}
            className={pickedSoft.includes(skill.title) ? "chip-btn on" : "chip-btn"}
            type="button"
            onClick={() => toggle(pickedSoft, skill.title, setPickedSoft)}
          >
            {skill.title}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn-red" type="submit">Сохранить навыки</button>
      </div>
    </form>
  );
}
