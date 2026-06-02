// Une clases condicionalmente (sin dependencia externa). Filtra falsy.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
