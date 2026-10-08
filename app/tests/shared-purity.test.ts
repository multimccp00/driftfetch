import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// shared/ is bundled into both the renderer and the main process, so it must
// stay free of Node and Electron modules.
it("keeps shared/ free of node and electron imports", () => {
  for (const file of fs.readdirSync("shared"))
    expect(
      fs.readFileSync(path.join("shared", file), "utf8"),
      file,
    ).not.toMatch(/from\s+["'](?:node:|electron)/);
});
