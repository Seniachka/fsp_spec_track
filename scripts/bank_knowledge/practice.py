"""Практические задачи. Каждая: эталонное решение solve(*args) и генератор аргументов gen(rng).

Тесты строятся из эталона, поэтому решение обязано быть верным. Аргументы и ответы —
только JSON-типы: int, str, bool, list.
"""

from __future__ import annotations

import bisect
import heapq
from collections import Counter, defaultdict, deque

TASKS: list[dict] = []


def task(code, grade, difficulty, title, topic, statement, signature, solve, gen, samples=(), domains=(), hint=None, starter=None):
    TASKS.append(
        {
            "code": code,
            "grade": grade,
            "difficulty": difficulty,
            "title": title,
            "topic": topic,
            "statement": statement,
            "signature": signature,
            "solve": solve,
            "gen": gen,
            "samples": list(samples),
            "domains": list(domains),
            "hint": hint,
            "starter": starter or (signature.split("->")[0].strip() + ":\n    pass\n"),
        }
    )


def ints(rng, n, lo=-20, hi=50):
    return [rng.randint(lo, hi) for _ in range(n)]


def word(rng, n, alphabet="abcdefg"):
    return "".join(rng.choice(alphabet) for _ in range(n))


# ---------------------------------------------------------------- стажёр

task(
    "sum-even", "intern", 1.2, "Сумма чётных", "Циклы и условия",
    "Верните сумму всех чётных чисел списка. Для пустого списка — 0.",
    "def solve(nums: list[int]) -> int",
    lambda nums: sum(x for x in nums if x % 2 == 0),
    lambda rng: [ints(rng, rng.randint(0, 12))],
    samples=[[[1, 2, 3, 4]], [[]]],
)

task(
    "count-vowels", "intern", 1.3, "Гласные в строке", "Строки",
    "Посчитайте количество гласных букв в строке. Гласные: a e i o u а е ё и о у ы э ю я, регистр не важен.",
    "def solve(text: str) -> int",
    lambda text: sum(1 for ch in text.lower() if ch in "aeiouаеёиоуыэюя"),
    lambda rng: [word(rng, rng.randint(0, 20), "abcdeiouАяПрОстЫй ")],
    samples=[["Привет, мир"], ["xyz"]],
)

task(
    "max-min-diff", "intern", 1.3, "Размах выборки", "Списки",
    "Верните разницу между максимальным и минимальным элементом. Для пустого списка верните 0.",
    "def solve(nums: list[int]) -> int",
    lambda nums: (max(nums) - min(nums)) if nums else 0,
    lambda rng: [ints(rng, rng.randint(0, 10), -100, 100)],
    samples=[[[3, 9, -2, 7]], [[5]]],
    domains=["data"],
)

task(
    "reverse-words", "intern", 1.4, "Слова наоборот", "Строки",
    "Переставьте слова строки в обратном порядке. Слова разделены одним пробелом, лишних пробелов нет.",
    "def solve(text: str) -> str",
    lambda text: " ".join(reversed(text.split(" "))) if text else "",
    lambda rng: [" ".join(word(rng, rng.randint(1, 5)) for _ in range(rng.randint(1, 6)))],
    samples=[["я учу python"]],
)


def _is_pal(text):
    cleaned = [ch for ch in text.lower() if ch.isalnum()]
    return cleaned == cleaned[::-1]


def _gen_pal(rng):
    if rng.random() < 0.5:
        half = word(rng, rng.randint(1, 4), "abc A")
        return [half + rng.choice(["", "x"]) + half[::-1]]
    return [word(rng, rng.randint(1, 7), "ab ,.")]


task(
    "palindrome", "intern", 1.5, "Палиндром", "Строки",
    "Верните True, если строка читается одинаково в обе стороны. Регистр, пробелы и знаки препинания не учитываются.",
    "def solve(text: str) -> bool",
    _is_pal,
    _gen_pal,
    samples=[["А роза упала на лапу Азора"], ["hello"]],
)

task(
    "divisible-count", "intern", 1.4, "Кратные числа", "Арифметика",
    "Сколько чисел от 1 до n включительно делятся на a или на b?",
    "def solve(n: int, a: int, b: int) -> int",
    lambda n, a, b: sum(1 for i in range(1, n + 1) if i % a == 0 or i % b == 0),
    lambda rng: [rng.randint(1, 200), rng.randint(2, 9), rng.randint(2, 9)],
    samples=[[10, 3, 5]],
    hint="Можно без цикла: n//a + n//b − n//lcm(a,b).",
)


