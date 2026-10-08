import { build } from "esbuild";
import fs from "node:fs/promises";
await build({
  entryPoints: [
    "electron/main.ts",
    "electron/preload.ts",
    "electron/popup-preload.ts",
  ],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  // openpgp is LGPL-3.0+: it stays a separate module in node_modules so it can be replaced.
  external: ["electron", "node:sqlite", "openpgp"],
  sourcemap: true,
  target: "node24",
});
// A CommonJS bundle has no import.meta; a package that reads it would stop the app at load.
for (const file of ["main.cjs", "preload.cjs", "popup-preload.cjs"])
  if (
    (await fs.readFile(`dist-electron/${file}`, "utf8")).includes("import_meta")
  )
    throw new Error(
      `${file} still references import.meta; it would fail at startup.`,
    );
