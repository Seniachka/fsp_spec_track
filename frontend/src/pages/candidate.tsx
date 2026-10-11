import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, range } from "../api";
import { CodePad } from "../CodePad";

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
  const [runs, setRuns] = useState<Record<number, any>>({});
  const [running, setRunning] = useState(false);
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
  const verdict = new Map((result?.review || []).map((row: any) => [row.id, row.correct]));
  const run = runs[item.id];
  const visibleCases = (run?.cases?.length ? run.cases : (item.public_tests || []).map((test: any) => ({ ...test, got: null, passed: null, error: null })));

  function tone(question: any) {
    if (result) return verdict.get(question.id) ? "ok" : "bad";
    if (question.kind === "mcq") return choices[question.id] ? "answered" : "";
    const source = (sources[question.id] ?? "").trim();
    const starter = (question.starter || "").trim();
    return source && source !== starter ? "answered" : "";
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

  return (
    <div className="stack">
      <div className="exam-nav">
        {session.items.map((question: any, index: number) => (
          <button
            key={question.id}
            type="button"
            className={`q-num ${tone(question)} ${index === step ? "current" : ""}`}
            onClick={() => setStep(index)}
          >
            {index + 1}
          </button>
        ))}
        {!result && <button className="btn-red" type="button" onClick={submit} style={{ marginLeft: "auto" }}>Сдать тест</button>}
      </div>
      {result && (
        <section className="card stack">
          <p className="eyebrow">Результат</p>
          <div className="bib">{Math.round(result.score)}</div>
          <p>{result.outcome === "fail" ? "Заявленный грейд не подтверждён. Сам он не понижен." : "Результат записан."}</p>
          <p className="muted">Зелёный номер — задание зачтено, красный — нет. Можно открыть любое.</p>
          <div className="actions">
            {result.policy?.can_confirm_pending && <button className="btn" onClick={confirm}>Оставить этот грейд</button>}
            {result.policy?.can_start_up && <button className="btn-ghost" onClick={() => { setResult(null); setSession(null); setPurpose("up"); setGrade("senior"); }}>Попробовать грейд выше</button>}
            {result.policy?.can_start_down && <button className="btn-ghost" onClick={() => { setResult(null); setSession(null); setPurpose("down"); setGrade("junior"); }}>Сдать тест на уровень ниже</button>}
            {result.policy?.can_accept_intern && <button className="btn-ghost" onClick={intern}>Принять полку «Стажёр»</button>}
            {me?.grade && <Link className="btn-red" to="/c">К категории</Link>}
          </div>
        </section>
      )}
      <section className="card stack">
        <p className="eyebrow">Задание {step + 1} из {session.items.length} · {item.topic}</p>
        <h2>{item.prompt}</h2>
        {error && <p className="banner">{error}</p>}
        {item.kind === "mcq" ? (
          <div className="stack">
            {item.options.map((option: any) => (
              <button type="button" key={option.id} className={choices[item.id] === option.id ? "choice on" : "choice"} disabled={Boolean(result)} onClick={() => setChoices({ ...choices, [item.id]: option.id })}>
                <b>{option.id}</b><span>{option.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="muted">{item.signature}</p>
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
            <p className="muted">Ещё {item.hidden_count ?? 15} скрытых тестов. Их нет на экране, прогон по ним идёт только когда сдаёте весь тест.</p>
          </>
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