def _second_largest(nums):
    uniq = sorted(set(nums), reverse=True)
    return uniq[1] if len(uniq) >= 2 else None


task(
    "second-largest", "intern", 1.6, "Второй по величине", "Списки",
    "Верните второе по величине уникальное значение списка. Если такого нет — None.",
    "def solve(nums: list[int]) -> int | None",
    _second_largest,
    lambda rng: [ints(rng, rng.randint(0, 8), 0, 9)],
    samples=[[[4, 1, 4, 3]], [[7, 7]]],
)


def _top_char(text):
    counts = Counter(text)
    if not counts:
        return ""
    best = max(counts.values())
    return min(ch for ch, n in counts.items() if n == best)


task(
    "top-char", "intern", 1.7, "Самый частый символ", "Словари",
    "Верните самый частый символ строки. При равной частоте — наименьший по коду символа. Для пустой строки — пустая строка.",
    "def solve(text: str) -> str",
    _top_char,
    lambda rng: [word(rng, rng.randint(0, 15), "abcab")],
    samples=[["abracadabra"], ["zzyy"]],
)

# ---------------------------------------------------------------- junior


def _two_sum(nums, target):
    seen = set()
    for x in nums:
        if target - x in seen:
            return True
        seen.add(x)
    return False


task(
    "two-sum", "junior", 2.0, "Пара с заданной суммой", "Хеш-таблицы",
    "Верните True, если в списке найдутся два разных элемента (по позиции) с суммой target.",
    "def solve(nums: list[int], target: int) -> bool",
    _two_sum,
    lambda rng: [ints(rng, rng.randint(0, 12), -10, 20), rng.randint(-5, 25)],
    samples=[[[2, 7, 11, 15], 9], [[3, 3], 6], [[1], 2]],
    hint="Один проход с множеством увиденных чисел — O(n).",
)


def _anagram_groups(words):
    return len({"".join(sorted(w)) for w in words})


task(
    "anagram-groups", "junior", 2.2, "Группы анаграмм", "Хеш-таблицы",
    "Сколько групп анаграмм среди слов? Слова из одной группы состоят из одинаковых букв с одинаковыми повторами.",
    "def solve(words: list[str]) -> int",
    _anagram_groups,
    lambda rng: [[word(rng, rng.randint(1, 3), "abc") for _ in range(rng.randint(0, 9))]],
    samples=[[["eat", "tea", "tan", "ate", "nat", "bat"]]],
)


def _merge_sorted(a, b):
    i = j = 0
    out = []
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            out.append(a[i])
            i += 1
        else:
            out.append(b[j])
            j += 1
    return out + a[i:] + b[j:]


task(
    "merge-sorted", "junior", 2.0, "Слияние отсортированных списков", "Два указателя",
    "Слейте два отсортированных по возрастанию списка в один отсортированный. Встроенную сортировку не используйте — проверяется идея слияния за O(n+m).",
    "def solve(a: list[int], b: list[int]) -> list[int]",
    _merge_sorted,
    lambda rng: [sorted(ints(rng, rng.randint(0, 7), 0, 20)), sorted(ints(rng, rng.randint(0, 7), 0, 20))],
    samples=[[[1, 4, 9], [2, 3, 10]]],
)


