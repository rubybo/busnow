import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowed = new Set(["busnow.online", "www.busnow.online", "localhost", "127.0.0.1"]);

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (!allowed.has(host)) return new NextResponse("Unknown host", { status: 400 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
