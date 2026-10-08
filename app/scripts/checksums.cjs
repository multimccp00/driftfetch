const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
exports.default = async (context) => {
  for (const file of context.artifactPaths || []) {
    if (!file.endsWith(".exe")) continue;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    await fs.writeFile(file + ".sha256", hash.digest("hex") + "\n");
  }
  return [];
};
