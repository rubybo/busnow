import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db.ts";
import { fail, json } from "../../../../lib/http.ts";
import {
  newVisitorToken,
  onlineStatus,
  touchVisitor,
  validVisitorToken,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
} from "../../../../lib/presence.ts";

function live(data: unknown): Response {
  const response = json(data);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const record = request.headers.get("x-busnow") === "1";
    if (record) {
      const jar = await cookies();
      const current = jar.get(VISITOR_COOKIE)?.value;
      const token = validVisitorToken(current) ? current : newVisitorToken();
      if (token !== current) {
        jar.set(VISITOR_COOKIE, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: VISITOR_MAX_AGE,
        });
      }
      return live(touchVisitor(db, token));
    }
    return live(onlineStatus(db));
  } catch (error) {
    return fail(error);
  }
}
