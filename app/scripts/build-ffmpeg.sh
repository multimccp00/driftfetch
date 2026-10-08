#!/usr/bin/env bash
# Builds DriftFetch's FFmpeg: a "remux-only" Windows x64 build with NO encoders and
# NO decoders. It keeps what DriftFetch needs: container readers and writers
# (demuxers/muxers), stream parsers, bitstream filters and the network
# protocols (HTTP/HTTPS via Windows' own TLS), so streams can be joined,
# probed and copied. Nothing is ever decoded or re-encoded.
#
# Run on Linux or in WSL (Ubuntu): sudo apt install mingw-w64 git curl
#   bash scripts/build-ffmpeg.sh [output folder]      (default .cache/ffmpeg-remux)
# From Windows: npm run ffmpeg:build   (runs this inside WSL)
set -euo pipefail

TAG="${FFMPEG_TAG:-n9.0.2}"
COMMIT="${FFMPEG_COMMIT:-946fcce07b6dcd0331c8cc609192aeff5e1924f8}" # what TAG must point to
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$HERE/.cache/ffmpeg-remux}"
WORK="${FFMPEG_WORK:-$HOME/ffbuild}"
CROSS=x86_64-w64-mingw32-

mkdir -p "$WORK" "$OUT"
cd "$WORK"
if [ ! -d FFmpeg/.git ]; then
  git clone --quiet --depth 1 --branch "$TAG" https://github.com/FFmpeg/FFmpeg.git
fi
cd FFmpeg
git fetch --quiet --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG" 2>/dev/null || true
git checkout --quiet "$TAG"
# A tag can be moved; the commit hash cannot.
[ "$(git rev-parse HEAD)" = "$COMMIT" ] || { echo "FFmpeg $TAG is not commit $COMMIT"; exit 1; }
git reset --hard -q "$COMMIT" # drop edits left by an interrupted earlier run
git clean -fdxq
# Our patches (published with the source, see SOURCE-OFFER.md): they let the parsers
# supply stream parameters that a decoder would normally provide.
for patch in "$HERE"/scripts/ffmpeg-patches/*.patch; do git apply --whitespace=nowarn "$patch"; done

CONFIGURE=(
  --arch=x86_64 --target-os=mingw32 --cross-prefix="$CROSS"
  # The win32-thread flavour of mingw needs no extra runtime DLL (no winpthreads).
  --cc="${CROSS}gcc-win32"
  --prefix="$WORK/prefix"
  --enable-shared --disable-static
  --disable-debug --disable-doc --disable-ffplay --disable-x86asm
  --disable-autodetect
  # Everything off, then back on only container, parser and network code.
  --disable-everything
  --enable-demuxers --enable-muxers --enable-parsers --enable-bsfs --enable-protocols
  # Just enough for the command line tool to start; stream copy builds no filter graph.
  --enable-filter=null,anull,buffer,abuffer,buffersink,abuffersink,format,aformat
  --enable-schannel
  --disable-avdevice --disable-swscale
  --extra-ldflags="-static-libgcc -Wl,--no-insert-timestamp"
)
./configure "${CONFIGURE[@]}" >"$WORK/configure.log" 2>&1 || { tail -20 "$WORK/configure.log"; exit 1; }
make -j"$(nproc)" >"$WORK/make.log" 2>&1 || { tail -30 "$WORK/make.log"; exit 1; }
rm -rf "$WORK/prefix" && make install >>"$WORK/make.log" 2>&1

# The product: two programs and their libraries, stripped.
rm -f "$OUT"/*.exe "$OUT"/*.dll "$OUT"/FFmpeg-*
cp "$WORK"/prefix/bin/*.exe "$WORK"/prefix/bin/*.dll "$OUT"/
"${CROSS}strip" --strip-unneeded "$OUT"/*.exe "$OUT"/*.dll
LICENSE_FILE=COPYING.LGPLv2.1
grep -q "License: LGPL version 3" "$WORK/configure.log" && LICENSE_FILE=COPYING.LGPLv3
cp "$LICENSE_FILE" "$OUT/FFmpeg-LICENSE.txt"
{
  echo "FFmpeg $TAG (commit $COMMIT), built by DriftFetch's scripts/build-ffmpeg.sh"
  echo "Remux-only build: no encoders and no decoders; containers, parsers, bitstream filters and protocols only."
  echo "Source: https://github.com/FFmpeg/FFmpeg/commit/$COMMIT, plus the patches in scripts/ffmpeg-patches/ of the DriftFetch repository"
  echo "License: $(grep -m1 '^License:' "$WORK/configure.log" | sed 's/^License: //') (this build contains no GPL or non-free components)."
  echo "The DLLs in this folder (av*.dll, sw*.dll) may be replaced with your own build of the same FFmpeg libraries."
  echo
  echo "Configure options:"
  printf '%s\n' "${CONFIGURE[@]}" | grep -v '^#'
  echo
  echo "Output of ffmpeg -version needs a Windows run; see FFmpeg-BUILD.txt as finished by prepare-engines.mjs."
} >"$OUT/FFmpeg-BUILD.txt"
echo "Built into $OUT"
ls -la "$OUT"
