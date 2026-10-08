import path from "node:path";

/** Compare Windows spellings consistently while retaining the engine's usable path. */
export function reportedDownloadFile(
  file: unknown,
  destination: string,
  platform: NodeJS.Platform = process.platform,
): { file: string; key: string } | undefined {
  if (typeof file !== "string" || file.includes("\0")) return;
  const paths = platform === "win32" ? path.win32 : path.posix;
  if (!paths.isAbsolute(file) || !paths.isAbsolute(destination)) return;
  const canonical = (value: string) => {
    let resolved = paths.resolve(value);
    if (platform === "win32") {
      if (/^\\\\\?\\UNC\\/i.test(resolved))
        resolved = "\\\\" + resolved.slice(8);
      else if (/^\\\\\?\\[a-z]:\\/i.test(resolved))
        resolved = resolved.slice(4);
      else if (/^\\\\[?.]\\/.test(resolved)) return;
    }
    return resolved;
  };
  const base = canonical(destination),
    candidate = canonical(file);
  if (!base || !candidate) return;
  const relative = paths.relative(base, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(".." + paths.sep) ||
    paths.isAbsolute(relative)
  )
    return;
  return {
    file: paths.resolve(file),
    key: platform === "win32" ? candidate.toLowerCase() : candidate,
  };
}
