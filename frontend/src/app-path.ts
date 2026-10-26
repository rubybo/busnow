/** A same-site path the router is allowed to open. Rejects protocol-relative URLs. */
export function appPath(pathname: string, search = "", hash = ""): string | null {
  const path = `${pathname}${search}${hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}
