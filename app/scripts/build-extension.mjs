import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const directory = path.resolve(process.argv[2] || "");
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/build-extension.mjs <provider-directory>",
  );
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
);
if (!/^[a-z][a-z0-9-]{0,63}$/.test(manifest.id))
  throw new Error("Invalid extension ID");
const result = await build({
  entryPoints: [path.join(directory, "provider.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  write: false,
});
const output = path.join(directory, `${manifest.id}.current-extension`);
await fs.writeFile(
  output,
  JSON.stringify({ manifest, code: result.outputFiles[0].text }),
);
console.log(output);
