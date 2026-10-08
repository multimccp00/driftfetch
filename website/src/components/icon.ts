import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("node_modules/lucide-static/icons");

/** Inline Lucide icon as an HTML string, resolved at build time (no runtime icon script). */
export function Icon(name: string, size = 16, stroke = 1.75): string {
  const raw = fs.readFileSync(path.join(dir, name + ".svg"), "utf8");
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim();
  return `<span class="ic"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg></span>`;
}

/** Just the <path>/<circle> children, for icons the client script draws at runtime. */
export function iconInner(name: string): string {
  return fs.readFileSync(path.join(dir, name + ".svg"), "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim();
}
