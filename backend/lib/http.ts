const DEV_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

const PROD_ORIGINS = new Set([
  "https://busnow.online",
  "https://www.busnow.online",
]);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

export const PRIVATE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, headers ? { status, headers } : { status });
}

export function fail(error: unknown): Response {
  if (error instanceof HttpError) {
    const headers = new Headers(PRIVATE);
    if (error.headers) new Headers(error.headers).forEach((value, key) => headers.set(key, value));
    return json({ error: error.message }, error.status, headers);
  }
  console.error(error);
  return json({ error: "Что-то пошло не так" }, 500, PRIVATE);
}

const MAX_BODY = 16_384;

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  assertOrigin(request);
  if (request.headers.get("x-busnow") !== "1") {
    throw new HttpError(403, "Запрос отклонён");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new HttpError(413, "Слишком большой запрос");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "Слишком большой запрос");
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Нужен JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Нужен объект");
  }
  return body as Record<string, unknown>;
}

function assertOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const allowed = process.env.NODE_ENV === "production" ? PROD_ORIGINS : DEV_ORIGINS;
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "Запрос отклонён");
}

export function emailOf(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Укажите почту");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Почта выглядит неверной");
  }
  return email;
}

export function passwordOf(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new HttpError(400, "Пароль должен быть от 8 до 128 символов");
  }
  return value;
}

export function stopIdOf(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, "Остановка не найдена");
  }
  return value;
}
