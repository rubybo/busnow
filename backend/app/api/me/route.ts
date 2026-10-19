import { readSessionToken } from "../../../lib/auth.ts";
import { getDb } from "../../../lib/db.ts";
import { fail, json, readBody, stopIdOf } from "../../../lib/http.ts";
import { requireUser, setStops, userView } from "../../../lib/users.ts";

export async function PATCH(request: Request) {
  try {
    const body = await readBody(request);
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    const patch: { morningStop?: number | null; eveningStop?: number | null } = {};
    if ("morningStop" in body) patch.morningStop = stopIdOf(body.morningStop);
    if ("eveningStop" in body) patch.eveningStop = stopIdOf(body.eveningStop);
    setStops(db, user.id, patch);
    return json({ user: userView(db, user.id) });
  } catch (error) {
    return fail(error);
  }
}
