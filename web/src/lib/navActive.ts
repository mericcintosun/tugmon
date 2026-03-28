/**
 * Single active nav item: `/play/offline` must not also match `/play`.
 */
export function isNavLinkActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  if (href === "/play") return pathname === "/play";
  if (href === "/play/offline") {
    return pathname === "/play/offline" || pathname.startsWith("/play/offline/");
  }
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
