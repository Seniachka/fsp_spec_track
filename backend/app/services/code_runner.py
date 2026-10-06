"""Прогон решения на Python 3.12. Это учебная песочница, не продакшен-изоляция."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import black

BANNED = ("import", "exec", "eval", "open", "__", "os.", "sys.", "subprocess", "socket")
RUNNER_ROOT = Path(__file__).resolve().parents[2] / ".python-3.12" / "python.exe"

HARNESS = r"""
import json, sys
source = open("user_solution.py", encoding="utf-8").read()
tests = json.load(open("tests.json", encoding="utf-8"))
try:
    compiled = compile(source, "user_solution.py", "exec")
except SyntaxError as exc:
    print(json.dumps({
        "syntax": {"line": exc.lineno or 1, "column": exc.offset or 1, "message": exc.msg},
        "cases": [],
    }))
    raise SystemExit(0)
namespace = {}
try:
    exec(compiled, namespace, namespace)
except Exception as exc:
    print(json.dumps({
        "syntax": {"line": 1, "column": 1, "message": str(exc)},
        "cases": [],
    }))
    raise SystemExit(0)
solve = namespace.get("solve")
cases = []
for test in tests:
    if not callable(solve):
        cases.append({"passed": False, "got": None, "error": "нет функции solve"})
        continue
    try:
        got = solve(*test["args"])
        cases.append({"passed": got == test["expected"], "got": got, "error": None})
    except Exception as exc:
        cases.append({"passed": False, "got": None, "error": type(exc).__name__ + ": " + str(exc)})
print(json.dumps({"syntax": None, "cases": cases}, default=str))
"""


def python312_executable() -> str | None:
    candidates = [os.environ.get("PYTHON312") or "", str(RUNNER_ROOT)]
    for name in ("python3.12", "python3", "python"):
        found = shutil.which(name)
        if found:
            candidates.append(found)
    for path in candidates:
        if not path or not Path(path).exists():
            continue
        try:
            probe = subprocess.run(
                [path, "-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if probe.stdout.strip() == "3.12":
            return path
    return None


def _banned(source: str) -> bool:
    lowered = source.lower()
    return any(word in lowered for word in BANNED)


def _missing() -> dict:
    return {
        "syntax": {"line": 1, "column": 1, "message": "Раннер Python 3.12 не найден"},
        "cases": [],
    }


def execute_python(source: str, tests: list[dict]) -> dict:
    if not source or not source.strip():
        return {"syntax": None, "cases": [{"passed": False, "got": None, "error": "пустой ответ"} for _ in tests]}
    if _banned(source):
        return {
            "syntax": {"line": 1, "column": 1, "message": "В решении нельзя использовать import, файлы и служебные имена"},
            "cases": [],
        }
    executable = python312_executable()
    if executable is None:
        return _missing()
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / "user_solution.py").write_text(source, encoding="utf-8")
        (root / "tests.json").write_text(json.dumps(tests), encoding="utf-8")
        (root / "harness.py").write_text(HARNESS, encoding="utf-8")
        try:
            completed = subprocess.run(
                [executable, "-I", "harness.py"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "syntax": None,
                "cases": [{"passed": False, "got": None, "error": "превышено время"} for _ in tests],
            }
    raw = (completed.stdout or "").strip().splitlines()
    if not raw:
        return {"syntax": {"line": 1, "column": 1, "message": "Раннер не вернул результат"}, "cases": []}
    try:
        payload = json.loads(raw[-1])
    except json.JSONDecodeError:
        return {"syntax": {"line": 1, "column": 1, "message": "Раннер вернул неразборчивый ответ"}, "cases": []}
    return {"syntax": payload.get("syntax"), "cases": payload.get("cases") or []}


def run_hidden_tests(source: str, language: str, tests: list[dict]) -> list[bool]:
    if language not in {"python", "python3.12"}:
        return [False] * len(tests)
    report = execute_python(source, tests)
    if report["syntax"] or len(report["cases"]) != len(tests):
        return [False] * len(tests)
    return [bool(case.get("passed")) for case in report["cases"]]


def lint_python(source: str) -> list[dict]:
    report = execute_python(source or "\n", [])
    if report["syntax"]:
        return [report["syntax"]]
    return []


def format_python(source: str) -> dict:
    syntax = lint_python(source)
    if syntax:
        return {"source": source, "syntax": syntax[0]}
    try:
        formatted = black.format_str(source, mode=black.Mode(line_length=88))
    except black.InvalidInput as exc:
        return {"source": source, "syntax": {"line": 1, "column": 1, "message": str(exc)}}
    return {"source": formatted, "syntax": None}
