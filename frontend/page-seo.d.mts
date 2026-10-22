type SeoPage = {
  title: string;
  description: string;
  path: string;
  robots: "index" | "noindex";
  jsonLd: Record<string, unknown> | null;
};

export function homePage(query?: string): SeoPage;
export function stopPage(stop: { id: number; name: string }, routeCodes?: string[]): SeoPage;
export function routePage(
  route: { code: string; kind: string; title: string; slug: string },
  stops?: Array<{ id: number; name: string }>,
): SeoPage;
export function privatePage(kind: "login" | "register" | "profile" | "missingStop" | "missingRoute"): SeoPage;
