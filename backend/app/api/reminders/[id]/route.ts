import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, HttpError, json, PRIVATE, readBody } from "../../../../lib/http.ts";
import { deleteReminder, requireUser, userView } from "../../../../lib/users.ts";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await readBody(request);
    const { id } = await context.params;
    const reminderId = Number(id);
    if (!Number.isInteger(reminderId) || reminderId < 1) throw new HttpError(404, "Напоминание не найдено");
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    deleteReminder(db, user.id, reminderId);
    return json({ user: userView(db, user.id) }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}
