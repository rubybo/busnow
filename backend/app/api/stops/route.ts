import { getDb, searchStops } from "../../../lib/db.ts";
import { fail, json } from "../../../lib/http.ts";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return json({ stops: searchStops(getDb(), query) });
  } catch (error) {
    return fail(error);
  }
}
