# Written offer of corresponding source

DriftFetch is distributed together with software licensed under the GNU General Public License (GPL) and the GNU Lesser General Public License (LGPL). This document tells you how to get the source code of those components.

## What is covered

| Component | Version | Licence |
| --- | --- | --- |
| yt-dlp (Windows executable) | 2026.08.19 | Unlicense, bundled with GPLv3+ components |
| FFmpeg and FFprobe with their DLLs (remux-only build with two patches) | n9.0.2 | LGPL 2.1 or later |
| gallery-dl (Windows executable) | v1.32.15 | GPL 2 |
| openpgp (OpenPGP.js) | 6.3.2 | LGPL 3 or later |

All of them are distributed exactly as published by their authors. DriftFetch does not modify them.

## Where to get the source

- **Included with each release.** Every release of DriftFetch is published together with the source archives of these exact versions, as `corresponding-source-<version>.zip` (`SHA256SUMS` inside lists the checksum of each archive). They are produced by `npm run sources`.
- **From the original projects.**
  - yt-dlp: https://github.com/yt-dlp/yt-dlp (tag `2026.08.19`)
  - FFmpeg: https://github.com/FFmpeg/FFmpeg (tag `n9.0.2`, commit `946fcce07b6dcd0331c8cc609192aeff5e1924f8`). The patches and the build script (`scripts/build-ffmpeg.sh`, `scripts/ffmpeg-patches/`) are part of the DriftFetch source repository and are also included in the source zip
  - gallery-dl: https://codeberg.org/mikf/gallery-dl (tag `v1.32.15`)
  - openpgp: https://github.com/openpgpjs/openpgpjs (tag `v6.3.2`)
- **From us.** For at least three years after you received DriftFetch, you may ask for a copy of the source of any component in the table, at no more than the cost of physically providing it. Write to: SET-BEFORE-RELEASE (an email address or web page that you control and will keep monitoring).

## Replacing the LGPL libraries

You may replace the FFmpeg DLLs (`engines/av*.dll`, `engines/sw*.dll`) with your own build of the same FFmpeg libraries, and the `openpgp` module inside `resources/app.asar`. DriftFetch does not check them against a checksum when it starts (the build scripts do, only when a release is made).

## Not covered

Components of the PyInstaller bundles (such as Python itself) are listed with their licences in `engines/yt-dlp-THIRD-PARTY-LICENSES.txt`; their sources are available from the original projects named there. Electron and Chromium licences are in `LICENSE.electron.txt` and `LICENSES.chromium.html`.
