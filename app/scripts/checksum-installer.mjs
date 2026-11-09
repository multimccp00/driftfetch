// Writes <installer>.sha256 beside each release installer. Upload both files to the GitHub release.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "release");
for (const file of fs.readdirSync(dir, { recursive: true, encoding: "utf8" })) {
  if (!/DriftFetch-(?:Setup|Portable)-\d+\.\d+\.\d+-x64\.exe$/.test(file)) continue;
  const full = path.join(dir, file);
  const hash = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  fs.writeFileSync(full + ".sha256", `${hash}  ${path.basename(file)}\n`);
  console.log(`${full}.sha256`);
}
