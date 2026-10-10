import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";

type Grade = { code: string; title: string; base_difficulty?: number };
type Spec = { code: string; title: string };
type SkillRow = {
  code: string;
  title: string;
  category: string | null;
  soft: boolean;
  mentions: number;
  exam_positions: string[];
  questions: Record<string, number>;
  topics: Record<string, string[]>;
  total: number;
};
type Overview = {
  specializations: Spec[];
  grades: Grade[];
  levels: Record<string, string>;
  blueprint: any;
  counts: any;
  skills: SkillRow[];
  soft_skills: SkillRow[];
  positions: { specialization: string; grade: string; vacancies: number; exam_skills: string[]; soft_skills: string[] }[];
};
type PositionSkill = {
  code: string;
  title: string;
  category: string;
  mentions: number;
  share: number;
  level: string;
  in_exam?: boolean;
  baseline?: boolean;
  topics: Record<string, string[]>;
  questions: Record<string, number>;
  total_questions: number;
};
type Position = {
  specialization: string;
  specialization_title: string;
  grade: string;
  grade_title: string;
  vacancies: number;
  exam_skills: string[];
  hard_skills: PositionSkill[];
  soft_skills: PositionSkill[];
  practice: PracticeTask[];
};
type Option = { id: string; text: string };
type TheoryItem = {
  id: string;
  kind: "single" | "multi";
  skill: string;
  skill_title: string;
  topic: string;
  grade: string;
  difficulty: number;
  prompt: string;
  code: string | null;
  options: Option[];
  answer?: string | string[];
  explanation?: string;
  source: string;
};
type PracticeTask = {
  id: string;
  grade: string;
  difficulty: number;
  title: string;
  topic: string;
  domains: string[];
  statement: string;
  signature: string;
  starter: string;
  complexity_hint?: string | null;
  time_limit_minutes: number;
  public_tests: { args: unknown[]; expected: unknown }[];
  hidden_tests_count: number;
};
type SkillDetail = Omit<SkillRow, "topics"> & {
  coverage: { topics: Record<string, string[]>; questions: Record<string, number>; total: number };
  topics: Record<string, { title: string; grade: string; single: number; multi: number; total: number }[]>;
};

const GRADES = ["intern", "junior", "middle", "senior", "lead"];
const LEVEL_TITLE: Record<string, string> = {
  core: "ядро",
  expected: "ожидается",
  common: "встречается",
  rare: "редко",
  baseline: "базовый для грейда",
};
const CATEGORY_TITLE: Record<string, string> = {
  language: "языки",
  framework: "фреймворки",
  database: "базы данных",
  messaging: "очереди и шины",
  tooling: "инструменты",
  infra: "инфраструктура",
  concept: "практики и области",
  soft: "софт-скиллы",
};

function gradeTitle(grades: Grade[], code: string) {
  return grades.find((g) => g.code === code)?.title || code;
}

function fmt(value: unknown) {
  return JSON.stringify(value);
}

export function SkillsPage() {
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const view = params.get("view") || "position";
  const spec = params.get("spec") || "backend";
  const grade = params.get("grade") || "junior";
  const skill = params.get("skill");

  useEffect(() => {
    api<Overview>("/bank/overview").then(setOverview).catch((e) => setError(e.message));
  }, []);

  function update(next: Record<string, string | null>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") copy.delete(key);
      else copy.set(key, value);
    }
    setParams(copy, { replace: false });
  }

  if (error) return <p className="banner">{error}</p>;
  if (!overview) return <p>Загрузка каталога…</p>;

  const counts = overview.counts || {};
  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Открытый банк</p>
          <h1>Навыки и задания по грейдам.</h1>
          <p className="lead">
            Требования собраны из {overview.positions.reduce((s, p) => s + p.vacancies, 0)} вакансий hh.ru по 8 специальностям и 5 грейдам.
            По каждому навыку — темы и вопросы на каждый грейд; банк открыт, потому что знать его целиком — и значит знать грейд.
          </p>
        </div>
        <aside className="card">
          <p className="eyebrow">В банке</p>
          <table className="demo-table">
            <tbody>
              <tr><td>Навыков</td><td>{overview.skills.length} hard · {overview.soft_skills.length} soft</td></tr>
              <tr><td>Тем</td><td>{counts.topics}</td></tr>
              <tr><td>Теоретических вопросов</td><td>{counts.theory}</td></tr>
              <tr><td>Практических задач</td><td>{counts.practice}</td></tr>
            </tbody>
          </table>
        </aside>
      </section>

      <nav className="tabs">
        {[["position", "Должность"], ["skills", "Все навыки"], ["practice", "Практика"], ["blueprint", "Формат экзамена"]].map(([code, title]) => (
          <button key={code} type="button" className={"tab" + (view === code && !skill ? " on" : "")} onClick={() => update({ view: code, skill: null })}>
            {title}
          </button>
        ))}
      </nav>

      {skill ? (
        <SkillPanel code={skill} grades={overview.grades} initialGrade={grade} onBack={() => update({ skill: null })} />
      ) : view === "skills" ? (
        <AllSkills overview={overview} onPick={(code) => update({ skill: code })} />
      ) : view === "practice" ? (
        <PracticeList grades={overview.grades} />
      ) : view === "blueprint" ? (
        <Blueprint blueprint={overview.blueprint} grades={overview.grades} />
      ) : (
        <PositionView
          overview={overview}
          spec={spec}
          grade={grade}
          onChange={(next) => update(next)}
          onPick={(code) => update({ skill: code })}
        />
      )}
    </div>
  );
}

