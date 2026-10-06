import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { indentWithTab } from "@codemirror/commands";
import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import { api } from "./api";

const LANGUAGES = [
  { code: "python3.12", title: "Python 3.12", enabled: true },
  { code: "javascript", title: "JavaScript", enabled: false },
  { code: "go", title: "Go", enabled: false },
  { code: "java", title: "Java", enabled: false },
];

const theme = EditorView.theme({
  "&": {
    backgroundColor: "#fffdf8",
    color: "#1b1714",
    fontSize: "14px",
  },
  ".cm-content": {
    fontFamily: "ui-monospace, Consolas, monospace",
    minHeight: "240px",
  },
  ".cm-gutters": {
    backgroundColor: "#f6efe6",
    color: "#8a8178",
    borderRight: "1px solid #ddcfc0",
  },
  ".cm-activeLine": { backgroundColor: "#fff4ea" },
  ".cm-activeLineGutter": { backgroundColor: "#f3e6d8" },
  "&.cm-focused": { outline: "2px solid #1b1714", outlineOffset: "-2px" },
});

type Syntax = { line: number; column: number; message: string };

export function CodePad({
  value,
  onChange,
  readOnly,
  onRun,
  running,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onRun: () => void;
  running: boolean;
}) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const diagnostics = useRef<Syntax[]>([]);

  const lintExtension = useMemo(
    () =>
      linter((view) => {
        const found: Diagnostic[] = [];
        for (const item of diagnostics.current) {
          const line = view.state.doc.line(Math.min(item.line || 1, view.state.doc.lines));
          const column = Math.max(0, (item.column || 1) - 1);
          const from = Math.min(line.from + column, line.to);
          found.push({
            from,
            to: Math.max(from + 1, line.to),
            severity: "error",
            message: item.message,
          });
        }
        return found;
      }),
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const report = await api<{ diagnostics: Syntax[] }>("/assessments/code/lint", "POST", { source: value });
        diagnostics.current = report.diagnostics || [];
      } catch {
        diagnostics.current = [];
      }
      if (editor.current?.view) forceLinting(editor.current.view);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [value]);

  async function format() {
    const report = await api<{ source: string; syntax: Syntax | null }>("/assessments/code/format", "POST", { source: value });
    if (report.syntax) {
      diagnostics.current = [report.syntax];
      if (editor.current?.view) forceLinting(editor.current.view);
      return;
    }
    onChange(report.source);
  }

  return (
    <div className="stack">
      <div className="actions">
        <label className="field" style={{ minWidth: 220 }}>
          <span>Язык</span>
          <select value="python3.12" onChange={() => undefined}>
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code} disabled={!language.enabled}>
                {language.enabled ? language.title : `${language.title} — скоро`}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-ghost" type="button" onClick={format} disabled={readOnly}>Форматировать</button>
        <button className="btn" type="button" onClick={onRun} disabled={readOnly || running}>{running ? "Запуск…" : "Запустить"}</button>
      </div>
      <CodeMirror
        ref={editor}
        value={value}
        height="280px"
        theme="light"
        editable={!readOnly}
        extensions={[python(), keymap.of([indentWithTab]), lintExtension, theme]}
        basicSetup={{ tabSize: 4, indentOnInput: true }}
        onChange={onChange}
      />
      <p className="muted">Tab сдвигает строку. Подсветка и ошибки синтаксиса считает Python 3.12.</p>
    </div>
  );
}
