import { getDb } from "../../../lib/db.ts";
import { fail, json } from "../../../lib/http.ts";
import { listRoutes } from "../../../lib/users.ts";

export async function GET() {
  try {
    return json({ routes: listRoutes(getDb()) });
  } catch (error) {
    return fail(error);
  }
}
