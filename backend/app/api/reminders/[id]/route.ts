import { readSessionToken } from "../../../../../lib/auth.ts";
import { getDb } from "../../../../../lib/db.ts";
import { fail, json, readBody } from "../../../../../lib/http.ts";
import { deleteReminder, requireUser, userView } from "../../../../../lib/users.ts";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await readBody(request);
    const { id } = await context.params;
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    deleteReminder(db, user.id, Number(id));
    return json({ user: userView(db, user.id) });
  } catch (error) {
    return fail(error);
  }
}
