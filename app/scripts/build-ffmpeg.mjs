// Runs scripts/build-ffmpeg.sh: directly on Linux, inside WSL on Windows.
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.resolve("scripts/build-ffmpeg.sh");
const out = path.resolve(".cache/ffmpeg-remux");
const run =
  process.platform === "win32"
    ? spawnSync(
        "wsl",
        [
          "bash",
          "-c",
          'bash "$(wslpath -a "$1")" "$(wslpath -a "$2")"',
          "_",
          script,
          out,
        ],
        { stdio: "inherit" },
      )
    : spawnSync("bash", [script, out], { stdio: "inherit" });
process.exit(run.status ?? 1);
