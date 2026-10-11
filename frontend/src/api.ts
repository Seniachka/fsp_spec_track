const BASE = "/api/v1";

export type SessionUser = {
  id: number;
  email: string;
  role: "candidate" | "employer" | "admin";
  name: string;
};

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "ERROR") {
    super(message);
    this.code = code;
  }
}

async function raw(path: string, options: RequestInit = {}, retry = true) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const access = localStorage.getItem("access");
  if (access) headers.set("Authorization", `Bearer ${access}`);
  const response = await fetch(BASE + path, { ...options, headers });
  if (response.status === 401 && retry && localStorage.getItem("refresh") && !path.startsWith("/auth/")) {
    const refreshed = await fetch(BASE + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: localStorage.getItem("refresh") }),
    });
    if (refreshed.ok) {
      const tokens = await refreshed.json();
      localStorage.setItem("access", tokens.access_token);
      localStorage.setItem("refresh", tokens.refresh_token);
      return raw(path, options, false);
    }
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Не получилось выполнить запрос", data?.error?.code || "ERROR");
  }
  return data;
}

export function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  return raw(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function saveSession(tokens: { access_token: string; refresh_token: string }) {
  localStorage.setItem("access", tokens.access_token);
  localStorage.setItem("refresh", tokens.refresh_token);
}

export function clearSession() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
}

export function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

export function range(min: number, max: number) {
  return `${money(min)} — ${money(max)}`;
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}
