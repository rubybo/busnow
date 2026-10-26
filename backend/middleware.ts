import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowed = new Set(["busnow.online", "www.busnow.online", "localhost", "127.0.0.1"]);
const PRIVATE = /^\/api\/(?:auth|me|reminders|push|cron)(?:\/|$)/;

function harden(response: NextResponse, pathname: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (PRIVATE.test(pathname)) response.headers.set("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  return response;
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const host = request.headers.get("host")?.split(":")[0] ?? "";
    if (!allowed.has(host)) {
      return harden(new NextResponse("Unknown host", { status: 400 }), request.nextUrl.pathname);
    }
  }
  return harden(NextResponse.next(), request.nextUrl.pathname);
}

export const config = { matcher: "/api/:path*" };