function PositionView({
  overview,
  spec,
  grade,
  onChange,
  onPick,
}: {
  overview: Overview;
  spec: string;
  grade: string;
  onChange: (next: Record<string, string | null>) => void;
  onPick: (code: string) => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setPosition(null);
    setError("");
    api<Position>(`/bank/positions/${spec}/${grade}`).then(setPosition).catch((e) => setError(e.message));
  }, [spec, grade]);

  const exam = position?.hard_skills.filter((s) => s.in_exam) || [];
  const rest = position?.hard_skills.filter((s) => !s.in_exam) || [];
  const examQuestions = exam.reduce((sum, s) => sum + (s.questions?.[grade] || 0), 0);

  return (
    <div className="stack">
      <section className="card stack">
        <div className="picker">
          <label className="field" style={{ maxWidth: 320 }}>
            <span>Специализация</span>
            <select value={spec} onChange={(e) => onChange({ spec: e.target.value })}>
              {overview.specializations.map((s) => <option key={s.code} value={s.code}>{s.title}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Грейд</span>
            <div className="chips">
              {overview.grades.map((g) => (
                <button key={g.code} type="button" className={"chip-btn" + (g.code === grade ? " on" : "")} onClick={() => onChange({ grade: g.code })}>
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="banner">{error}</p>}
        {position && (
          <p className="muted">
            {position.specialization_title} · {position.grade_title}: {position.vacancies} вакансий, {exam.length} экзаменационных навыков,
            {" "}{examQuestions} вопросов этого грейда по ним, {position.soft_skills.length} софт-скиллов, {position.practice.length} практических задач в пуле.
          </p>
        )}
      </section>

      {position && (
        <>
          <section className="card stack">
            <p className="eyebrow">Hard-навыки на экзамене</p>
            <div className="skill-grid">
              {exam.map((s) => <SkillCard key={s.code} skill={s} grade={grade} onPick={onPick} />)}
            </div>
            {rest.length > 0 && (
              <>
                <button type="button" className="btn-ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Скрыть" : `Ещё ${rest.length} навыков из вакансий (не входят в экзамен)`}
                </button>
                {showAll && (
                  <div className="skill-grid">
                    {rest.map((s) => <SkillCard key={s.code} skill={s} grade={grade} onPick={onPick} />)}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card stack">
            <p className="eyebrow">Софт-скиллы</p>
            <div className="skill-grid">
              {position.soft_skills.map((s) => <SkillCard key={s.code} skill={s} grade={grade} onPick={onPick} soft />)}
            </div>
          </section>

          <section className="card stack">
            <p className="eyebrow">Практика для этого грейда и соседних</p>
            <p className="muted">На экзамене три задачи: разминочная (грейд ниже), основная (свой грейд) и усложнённая (грейд выше). Все кандидаты пула:</p>
            <div className="stack">
              {position.practice.map((task) => <PracticeCard key={task.id} task={task} grades={overview.grades} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SkillCard({ skill, grade, onPick, soft }: { skill: PositionSkill; grade: string; onPick: (code: string) => void; soft?: boolean }) {
  const own = skill.questions?.[grade] || 0;
  const topics = skill.topics?.[grade] || [];
  const gi = GRADES.indexOf(grade);
  const near = [GRADES[gi - 1], GRADES[gi + 1]].filter(Boolean).reduce((s, g) => s + (skill.questions?.[g] || 0), 0);
  return (
    <button type="button" className="skill-card" onClick={() => onPick(skill.code)}>
      <div className="skill-head">
        <b>{skill.title}</b>
        <span className={"lvl " + skill.level}>{LEVEL_TITLE[skill.level] || skill.level}</span>
      </div>
      <p className="muted small">
        {soft ? (skill.mentions ? `упомянут в ${Math.round((skill.share || 0) * 100)}% вакансий` : "базовое ожидание грейда") : `в ${Math.round((skill.share || 0) * 100)}% вакансий`}
        {" · "}{own} вопр. этого грейда{near ? ` + ${near} соседних` : ""} · всего {skill.total_questions}
      </p>
      {topics.length > 0 && <p className="small">{topics.join(" · ")}</p>}
    </button>
  );
}

function AllSkills({ overview, onPick }: { overview: Overview; onPick: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const rows = useMemo(() => {
    const all = [...overview.skills, ...overview.soft_skills];
    const needle = q.trim().toLowerCase();
    return all
      .filter((s) => (!cat || (s.soft ? "soft" : s.category) === cat))
      .filter((s) => !needle || s.title.toLowerCase().includes(needle) || s.code.includes(needle))
      .sort((a, b) => b.mentions - a.mentions);
  }, [overview, q, cat]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    overview.skills.forEach((s) => s.category && set.add(s.category));
    return [...set];
  }, [overview]);
  return (
    <section className="card stack">
      <div className="picker">
        <label className="field" style={{ maxWidth: 320 }}><span>Поиск</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="python, kafka, коммуникация…" /></label>
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Категория</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">все</option>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_TITLE[c] || c}</option>)}
            <option value="soft">софт-скиллы</option>
          </select>
        </label>
      </div>
      <table className="cases skills-table">
        <thead>
          <tr><th>Навык</th><th>Категория</th><th>Упоминаний</th><th>Должностей на экзамене</th>{overview.grades.map((g) => <th key={g.code}>{g.title}</th>)}<th>Всего</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.code} className="clickable" onClick={() => onPick(s.code)}>
              <td><b>{s.title}</b><br /><span className="muted small">{s.code}</span></td>
              <td>{s.soft ? "софт" : CATEGORY_TITLE[s.category || ""] || s.category}</td>
              <td>{s.mentions}</td>
              <td>{s.exam_positions.length}</td>
              {overview.grades.map((g) => <td key={g.code}>{s.questions?.[g.code] || "—"}</td>)}
              <td><b>{s.total || "—"}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Навыки без вопросов не входят ни в один экзаменационный список: они встречались в вакансиях редко.</p>
    </section>
  );
}

function SkillPanel({ code, grades, initialGrade, onBack }: { code: string; grades: Grade[]; initialGrade: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [grade, setGrade] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<{ total: number; items: TheoryItem[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const limit = 40;

  useEffect(() => {
    setDetail(null);
    setError("");
    api<SkillDetail>(`/bank/skills/${code}`)
      .then((d) => {
        setDetail(d);
        const available = GRADES.filter((g) => d.topics[g]?.length);
        setGrade(available.includes(initialGrade) ? initialGrade : "");
        setTopic("");
        setOffset(0);
      })
      .catch((e) => setError(e.message));
  }, [code]);

  useEffect(() => {
    if (!detail) return;
    const query = new URLSearchParams({ skill: code, offset: String(offset), limit: String(limit) });
    if (grade) query.set("grade", grade);
    if (topic) query.set("topic", topic);
    if (kind) query.set("kind", kind);
    if (q.trim()) query.set("q", q.trim());
    api(`/bank/theory?${query}`).then(setPage).catch((e) => setError(e.message));
  }, [detail, code, grade, topic, kind, q, offset]);

  if (error) return <p className="banner">{error}</p>;
  if (!detail) return <p>Загрузка навыка…</p>;

  const topicsForGrade = grade ? detail.topics[grade] || [] : GRADES.flatMap((g) => detail.topics[g] || []);
  return (
    <div className="stack">
      <section className="card stack">
        <button type="button" className="btn-ghost" style={{ justifySelf: "start" }} onClick={onBack}>← Назад</button>
        <p className="eyebrow">{detail.soft ? "Софт-скилл" : CATEGORY_TITLE[detail.category || ""] || "Навык"}</p>
        <h2>{detail.title}</h2>
        <p className="muted">
          Упоминаний в вакансиях: {detail.mentions}. На экзамене у {detail.exam_positions.length} должностей.
          {" "}Всего вопросов: {detail.coverage?.total || 0}.
        </p>
        <div className="chips">
          {detail.exam_positions.map((p) => <span className="chip" key={p}>{p}</span>)}
        </div>
        <div className="grade-cover">
          {GRADES.map((g) => (
            <div key={g} className={"grade-cell" + (grade === g ? " on" : "")} onClick={() => { setGrade(grade === g ? "" : g); setTopic(""); setOffset(0); }}>
              <div className="status">{gradeTitle(grades, g)}</div>
              <div className="big">{detail.coverage?.questions?.[g] || 0}</div>
              <ul className="topic-list">
                {(detail.topics[g] || []).map((t) => <li key={t.title}>{t.title} <span className="muted">({t.total})</span></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <p className="eyebrow">Вопросы</p>
        <div className="picker">
          <label className="field" style={{ maxWidth: 360 }}>
            <span>Тема</span>
            <select value={topic} onChange={(e) => { setTopic(e.target.value); setOffset(0); }}>
              <option value="">все темы{grade ? ` грейда ${gradeTitle(grades, grade)}` : ""}</option>
              {topicsForGrade.map((t) => <option key={t.grade + t.title} value={t.title}>{t.title} ({t.total})</option>)}
            </select>
          </label>
          <label className="field" style={{ maxWidth: 200 }}>
            <span>Тип</span>
            <select value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0); }}>
              <option value="">любой</option>
              <option value="single">один ответ</option>
              <option value="multi">несколько ответов</option>
            </select>
          </label>
          <label className="field" style={{ maxWidth: 300 }}>
            <span>Поиск по тексту</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="слово из вопроса или варианта" />
          </label>
        </div>
        {page && (
          <>
            <p className="muted">Найдено {page.total}. Показаны {page.total ? offset + 1 : 0}–{Math.min(offset + limit, page.total)}.</p>
            <div className="stack">
              {page.items.map((item, index) => <Question key={item.id} item={item} index={offset + index + 1} grades={grades} />)}
            </div>
            <div className="actions">
              <button type="button" className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Назад</button>
              <button type="button" className="btn-ghost" disabled={offset + limit >= page.total} onClick={() => setOffset(offset + limit)}>Дальше →</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Question({ item, index, grades }: { item: TheoryItem; index: number; grades: Grade[] }) {
  const [open, setOpen] = useState(false);
  const correct = new Set(Array.isArray(item.answer) ? item.answer : item.answer ? [item.answer] : []);
  return (
    <article className="q">
      <div className="q-head">
        <span className="q-index">{index}</span>
        <div className="q-meta">
          <span className="chip">{gradeTitle(grades, item.grade)}</span>
          <span className="chip">{item.kind === "multi" ? "несколько верных" : "один верный"}</span>
          <span className="chip">сложность {item.difficulty}</span>
          <span className="muted small">{item.topic}</span>
        </div>
      </div>
      <p className="q-prompt">{item.prompt}</p>
      {item.code && <pre className="code">{item.code}</pre>}
      <div className="stack" style={{ gap: 6 }}>
        {item.options.map((o) => (
          <div key={o.id} className={"q-opt" + (open && correct.has(o.id) ? " right" : "")}>
            <span className="q-letter">{o.id}</span>
            <span>{o.text}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost" style={{ justifySelf: "start" }} onClick={() => setOpen((v) => !v)}>
        {open ? "Скрыть ответ" : "Показать ответ"}
      </button>
      {open && item.explanation && <p className="muted small">{item.explanation}</p>}
    </article>
  );
}

function PracticeList({ grades }: { grades: Grade[] }) {
  const [rows, setRows] = useState<PracticeTask[] | null>(null);
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ items: PracticeTask[] }>("/bank/practice").then((d) => setRows(d.items)).catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="banner">{error}</p>;
  if (!rows) return <p>Загрузка задач…</p>;
  const shown = rows.filter((t) => !grade || t.grade === grade);
  return (
    <section className="card stack">
      <p className="eyebrow">Практические задачи</p>
      <p className="muted">
        Решение — функция <code>solve(...)</code> на Python 3.12. Проверяется на 20 тестах: 5 открытых показаны здесь, 15 скрытых. Лимит на задачу — 10 минут.
      </p>
      <div className="chips">
        <button type="button" className={"chip-btn" + (grade === "" ? " on" : "")} onClick={() => setGrade("")}>все ({rows.length})</button>
        {grades.map((g) => (
          <button key={g.code} type="button" className={"chip-btn" + (grade === g.code ? " on" : "")} onClick={() => setGrade(g.code)}>
            {g.title} ({rows.filter((t) => t.grade === g.code).length})
          </button>
        ))}
      </div>
      <div className="stack">
        {shown.map((task) => <PracticeCard key={task.id} task={task} grades={grades} />)}
      </div>
    </section>
  );
}

function PracticeCard({ task, grades }: { task: PracticeTask; grades: Grade[] }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="q">
      <div className="q-head" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <b>{task.title}</b>
        <div className="q-meta">
          <span className="chip">{gradeTitle(grades, task.grade)}</span>
          <span className="chip">сложность {task.difficulty}</span>
          <span className="muted small">{task.topic}</span>
          {task.domains.length > 0 && <span className="muted small">· {task.domains.join(", ")}</span>}
        </div>
      </div>
      {open && (
        <div className="stack">
          <p>{task.statement}</p>
          <pre className="code">{task.signature}</pre>
          {task.complexity_hint && <p className="muted small">Ожидаемая сложность: {task.complexity_hint}</p>}
          <table className="cases">
            <thead><tr><th>#</th><th>Вход</th><th>Ожидание</th></tr></thead>
            <tbody>
              {task.public_tests.map((t, i) => (
                <tr key={i}><td>{i + 1}</td><td><code>{t.args.map(fmt).join(", ")}</code></td><td><code>{fmt(t.expected)}</code></td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Ещё {task.hidden_tests_count} скрытых тестов проверяются при сдаче.</p>
        </div>
      )}
    </article>
  );
}

function Blueprint({ blueprint, grades }: { blueprint: any; grades: Grade[] }) {
  if (!blueprint?.theory) return null;
  const theory = blueprint.theory;
  const practice = blueprint.practice;
  return (
    <section className="card stack">
      <p className="eyebrow">Формат экзамена</p>
      <h2>{blueprint.total_minutes} минут: {theory.minutes} теория + {practice.minutes} практика</h2>
      <div className="grid-2">
        <div className="stack">
          <h3>Теория — {theory.questions} вопросов</h3>
          <p>{theory.rule}</p>
          <ul className="explain">
            <li>{Math.round(theory.mix.own_grade * 100)}% вопросов своего грейда, {Math.round(theory.mix.grade_below * 100)}% грейда ниже, {Math.round(theory.mix.grade_above * 100)}% грейда выше</li>
            <li>{Math.round(theory.soft_share * 100)}% — софт-скиллы, остальное — hard-навыки должности</li>
            <li>{Math.round(theory.kinds.single * 100)}% с одним верным ответом, {Math.round(theory.kinds.multi * 100)}% с несколькими</li>
            <li>{theory.seconds_per_question} секунд на вопрос в среднем</li>
          </ul>
        </div>
        <div className="stack">
          <h3>Практика — {practice.tasks} задачи</h3>
          <p>{practice.rule}</p>
          <ul className="explain">
            <li>{practice.minutes_per_task} минут на задачу</li>
            <li>20 тестов на задачу: 5 открытых, 15 скрытых</li>
          </ul>
        </div>
      </div>
      <h3>Оценка</h3>
      <p>{blueprint.scoring}</p>
      <h3>Базовая сложность по грейдам</h3>
      <div className="chips">
        {grades.map((g) => <span className="chip" key={g.code}>{g.title}: {g.base_difficulty}</span>)}
      </div>
    </section>
  );
}
