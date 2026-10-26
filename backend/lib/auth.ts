import { cookies } from "next/headers";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-busnow_session" : "busnow_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(value)) return null;
  return value;
}

export async function writeSessionToken(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionToken(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
