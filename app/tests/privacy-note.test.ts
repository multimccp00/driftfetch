import { expect, it } from "vitest";
import fs from "node:fs";
import { privacyNote, privacyNoteText } from "../shared/privacy-note";

it("keeps the installer's privacy text in step with the in-app note", () => {
  const installer = fs.readFileSync("build/privacy-notice.txt", "utf8");
  expect(installer, "run npm run privacy").toBe(privacyNoteText());
  // eslint-disable-next-line no-control-regex
  expect(installer).not.toMatch(/[^\x00-\x7f]/);
});
it("makes only the claims the code supports", () => {
  const text = JSON.stringify(privacyNote);
  // The note promises no telemetry; nothing in the app may add it.
  const sources = ["electron", "src", "shared"]
    .flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((f) => /\.(ts|tsx|cjs)$/.test(f))
        .map((f) => fs.readFileSync(`${dir}/${f}`, "utf8")),
    )
    .join("\n");
  expect(sources).not.toMatch(/crashReporter|sentry|analytics|telemetry/i);
  expect(text).toContain("no usage tracking");
});
