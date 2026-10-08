# Current 0.5.0

- Bundles Deno 2.9.6 as yt-dlp's external JavaScript runtime, with a release-asset SHA-256 check, manifest entry and bundled license. It is copied into the user engine folder with yt-dlp, FFmpeg and FFprobe. Settings → Engine displays its status and version.
- yt-dlp receives the Deno path only when that runtime starts successfully. This supports current YouTube JavaScript challenges without relying on Node.js or Deno installed elsewhere on the PC. The official yt-dlp executable includes its EJS scripts.
- Corrected individual link analysis: Current no longer uses yt-dlp's `--flat-playlist` shortcut on every page. Individual video pages can now return their real formats, including YouTube's separate audio/video streams; collections are still limited to 101 entries.
- Added `scripts/verify-sources.mjs` for a metadata-only check of up to 100 user-provided links. It never downloads media, records the source, result, resolution and merge requirement, and removes URL query strings from its report. Run `node scripts/verify-sources.mjs links.txt`, or one URL with `--url`.
- Added `npm run release:check`, which verifies all four bundled binaries against the manifest and requires their notices/licenses before packaging. The production CSP no longer permits the Vite development WebSocket endpoint.

## Validation

63 automated tests passed. The packaged app passed its smoke suite with the Deno runtime available under a Windows-only PATH. A public Blender Foundation YouTube source was checked first with the metadata-only verifier: yt-dlp found a 2160p source with separate audio. The packaged app then selected a 720p separate-audio format, downloaded it and verified the merged 720p file, recording `311+251` as the actual yt-dlp format selection. See `youtube-package-report-0.5.0.json`.

This does not guarantee that every YouTube URL or source will work: availability, authentication and site changes still apply. The user-supplied source compatibility list and clean-PC installer/upgrade testing remain required before calling the app 1.0.
