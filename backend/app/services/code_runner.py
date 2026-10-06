"""Демонстрационный прогон решения. Не граница продакшен-изоляции."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BANNED_PYTHON = ("import", "exec", "eval", "open", "__", "os.", "sys.", "subprocess", "socket")
BANNED_JS = ("require", "process", "import", "fs", "child_process", "Function")

PYTHON_HARNESS = """
import json, sys
source = open("user_solution.py", encoding="utf-8").read()
ns = {}
try:
    exec(compile(source, "user_solution.py", "exec"), ns, ns)
except Exception:
    print("[]")
    raise SystemExit(0)
solve = ns.get("solve")
tests = json.load(open("tests.json", encoding="utf-8"))
results = []
if not callable(solve):
    print("[]")
    raise SystemExit(0)
for test in tests:
    try:
        got = solve(*test["args"])
        results.append(got == test["expected"])
    except Exception:
        results.append(False)
print(json.dumps(results))
"""

JS_HARNESS = """
const fs = require('fs');
const tests = JSON.parse(fs.readFileSync('tests.json', 'utf8'));
const source = fs.readFileSync('user_solution.js', 'utf8');
let solve;
try {
  solve = eval(source + '\\n; solve');
} catch (e) {
  console.log('[]');
  process.exit(0);
}
const results = [];
if (typeof solve !== 'function') {
  console.log('[]');
  process.exit(0);
}
for (const test of tests) {
  try {
    const got = solve(...test.args);
    results.push(JSON.stringify(got) === JSON.stringify(test.expected));
  } catch (e) {
    results.push(false);
  }
}
console.log(JSON.stringify(results));
"""


def _banned(source: str, language: str) -> bool:
    lowered = source.lower()
    words = BANNED_PYTHON if language == "python" else BANNED_JS
    return any(word.lower() in lowered for word in words)


def run_hidden_tests(source: str, language: str, tests: list[dict]) -> list[bool]:
    if not source or not source.strip() or _banned(source, language):
        return [False] * len(tests)
    runner = shutil.which("node") if language == "javascript" else sys.executable
    if runner is None:
        return [False] * len(tests)
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / "tests.json").write_text(json.dumps(tests), encoding="utf-8")
        if language == "javascript":
            (root / "user_solution.js").write_text(source, encoding="utf-8")
            (root / "harness.js").write_text(JS_HARNESS, encoding="utf-8")
            cmd = [runner, "harness.js"]
        else:
            (root / "user_solution.py").write_text(source, encoding="utf-8")
            (root / "harness.py").write_text(PYTHON_HARNESS, encoding="utf-8")
            cmd = [runner, "-I", "harness.py"]
        try:
            completed = subprocess.run(
                cmd,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return [False] * len(tests)
        try:
            parsed = json.loads(completed.stdout.strip().splitlines()[-1])
        except (json.JSONDecodeError, IndexError):
            return [False] * len(tests)
        if not isinstance(parsed, list) or len(parsed) != len(tests):
            return [False] * len(tests)
        return [bool(item) for item in parsed]
