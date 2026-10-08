// Writes the installer's first-page text from the single source in shared/privacy-note.ts.
import { buildSync } from "esbuild";
import fs from "node:fs/promises";

const bundled = buildSync({
  entryPoints: ["shared/privacy-note.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
}).outputFiles[0].text;
const module = { exports: {} };
new Function("module", "exports", bundled)(module, module.exports);
const text = module.exports.privacyNoteText();
if (/[^\x00-\x7f]/.test(text))
  throw new Error(
    "The privacy note must stay plain ASCII for the installer page.",
  );
await fs.writeFile("build/privacy-notice.txt", text);
console.log("Wrote build/privacy-notice.txt");
