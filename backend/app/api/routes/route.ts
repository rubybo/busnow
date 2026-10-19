import { getDb } from "../../../lib/db.ts";
import { fail, json } from "../../../lib/http.ts";
import { listRoutes } from "../../../lib/users.ts";

export async function GET() {
  try {
    const routes = listRoutes(getDb()).map((route) => ({ ...route, hasTimes: Boolean(route.hasTimes) }));
    return json({ routes });
  } catch (error) {
    return fail(error);
  }
}