def _brackets(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack


task(
    "brackets", "junior", 2.1, "Скобочная последовательность", "Стек",
    "Верните True, если скобки ( ) [ ] { } в строке расставлены корректно. Другие символы игнорируются.",
    "def solve(text: str) -> bool",
    _brackets,
    lambda rng: [word(rng, rng.randint(0, 10), "()[]{}a")],
    samples=[["([]{})"], ["(]"], ["(("]],
)


def _rle(text):
    out = []
    i = 0
    while i < len(text):
        j = i
        while j < len(text) and text[j] == text[i]:
            j += 1
        out.append(text[i] + (str(j - i) if j - i > 1 else ""))
        i = j
    return "".join(out)


task(
    "rle", "junior", 2.2, "Сжатие повторов (RLE)", "Строки",
    "Сожмите строку: подряд идущие одинаковые символы замените на символ и число повторов, если повторов больше одного. aaabcc → a3bc2.",
    "def solve(text: str) -> str",
    _rle,
    lambda rng: ["".join(ch * rng.randint(1, 4) for ch in word(rng, rng.randint(0, 6), "abcd"))],
    samples=[["aaabcc"], [""]],
)


def _unique_in_order(items):
    out = []
    for x in items:
        if not out or out[-1] != x:
            out.append(x)
    return out


task(
    "unique-in-order", "junior", 2.0, "Схлопнуть повторы", "Списки",
    "Удалите элементы, равные предыдущему. [1,1,2,2,1] → [1,2,1].",
    "def solve(items: list[int]) -> list[int]",
    _unique_in_order,
    lambda rng: [ints(rng, rng.randint(0, 12), 0, 3)],
    samples=[[[1, 1, 2, 2, 1]]],
)

task(
    "diagonal-sum", "junior", 2.0, "Сумма диагоналей", "Матрицы",
    "Дана квадратная матрица. Верните сумму элементов главной и побочной диагоналей. Центральный элемент при нечётном размере считается один раз.",
    "def solve(matrix: list[list[int]]) -> int",
    lambda m: sum(m[i][i] for i in range(len(m))) + sum(m[i][len(m) - 1 - i] for i in range(len(m)) if len(m) - 1 - i != i),
    lambda rng: [[ints(rng, n, -5, 9) for _ in range(n)] for n in [rng.randint(1, 5)]],
    samples=[[[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]],
)


def _log_levels(lines, level):
    count = 0
    for line in lines:
        parts = line.split(" ", 2)
        if len(parts) >= 2 and parts[1] == level:
            count += 1
    return count


task(
    "log-level-count", "junior", 2.1, "Подсчёт записей лога", "Разбор строк",
    "Строки лога имеют вид «<время> <УРОВЕНЬ> <сообщение>». Верните число строк с заданным уровнем. Сравнение уровня строгое, по регистру.",
    "def solve(lines: list[str], level: str) -> int",
    _log_levels,
    lambda rng: [[f"12:{rng.randint(10, 59)} {rng.choice(['INFO', 'WARN', 'ERROR', 'error'])} msg {rng.randint(1, 9)}" for _ in range(rng.randint(0, 10))], rng.choice(["ERROR", "WARN", "INFO"])],
    samples=[[["12:00 INFO start", "12:01 ERROR disk full", "12:02 ERROR retry"], "ERROR"]],
    domains=["devops", "qa"],
)


def _bsearch(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


task(
    "binary-search", "junior", 2.3, "Бинарный поиск", "Бинарный поиск",
    "В отсортированном списке без повторов найдите индекс target или верните -1. Ожидается O(log n).",
    "def solve(nums: list[int], target: int) -> int",
    _bsearch,
    lambda rng: [sorted(set(ints(rng, rng.randint(0, 12), 0, 40))), rng.randint(0, 40)],
    samples=[[[1, 3, 5, 7, 9], 7], [[1, 3], 2]],
)

task(
    "rotate", "junior", 2.1, "Циклический сдвиг", "Списки",
    "Сдвиньте список циклически вправо на k позиций. k может быть больше длины списка.",
    "def solve(nums: list[int], k: int) -> list[int]",
    lambda nums, k: (nums[-(k % len(nums)):] + nums[:-(k % len(nums))]) if nums and k % len(nums) else list(nums),
    lambda rng: [ints(rng, rng.randint(0, 7), 0, 9), rng.randint(0, 15)],
    samples=[[[1, 2, 3, 4, 5], 2]],
)


def _roman(text):
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for i, ch in enumerate(text):
        if i + 1 < len(text) and values[ch] < values[text[i + 1]]:
            total -= values[ch]
        else:
            total += values[ch]
    return total


def _to_roman(n):
    table = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for value, sym in table:
        while n >= value:
            out += sym
            n -= value
    return out


task(
    "roman", "junior", 2.4, "Римские числа", "Строки",
    "Переведите римское число (1–3999) в целое. Правило вычитания: IV = 4, IX = 9, XL = 40 и так далее.",
    "def solve(text: str) -> int",
    _roman,
    lambda rng: [_to_roman(rng.randint(1, 3999))],
    samples=[["XIV"], ["MCMXCIV"]],
)

# ---------------------------------------------------------------- middle


def _longest_unique(text):
    last = {}
    start = best = 0
    for i, ch in enumerate(text):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    return best


task(
    "longest-unique", "middle", 2.8, "Подстрока без повторов", "Скользящее окно",
    "Верните длину самой длинной подстроки без повторяющихся символов.",
    "def solve(text: str) -> int",
    _longest_unique,
    lambda rng: [word(rng, rng.randint(0, 16), "abcde")],
    samples=[["abcabcbb"], ["bbbb"], [""]],
    hint="Скользящее окно и позиция последнего вхождения символа.",
)


def _top_k(nums, k):
    counts = Counter(nums)
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [value for value, _ in ordered[:k]]


task(
    "top-k", "middle", 2.9, "k самых частых", "Хеш-таблицы и сортировка",
    "Верните k самых частых значений списка по убыванию частоты. При равной частоте — по возрастанию значения.",
    "def solve(nums: list[int], k: int) -> list[int]",
    _top_k,
    lambda rng: [ints(rng, rng.randint(1, 15), 0, 5), rng.randint(1, 4)],
    samples=[[[1, 1, 1, 2, 2, 3], 2]],
    domains=["data"],
)


def _merge_intervals(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out


task(
    "merge-intervals", "middle", 3.0, "Слияние интервалов", "Сортировка и интервалы",
    "Дан список интервалов [начало, конец]. Объедините пересекающиеся и касающиеся интервалы, верните отсортированный результат.",
    "def solve(intervals: list[list[int]]) -> list[list[int]]",
    _merge_intervals,
    lambda rng: [[sorted([rng.randint(0, 20), rng.randint(0, 20)]) for _ in range(rng.randint(0, 7))]],
    samples=[[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[[1, 4], [4, 5]]]],
)


def _range_sums(nums, queries):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    return [prefix[r + 1] - prefix[l] for l, r in queries]


task(
    "range-sums", "middle", 2.9, "Суммы на отрезках", "Префиксные суммы",
    "Для каждого запроса [l, r] (включительно, индексы с нуля) верните сумму элементов на отрезке. Запросов много — нужен ответ за O(1) на запрос после подготовки.",
    "def solve(nums: list[int], queries: list[list[int]]) -> list[int]",
    _range_sums,
    lambda rng: [ints(rng, n := rng.randint(1, 10), -5, 9), [sorted([rng.randint(0, n - 1), rng.randint(0, n - 1)]) for _ in range(rng.randint(1, 5))]],
    samples=[[[1, 2, 3, 4, 5], [[0, 2], [1, 3]]]],
    domains=["data"],
)


def _first_missing(nums):
    present = set(nums)
    i = 1
    while i in present:
        i += 1
    return i


task(
    "first-missing", "middle", 3.0, "Первое пропущенное положительное", "Множества",
    "Верните наименьшее положительное целое, которого нет в списке.",
    "def solve(nums: list[int]) -> int",
    _first_missing,
    lambda rng: [ints(rng, rng.randint(0, 10), -3, 8)],
    samples=[[[3, 4, -1, 1]], [[1, 2, 0]]],
)


def _lru_hits(capacity, requests):
    order = []
    hits = 0
    for key in requests:
        if key in order:
            hits += 1
            order.remove(key)
            order.append(key)
        else:
            if len(order) == capacity:
                order.pop(0)
            order.append(key)
    return hits


task(
    "lru-hits", "middle", 3.1, "Попадания в LRU-кеш", "Симуляция структур данных",
    "Кеш вмещает capacity ключей и вытесняет давно не использованный. Для последовательности запросов верните число попаданий (ключ уже был в кеше). Попадание тоже обновляет свежесть ключа.",
    "def solve(capacity: int, requests: list[int]) -> int",
    _lru_hits,
    lambda rng: [rng.randint(1, 4), ints(rng, rng.randint(0, 14), 1, 6)],
    samples=[[2, [1, 2, 1, 3, 2, 1]]],
    domains=["backend"],
)


def _rate_limit(limit, window, timestamps):
    rejected = 0
    accepted = deque()
    for t in timestamps:
        while accepted and accepted[0] <= t - window:
            accepted.popleft()
        if len(accepted) < limit:
            accepted.append(t)
        else:
            rejected += 1
    return rejected


task(
    "rate-limiter", "middle", 3.2, "Лимит запросов в окне", "Очередь и скользящее окно",
    "Разрешено не более limit запросов за любые window секунд (окно полуоткрытое: запрос в момент t учитывает принятые с t−window не включительно по t). Отклонённые запросы в окно не попадают. Метки времени неубывающие. Верните число отклонённых запросов.",
    "def solve(limit: int, window: int, timestamps: list[int]) -> int",
    _rate_limit,
    lambda rng: [rng.randint(1, 3), rng.randint(2, 6), sorted(ints(rng, rng.randint(0, 14), 0, 20))],
    samples=[[2, 5, [1, 2, 3, 6, 7, 8]]],
    domains=["backend", "devops"],
)


def _dedupe(events):
    seen = set()
    kept = []
    for event_id, payload in events:
        if event_id in seen:
            continue
        seen.add(event_id)
        kept.append(payload)
    return kept


task(
    "dedupe-events", "middle", 2.8, "Идемпотентная обработка событий", "Хеш-таблицы",
    "Поток событий [id, payload] содержит повторы по id. Верните payload только первых вхождений каждого id в исходном порядке.",
    "def solve(events: list[list]) -> list[str]",
    _dedupe,
    lambda rng: [[[rng.randint(1, 5), word(rng, 2)] for _ in range(rng.randint(0, 10))]],
    samples=[[[[1, "a"], [2, "b"], [1, "c"]]]],
    domains=["backend", "data"],
)


def _grid_path(grid):
    if not grid or grid[0][0] == 1:
        return -1
    rows, cols = len(grid), len(grid[0])
    if grid[rows - 1][cols - 1] == 1:
        return -1
    queue = deque([(0, 0, 0)])
    seen = {(0, 0)}
    while queue:
        r, c, d = queue.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return d
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0 and (nr, nc) not in seen:
                seen.add((nr, nc))
                queue.append((nr, nc, d + 1))
    return -1


task(
    "grid-path", "middle", 3.3, "Кратчайший путь в сетке", "BFS",
    "Сетка из 0 (проход) и 1 (стена). Верните длину кратчайшего пути из левого верхнего угла в правый нижний по четырём направлениям, или -1, если пути нет. Длина — число шагов.",
    "def solve(grid: list[list[int]]) -> int",
    _grid_path,
    lambda rng: [[[1 if rng.random() < 0.25 else 0 for _ in range(c)] for _ in range(r)] for r, c in [(rng.randint(1, 5), rng.randint(1, 5))]],
    samples=[[[[0, 0, 1], [1, 0, 1], [1, 0, 0]]], [[[0, 1], [1, 0]]]],
)


def _kth_largest(nums, k):
    return heapq.nlargest(k, nums)[-1]


task(
    "kth-largest", "middle", 2.9, "k-й по величине", "Куча",
    "Верните k-й по величине элемент списка с учётом повторов (k ≤ длина списка).",
    "def solve(nums: list[int], k: int) -> int",
    _kth_largest,
    lambda rng: [ints(rng, n := rng.randint(1, 12), 0, 20), rng.randint(1, n)],
    samples=[[[3, 2, 1, 5, 6, 4], 2]],
)


def _product_except_self(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out


task(
    "product-except-self", "middle", 3.1, "Произведение без себя", "Префиксы",
    "Для каждого элемента верните произведение всех остальных. Без деления, за O(n).",
    "def solve(nums: list[int]) -> list[int]",
    _product_except_self,
    lambda rng: [ints(rng, rng.randint(1, 7), -3, 4)],
    samples=[[[1, 2, 3, 4]], [[0, 2]]],
)


def _join_count(left, right):
    counts = Counter(right)
    return sum(counts[key] for key in left)


task(
    "join-count", "middle", 2.8, "Размер результата JOIN", "Хеш-таблицы",
    "Даны ключи двух таблиц (с повторами). Сколько строк получится при INNER JOIN по равенству ключей?",
    "def solve(left: list[int], right: list[int]) -> int",
    _join_count,
    lambda rng: [ints(rng, rng.randint(0, 8), 1, 5), ints(rng, rng.randint(0, 8), 1, 5)],
    samples=[[[1, 2, 2], [2, 2, 3]]],
    domains=["data", "backend"],
)

# ---------------------------------------------------------------- senior


def _lis(nums):
    tails = []
    for x in nums:
        i = bisect.bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)


task(
    "lis", "senior", 3.8, "Наибольшая возрастающая подпоследовательность", "Динамическое программирование",
    "Верните длину самой длинной строго возрастающей подпоследовательности (элементы не обязаны идти подряд).",
    "def solve(nums: list[int]) -> int",
    _lis,
    lambda rng: [ints(rng, rng.randint(0, 14), 0, 15)],
    samples=[[[10, 9, 2, 5, 3, 7, 101, 18]]],
    hint="O(n log n) через массив минимальных хвостов.",
)


def _coin_change(coins, amount):
    best = [0] + [float("inf")] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return -1 if best[amount] == float("inf") else best[amount]


task(
    "coin-change", "senior", 3.9, "Размен минимальным числом монет", "Динамическое программирование",
    "Даны номиналы монет (неограниченный запас) и сумма. Верните минимальное число монет или -1, если набрать нельзя.",
    "def solve(coins: list[int], amount: int) -> int",
    _coin_change,
    lambda rng: [sorted(set(ints(rng, rng.randint(1, 4), 1, 9))), rng.randint(0, 40)],
    samples=[[[1, 2, 5], 11], [[2], 3]],
)


def _completable(n, deps):
    indegree = [0] * n
    graph = defaultdict(list)
    for a, b in deps:
        graph[b].append(a)
        indegree[a] += 1
    queue = deque(i for i in range(n) if indegree[i] == 0)
    done = 0
    while queue:
        node = queue.popleft()
        done += 1
        for nxt in graph[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return done


task(
    "task-order", "senior", 4.0, "Выполнимые задачи", "Топологическая сортировка",
    "Есть n задач (0..n−1) и зависимости [a, b]: задача a требует завершения b. Сколько задач можно выполнить? Задачи внутри циклов выполнить нельзя.",
    "def solve(n: int, deps: list[list[int]]) -> int",
    _completable,
    lambda rng: [n := rng.randint(1, 7), [[rng.randrange(n), rng.randrange(n)] for _ in range(rng.randint(0, 8))]],
    samples=[[3, [[1, 0], [2, 1]]], [2, [[0, 1], [1, 0]]]],
    domains=["devops", "backend"],
)


def _dijkstra(n, edges, src, dst):
    graph = defaultdict(list)
    for a, b, w in edges:
        graph[a].append((b, w))
        graph[b].append((a, w))
    dist = [float("inf")] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist[node]:
            continue
        for nxt, w in graph[node]:
            if d + w < dist[nxt]:
                dist[nxt] = d + w
                heapq.heappush(heap, (dist[nxt], nxt))
    return -1 if dist[dst] == float("inf") else dist[dst]


task(
    "shortest-path", "senior", 4.1, "Кратчайший путь во взвешенном графе", "Дейкстра",
    "Неориентированный граф на n вершинах, рёбра [a, b, вес ≥ 1]. Верните длину кратчайшего пути из src в dst или -1.",
    "def solve(n: int, edges: list[list[int]], src: int, dst: int) -> int",
    _dijkstra,
    lambda rng: [n := rng.randint(2, 7), [[rng.randrange(n), rng.randrange(n), rng.randint(1, 9)] for _ in range(rng.randint(1, 10))], 0, n - 1],
    samples=[[4, [[0, 1, 1], [1, 2, 2], [0, 2, 5], [2, 3, 1]], 0, 3]],
    domains=["devops"],
)


def _edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


task(
    "edit-distance", "senior", 4.0, "Расстояние Левенштейна", "Динамическое программирование",
    "Минимальное число вставок, удалений и замен символов, превращающих строку a в строку b.",
    "def solve(a: str, b: str) -> int",
    _edit_distance,
    lambda rng: [word(rng, rng.randint(0, 7), "abc"), word(rng, rng.randint(0, 7), "abc")],
    samples=[["kitten", "sitting"], ["", "abc"]],
    domains=["qa", "ml"],
)


def _rooms(meetings):
    events = []
    for s, e in meetings:
        events.append((s, 1))
        events.append((e, -1))
    events.sort(key=lambda ev: (ev[0], ev[1]))
    cur = best = 0
    for _, delta in events:
        cur += delta
        best = max(best, cur)
    return best


task(
    "meeting-rooms", "senior", 3.9, "Минимум переговорок", "Сканирующая прямая",
    "Встречи заданы как [начало, конец), конец не включается. Сколько переговорок нужно, чтобы все встречи прошли без пересечений?",
    "def solve(meetings: list[list[int]]) -> int",
    _rooms,
    lambda rng: [[[s, s + rng.randint(1, 6)] for s in ints(rng, rng.randint(0, 8), 0, 15)]],
    samples=[[[[0, 30], [5, 10], [15, 20]]], [[[7, 10], [2, 4]]]],
)


def _knapsack(weights, values, capacity):
    best = [0] * (capacity + 1)
    for w, v in zip(weights, values):
        for c in range(capacity, w - 1, -1):
            best[c] = max(best[c], best[c - w] + v)
    return best[capacity]


task(
    "knapsack", "senior", 4.2, "Рюкзак 0/1", "Динамическое программирование",
    "Предметы с весами и ценностями, каждый можно взять не более одного раза. Максимальная ценность при вместимости capacity.",
    "def solve(weights: list[int], values: list[int], capacity: int) -> int",
    _knapsack,
    lambda rng: [ints(rng, n := rng.randint(1, 6), 1, 8), ints(rng, n, 1, 20), rng.randint(0, 15)],
    samples=[[[1, 3, 4, 5], [1, 4, 5, 7], 7]],
)


def _window_max(nums, k):
    out = []
    dq = deque()
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out


task(
    "window-max", "senior", 4.0, "Максимум в скользящем окне", "Монотонная очередь",
    "Для каждого окна длины k верните максимум. Ожидается O(n).",
    "def solve(nums: list[int], k: int) -> list[int]",
    _window_max,
    lambda rng: [ints(rng, n := rng.randint(1, 12), -5, 15), rng.randint(1, n)],
    samples=[[[1, 3, -1, -3, 5, 3, 6, 7], 3]],
    domains=["data", "devops"],
)


def _islands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = [[False] * cols for _ in range(rows)]
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1 and not seen[r][c]:
                count += 1
                stack = [(r, c)]
                seen[r][c] = True
                while stack:
                    cr, cc = stack.pop()
                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and not seen[nr][nc]:
                            seen[nr][nc] = True
                            stack.append((nr, nc))
    return count


task(
    "islands", "senior", 3.8, "Число островов", "DFS",
    "Сетка из 0 и 1. Остров — компонента единиц, связанных по четырём направлениям. Верните число островов.",
    "def solve(grid: list[list[int]]) -> int",
    _islands,
    lambda rng: [[[1 if rng.random() < 0.45 else 0 for _ in range(c)] for _ in range(r)] for r, c in [(rng.randint(1, 6), rng.randint(1, 6))]],
    samples=[[[[1, 1, 0], [0, 0, 1], [1, 0, 1]]]],
)


def _word_break(text, words):
    words = set(words)
    ok = [True] + [False] * len(text)
    for i in range(1, len(text) + 1):
        ok[i] = any(ok[j] and text[j:i] in words for j in range(i))
    return ok[-1]


task(
    "word-break", "senior", 4.1, "Разбиение на слова", "Динамическое программирование",
    "Можно ли разбить строку на последовательность слов из словаря (слова можно использовать повторно)?",
    "def solve(text: str, words: list[str]) -> bool",
    _word_break,
    lambda rng: [word(rng, rng.randint(0, 9), "ab"), sorted({word(rng, rng.randint(1, 3), "ab") for _ in range(rng.randint(1, 4))})],
    samples=[["leetcode", ["leet", "code"]], ["aab", ["a", "b"]]],
)

# ---------------------------------------------------------------- lead


def _mst(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    used = 0
    for a, b, w in sorted(edges, key=lambda e: e[2]):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            total += w
            used += 1
    return total if used == n - 1 else -1


task(
    "mst", "lead", 4.5, "Минимальная сеть", "Остовное дерево, DSU",
    "n дата-центров и возможные каналы [a, b, стоимость]. Минимальная стоимость связать все центры, или -1, если связать нельзя.",
    "def solve(n: int, edges: list[list[int]]) -> int",
    _mst,
    lambda rng: [n := rng.randint(1, 7), [[rng.randrange(n), rng.randrange(n), rng.randint(1, 9)] for _ in range(rng.randint(0, 12))]],
    samples=[[4, [[0, 1, 1], [1, 2, 2], [2, 3, 3], [0, 3, 10]]]],
    domains=["devops"],
)


def _critical_path(durations, deps):
    n = len(durations)
    graph = defaultdict(list)
    indegree = [0] * n
    for a, b in deps:
        graph[b].append(a)
        indegree[a] += 1
    finish = [0] * n
    queue = deque(i for i in range(n) if indegree[i] == 0)
    for i in queue:
        finish[i] = durations[i]
    processed = 0
    while queue:
        node = queue.popleft()
        processed += 1
        for nxt in graph[node]:
            finish[nxt] = max(finish[nxt], finish[node] + durations[nxt])
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return -1 if processed != n else max(finish) if n else 0


task(
    "critical-path", "lead", 4.6, "Критический путь проекта", "Динамика на DAG",
    "Задачи с длительностями и зависимости [a, b]: a начинается после завершения b. При неограниченном параллелизме верните минимальное время всего проекта, или -1 при цикле.",
    "def solve(durations: list[int], deps: list[list[int]]) -> int",
    _critical_path,
    lambda rng: [ints(rng, n := rng.randint(1, 7), 1, 9), [[rng.randrange(n), rng.randrange(n)] for _ in range(rng.randint(0, 7))]],
    samples=[[[3, 2, 4], [[1, 0], [2, 0]]]],
)


def _job_profit(deadlines, profits):
    jobs = sorted(zip(deadlines, profits), key=lambda j: -j[1])
    max_day = max(deadlines) if deadlines else 0
    parent = list(range(max_day + 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    for deadline, profit in jobs:
        slot = find(deadline)
        if slot > 0:
            total += profit
            parent[slot] = slot - 1
    return total


task(
    "job-scheduling", "lead", 4.7, "Задачи с дедлайнами", "Жадные алгоритмы, DSU",
    "Каждая задача занимает один день, имеет дедлайн (день ≥ 1) и прибыль. В день выполняется одна задача. Максимальная суммарная прибыль, если задачу можно выполнить не позже дедлайна.",
    "def solve(deadlines: list[int], profits: list[int]) -> int",
    _job_profit,
    lambda rng: [ints(rng, n := rng.randint(0, 8), 1, 5), ints(rng, n, 1, 30)],
    samples=[[[2, 1, 2, 1], [100, 19, 27, 25]]],
)


def _rain(heights):
    left, right = 0, len(heights) - 1
    left_max = right_max = total = 0
    while left < right:
        if heights[left] < heights[right]:
            left_max = max(left_max, heights[left])
            total += left_max - heights[left]
            left += 1
        else:
            right_max = max(right_max, heights[right])
            total += right_max - heights[right]
            right -= 1
    return total


task(
    "rain-water", "lead", 4.5, "Дождевая вода", "Два указателя",
    "Столбцы заданной высоты. Сколько единиц воды задержится после дождя?",
    "def solve(heights: list[int]) -> int",
    _rain,
    lambda rng: [ints(rng, rng.randint(0, 12), 0, 6)],
    samples=[[[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]]],
)


def _inversions(nums):
    def sort(arr):
        if len(arr) <= 1:
            return arr, 0
        mid = len(arr) // 2
        left, a = sort(arr[:mid])
        right, b = sort(arr[mid:])
        merged = []
        i = j = inv = 0
        while i < len(left) and j < len(right):
            if left[i] <= right[j]:
                merged.append(left[i])
                i += 1
            else:
                merged.append(right[j])
                inv += len(left) - i
                j += 1
        merged += left[i:] + right[j:]
        return merged, a + b + inv

    return sort(nums)[1]


task(
    "inversions", "lead", 4.6, "Число инверсий", "Сортировка слиянием",
    "Число пар i < j таких, что nums[i] > nums[j]. Ожидается O(n log n).",
    "def solve(nums: list[int]) -> int",
    _inversions,
    lambda rng: [ints(rng, rng.randint(0, 14), 0, 12)],
    samples=[[[2, 4, 1, 3, 5]]],
    domains=["ml", "data"],
)


def _split_load(jobs, workers):
    lo, hi = max(jobs) if jobs else 0, sum(jobs)

    def feasible(limit):
        groups, cur = 1, 0
        for j in jobs:
            if cur + j > limit:
                groups += 1
                cur = 0
            cur += j
        return groups <= workers

    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo


task(
    "split-load", "lead", 4.8, "Балансировка непрерывных партий", "Бинарный поиск по ответу",
    "Задачи идут по порядку и делятся на не более чем workers непрерывных групп. Минимизируйте максимальную сумму группы и верните её.",
    "def solve(jobs: list[int], workers: int) -> int",
    _split_load,
    lambda rng: [ints(rng, rng.randint(1, 10), 1, 15), rng.randint(1, 4)],
    samples=[[[7, 2, 5, 10, 8], 2]],
    domains=["devops", "backend"],
)


def _cooldown(tasks, n):
    counts = Counter(tasks)
    top = max(counts.values())
    same = sum(1 for v in counts.values() if v == top)
    return max(len(tasks), (top - 1) * (n + 1) + same)


task(
    "task-cooldown", "lead", 4.6, "Планировщик с остыванием", "Жадные алгоритмы",
    "Задачи обозначены буквами; между двумя одинаковыми задачами должно пройти не менее n тактов. За такт выполняется одна задача или простой. Минимальное число тактов.",
    "def solve(tasks: list[str], n: int) -> int",
    _cooldown,
    lambda rng: [[rng.choice("ABC") for _ in range(rng.randint(1, 10))], rng.randint(0, 3)],
    samples=[[["A", "A", "A", "B", "B", "B"], 2]],
)
