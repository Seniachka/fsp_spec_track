import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDateTime } from "../api";
import { CodePad } from "../CodePad";

const GRADES = [
  ["intern", "Стажёр"],
  ["junior", "Junior"],
  ["middle", "Middle"],
  ["senior", "Senior"],
  ["lead", "Lead"],
] as const;

type ExamItem = {
  id: number;
  section: "theory" | "practice";
  kind: "single" | "multi" | "code";
  topic: string;
  prompt: string;
  title?: string;
  skill_title?: string;
  grade?: string;
  grade_title?: string;
  soft?: boolean;
  role_title?: string;
  options?: { id: string; text: string }[];
  code?: string | null;
  choice_id?: string;
  choice_ids?: string[];
  answer?: string[];
  explanation?: string;
  starter?: string;
  source?: string;
  signature?: string;
  public_tests?: { args: unknown; expected: unknown }[];
  hidden_count?: number;
  complexity_hint?: string | null;
  points?: number;
};

type Session = {
  id: number;
  items: ExamItem[];
  deadline: string;
  duration_minutes: number;
  claimed_grade_title?: string;
  specialization_code?: string;
  status: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function nextAttemptMessage(iso?: string | null) {
  const formatted = formatDateTime(iso);
  if (!formatted) return "Новая попытка сейчас недоступна.";
  return `Новая попытка будет доступна ${formatted}.`;
}

function gradeChangeMessage(iso?: string | null) {
  const formatted = formatDateTime(iso);
  if (!formatted) return "Смена грейда закрыта на 90 дней после прохождения.";
  return `Смена грейда будет доступна ${formatted}.`;
}

function formatClock(total: number) {
  const seconds = Math.max(0, total);
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function useSecondsLeft(deadline?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (!deadline) return 60 * 60;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
}

export function TestPage() {
  const [specs, setSpecs] = useState<{ code: string; title: string }[]>([]);
  const [spec, setSpec] = useState("backend");
  const [grade, setGrade] = useState("middle");
  const [purpose, setPurpose] = useState("initial");
  const [blocked, setBlocked] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [multi, setMulti] = useState<Record<number, string[]>>({});
  const [sources, setSources] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);
  const [runs, setRuns] = useState<Record<number, any>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    api("/catalog/specializations").then(setSpecs).catch(() => undefined);
    api("/me").then((profile) => {
      const rules = profile.policy || {};
      if (rules.cooldown_active) {
        setBlocked(gradeChangeMessage(rules.grade_change_allowed_at || rules.next_attempt_at));
      } else if (rules.can_start_down && !rules.can_start_initial) setPurpose("down");
      else if (rules.can_start_up && !rules.can_start_initial) setPurpose("up");
      else if (!rules.can_start_initial && !rules.can_start_down && !rules.can_start_up) {
        setBlocked(nextAttemptMessage(rules.next_attempt_at || rules.grade_change_allowed_at));
      }
    }).catch(() => undefined);
    api("/assessments/current")
      .then((payload) => {
        if (payload?.session) openSession(payload.session);
      })
      .catch(() => undefined);
  }, []);

  function openSession(created: Session) {
    const nextChoices: Record<number, string> = {};
    const nextMulti: Record<number, string[]> = {};
    const nextSources: Record<number, string> = {};
    created.items.forEach((item) => {
      if (item.kind === "single" && item.choice_id) nextChoices[item.id] = item.choice_id;
      if (item.kind === "multi") nextMulti[item.id] = item.choice_ids || [];
      if (item.kind === "code") nextSources[item.id] = item.source ?? item.starter ?? "";
    });
    setChoices(nextChoices);
    setMulti(nextMulti);
    setSources(nextSources);
    setSession(created);
    setStep(0);
    setReady(true);
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api("/assessments/sessions", "POST", {
        specialization_code: spec,
        claimed_grade: grade,
        purpose,
      });
      openSession(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const answers = useMemo(() => {
    if (!session) return [];
    return session.items.map((item) => ({
      item_id: item.id,
      choice_id: item.kind === "single" ? choices[item.id] || null : null,
      choice_ids: item.kind === "multi" ? multi[item.id] || [] : null,
      source: item.kind === "code" ? sources[item.id] ?? "" : null,
    }));
  }, [session, choices, multi, sources]);

  useEffect(() => {
    if (!session || !ready || result) return;
    const timer = window.setTimeout(() => {
      api(`/assessments/sessions/${session.id}/answers`, "PUT", { answers }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, session, ready, result]);

  async function submit() {
    if (!session || submitting.current || result) return;
    submitting.current = true;
    setError("");
    try {
      const payload = await api(`/assessments/sessions/${session.id}/submit`, "POST", { answers });
      const fresh = await api(`/assessments/sessions/${session.id}`);
      setSession(fresh);
      setResult(payload);
    } catch (err) {
      submitting.current = false;
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const left = useSecondsLeft(session?.deadline);
  useEffect(() => {
    if (session && ready && !result && left <= 0) submit();
  }, [left, session, ready, result]);

  if (!session) {
    return (
      <form className="card stack exam-start" onSubmit={start}>
        <p className="eyebrow">Экзамен</p>
        <h2>60 минут на специализацию и грейд</h2>
        <p className="muted">30 минут теория — 60 вопросов. 30 минут практика — 3 задачи на Python 3.12. Вопросы берутся с грейда ниже, своего и грейда выше. Два кандидата получают разные вопросы одних и тех же тем.</p>
        {blocked && <p className="banner">{blocked}</p>}
        {error && <p className="banner">{error}</p>}
        <label className="field"><span>Специализация</span>
          <select value={spec} onChange={(e) => setSpec(e.target.value)}>
            {specs.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Заявленный грейд</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map(([code, title]) => <option key={code} value={code}>{title}</option>)}
          </select>
        </label>
        <ul className="explain">
          <li>70% вопросов своего грейда, 20% ниже, 10% выше</li>
          <li>каждый десятый вопрос — софт-скилл</li>
          <li>практика: разминка, целевая задача и задача выше грейда</li>
        </ul>
        <button className="btn-red" type="submit" disabled={Boolean(blocked)}>Начать экзамен</button>
      </form>
    );
  }

  const theory = session.items.filter((item) => item.section === "theory");
  const practice = session.items.filter((item) => item.section === "practice");
  const item = session.items[step];
  const theoryLeft = Math.max(0, left - 30 * 60);
  const practiceLeft = Math.min(left, 30 * 60);
  const verdict = new Map((result?.review || []).map((row: any) => [row.id, row]));
  const specTitle = specs.find((row) => row.code === session.specialization_code)?.title || session.specialization_code;

  function theoryTone(question: ExamItem) {
    if (result) return verdict.get(question.id)?.correct ? "ok" : "bad";
    if (question.kind === "multi") return (multi[question.id] || []).length ? "answered" : "";
    return choices[question.id] ? "answered" : "";
  }

  function practiceTone(question: ExamItem) {
    if (result) return verdict.get(question.id)?.correct ? "ok" : "bad";
    const source = (sources[question.id] ?? "").trim();
    const starter = (question.starter || "").trim();
    return source && source !== starter ? "answered" : "";
  }

  function toggleMulti(id: number, optionId: string) {
    const current = multi[id] || [];
    const next = current.includes(optionId) ? current.filter((itemId) => itemId !== optionId) : [...current, optionId];
    setMulti({ ...multi, [id]: next });
  }

  async function runCode() {
    setRunning(true);
    setError("");
    try {
      const report = await api(`/assessments/sessions/${session.id}/run`, "POST", {
        item_id: item.id,
        source: sources[item.id] || "",
        language: "python3.12",
      });
      setRuns({ ...runs, [item.id]: report });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRunning(false);
    }
  }

  const run = runs[item.id];
  const visibleCases = run?.cases?.length
    ? run.cases
    : (item.public_tests || []).map((test) => ({ ...test, got: null, passed: null, error: null }));
  const selectedMulti = new Set(multi[item.id] || []);
  const correctIds = new Set(item.answer || []);

  return (
    <div className="exam-shell">
      <aside className="exam-side card stack">
        <div>
          <p className="eyebrow">{specTitle}</p>
          <h2>{session.claimed_grade_title}</h2>
        </div>
        <div className={left <= 5 * 60 && !result ? "timer-digits warn" : "timer-digits"}>{result ? "Сдано" : formatClock(left)}</div>
        <div className="timer-split">
          <span>Теория {formatClock(theoryLeft)}</span>
          <span>Практика {formatClock(practiceLeft)}</span>
        </div>
        <div>
          <p className="small muted">Теория · {theory.filter((question) => theoryTone(question)).length} из {theory.length}</p>
          <div className="q-map">
            {theory.map((question) => (
              <button
                key={question.id}
                type="button"
                className={`q-num ${theoryTone(question)} ${question.id === item.id ? "current" : ""}`}
                onClick={() => setStep(session.items.indexOf(question))}
              >
                {question.position}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="small muted">Практика</p>
          <div className="stack">
            {practice.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={`task-link ${practiceTone(question)} ${question.id === item.id ? "current" : ""}`}
                onClick={() => setStep(session.items.indexOf(question))}
              >
                <b>{index + 1}</b>
                <span>{question.title}</span>
              </button>
            ))}
          </div>
        </div>
        {!result && <button className="btn-red" type="button" onClick={() => setConfirmOpen(true)}>Сдать экзамен</button>}
      </aside>
      <div className="stack">
        {result && (
          <section className="card stack">
            <p className="eyebrow">Результат</p>
            <div className="exam-score">
              <div><span className="bib">{Math.round(result.score)}</span><p className="muted">итог</p></div>
              <div><b>{Math.round(result.theory_score)}</b><p className="muted">теория</p></div>
              <div><b>{Math.round(result.practice_score)}</b><p className="muted">практика</p></div>
            </div>
            <p>{result.outcome === "fail" ? "Заявленный грейд не подтверждён." : "Результат записан."}</p>
            {result.policy?.can_confirm_pending && <p className="ok">Балл высокий. Можно оставить этот грейд или попробовать выше.</p>}
            {result.policy?.cooldown_active && <p className="muted">{gradeChangeMessage(result.policy.grade_change_allowed_at)}</p>}
            <div className="actions">
              {result.policy?.can_confirm_pending && <button className="btn" onClick={async () => {
                const confirmed = await api("/me/grade/confirm", "POST");
                setResult({ ...result, policy: confirmed.policy || { ...result.policy, can_confirm_pending: false, cooldown_active: true } });
              }}>Оставить этот грейд</button>}
              <Link className="btn-red" to="/c">К категории</Link>
            </div>
          </section>
        )}
        <section className="card stack">
          <div className="exam-head">
            <p className="eyebrow">
              {item.section === "theory"
                ? `Вопрос ${theory.indexOf(item) + 1} из ${theory.length}`
                : item.role_title}
              {item.grade_title ? ` · ${item.grade_title}` : ""}
              {item.soft ? " · софт" : ""}
            </p>
            <div className="actions">
              <button className="btn-ghost" type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Назад</button>
              <button className="btn-ghost" type="button" disabled={step === session.items.length - 1} onClick={() => setStep(step + 1)}>Дальше</button>
            </div>
          </div>
          <h2>{item.section === "practice" ? item.title : item.skill_title}</h2>
          <p>{item.prompt}</p>
          {item.topic && <p className="muted">{item.topic}</p>}
          {error && <p className="banner">{error}</p>}
          {item.kind !== "code" && item.code && <pre className="code">{item.code}</pre>}
          {item.kind === "single" && (
            <div className="stack">
              {item.options?.map((option) => {
                const picked = choices[item.id] === option.id;
                const show = Boolean(result);
                const right = show && correctIds.has(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`choice ${picked ? "on" : ""} ${right ? "right" : ""}`}
                    disabled={Boolean(result)}
                    onClick={() => setChoices({ ...choices, [item.id]: option.id })}
                  >
                    <b>{option.id}</b><span>{option.text}</span>
                  </button>
                );
              })}
            </div>
          )}
          {item.kind === "multi" && (
            <div className="stack">
              <p className="muted">Несколько верных ответов. Лишняя отметка обнуляет вопрос.</p>
              {item.options?.map((option) => {
                const picked = selectedMulti.has(option.id);
                const show = Boolean(result);
                const right = show && correctIds.has(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`choice ${picked ? "on" : ""} ${right ? "right" : ""}`}
                    disabled={Boolean(result)}
                    onClick={() => toggleMulti(item.id, option.id)}
                  >
                    <b>{picked ? "✓" : option.id}</b><span>{option.text}</span>
                  </button>
                );
              })}
            </div>
          )}
          {item.kind === "code" && (
            <>
              <p className="muted">{item.signature}</p>
              {item.complexity_hint && <p className="muted">{item.complexity_hint}</p>}
              <CodePad
                value={sources[item.id] ?? item.starter ?? ""}
                onChange={(next) => setSources({ ...sources, [item.id]: next })}
                readOnly={Boolean(result)}
                running={running}
                onRun={runCode}
              />
              {run?.syntax && <p className="banner">Строка {run.syntax.line}: {run.syntax.message}</p>}
              <table className="cases">
                <thead>
                  <tr><th>#</th><th>Вход</th><th>Ожидание</th><th>Факт</th></tr>
                </thead>
                <tbody>
                  {visibleCases.map((test: any, index: number) => (
                    <tr key={index} className={test.passed === true ? "pass" : test.passed === false ? "fail" : ""}>
                      <td>{index + 1}</td>
                      <td><code>{JSON.stringify(test.args)}</code></td>
                      <td><code>{JSON.stringify(test.expected)}</code></td>
                      <td>{test.error || (test.got === null || test.got === undefined ? "—" : String(test.got))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Ещё {item.hidden_count ?? 15} скрытых тестов. Они проверяются только при сдаче экзамена.</p>
            </>
          )}
          {result && item.explanation && <p className="ok">{item.explanation}</p>}
        </section>
      </div>
      {confirmOpen && !result && (
        <div className="confirm-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="card stack confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h2>Сдать экзамен?</h2>
            <p>После сдачи ответы изменить нельзя. Пустые вопросы и задачи зачтутся как нерешённые.</p>
            <div className="actions">
              <button className="btn-ghost" type="button" onClick={() => setConfirmOpen(false)}>Вернуться</button>
              <button className="btn-red" type="button" onClick={() => { setConfirmOpen(false); submit(); }}>Сдать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
