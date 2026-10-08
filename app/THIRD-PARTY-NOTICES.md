# Third-party software

DriftFetch's own code is MIT-licensed (see `LICENSE`). It ships with the programs and libraries below, each under its own licence. This file is installed next to the app (`resources/licenses`), and every licence text named here is installed too.

DriftFetch starts the programs in the first table as **separate processes** and talks to them through command-line arguments, files and standard output. They are not linked into DriftFetch. The libraries in the second table are loaded by DriftFetch itself.

## Programs started as separate processes (`resources/engines`)

| Program | Version | Licence | Notes |
| --- | --- | --- | --- |
| yt-dlp | 2026.08.19 | Unlicense; the standalone `.exe` is a PyInstaller bundle that includes GPLv3+ and other third-party components | Licence texts of all bundled components: `engines/yt-dlp-THIRD-PARTY-LICENSES.txt`. Source: https://github.com/yt-dlp/yt-dlp |
| FFmpeg and FFprobe | n9.0.2 | GNU LGPL 2.1 or later (contains no GPL or non-free components) | Built from source by DriftFetch (`scripts/build-ffmpeg.sh`) as a remux-only build: it has **no encoders and no decoders**, only container readers and writers, stream parsers, bitstream filters and network protocols, so it can join, probe and copy streams but never decodes or re-encodes them. It carries two small patches (`scripts/ffmpeg-patches/`) so that the parsers supply stream parameters a decoder would normally provide. The libraries are the separate DLLs `av*.dll` and `sw*.dll` in `engines`, so they can be replaced with your own build of the same version. Licence: `engines/FFmpeg-LICENSE.txt`. Exact build and configuration: `engines/FFmpeg-BUILD.txt`. Source: https://github.com/FFmpeg/FFmpeg/commit/946fcce07b6dcd0331c8cc609192aeff5e1924f8 |
| gallery-dl | v1.32.15 | GNU GPL 2 | Windows `.exe` published by the project (a PyInstaller bundle that also contains Python and other libraries). Licence: `engines/gallery-dl-LICENSE.txt`. Source: https://codeberg.org/mikf/gallery-dl |
| Deno | v2.9.6 | MIT | Used only as yt-dlp's external JavaScript runtime. Licence: `engines/Deno-LICENSE.md`. Source: https://github.com/denoland/deno |

The exact versions, origins and SHA-256 checksums of these files are recorded in `engines/manifest.json` and pinned in the source repository by `engines.lock.json`.

This software uses libraries from the FFmpeg project (https://ffmpeg.org) under the LGPLv3. DriftFetch is not affiliated with and does not own FFmpeg.

## Libraries and runtime loaded by DriftFetch

| Component | Version | Licence | Notes |
| --- | --- | --- | --- |
| Electron | 44.5.1 | MIT | Includes Chromium and other components under their own licences: `LICENSE.electron.txt` and `LICENSES.chromium.html` next to `DriftFetch.exe`. |
| openpgp (OpenPGP.js) | 6.3.2 | GNU LGPL 3 or later | Used to verify the signature on yt-dlp updates. It is **not** merged into DriftFetch's code: it is a separate module (`node_modules/openpgp` inside `resources/app.asar`) that you can replace with another build of the same version, for example by unpacking and repacking the archive with `asar`. Source: https://github.com/openpgpjs/openpgpjs |
| React and React DOM | 19.3.0 | MIT | https://github.com/facebook/react |
| Lucide | 0.468.0 | ISC | https://github.com/lucide-icons/lucide |

## Source code for the GPL and LGPL components

The GPL and LGPL programs above are distributed unmodified. How to obtain their complete corresponding source code is described in `SOURCE-OFFER.md`.

Nothing in this file is legal advice. If you redistribute DriftFetch, you are responsible for meeting the obligations of the licences listed here.
