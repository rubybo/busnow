import { getDb } from "../../../../lib/db.ts";
import { fail, HttpError, json } from "../../../../lib/http.ts";
import { routeDetail } from "../../../../lib/users.ts";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const detail = routeDetail(getDb(), slug);
    if (!detail) throw new HttpError(404, "Маршрут не найден");
    return json(detail);
  } catch (error) {
    return fail(error);
  }
}
