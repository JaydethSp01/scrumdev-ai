// Normaliza una URL a ABSOLUTA. Las URLs de deploy (Vercel/Render) a veces llegan
// como host pelado (sin https://). Si se usan como href tal cual, el navegador las
// trata como enlace RELATIVO -> navega a /projects/<host> -> "Proyecto no encontrado".
// Úsalo SIEMPRE para href de URLs externas de deploy.
export function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const s = String(u).trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
