# Legal research notes: downloading, privacy and patents

Prepared 2 October 2026 while preparing Current for distribution. **This is research by a software assistant, not legal advice.** It records what I could confirm from primary sources, what I could only find in secondary sources, and what I could not verify, so a lawyer can start from here rather than from nothing. Where a page failed to load, I say so.

Confidence tags: **[primary]** read on the project's or rights-holder's own page; **[secondary]** reported by a news site, wiki or forum; **[code]** checked in this repository; **[unverified]** could not be confirmed.

---

## 1. What JDownloader does, and what Current can take from it

| Topic | Finding | Confidence |
| --- | --- | --- |
| Licence | GPLv3, with some source files not public | [secondary] Wikipedia |
| Privacy policy | Hosted at my.jdownloader.org. Collects anonymised IP addresses, cookies and update-check statistics (number of updates and data size, no individual IPs); optional crash reports kept separately and deleted within three months; Google AdSense on the website with consent for personalised ads; data on EU servers; contact for data protection requests | [primary] my.jdownloader.org/legal/privacy.html |
| Installer | The official Windows installer shows an extra screen offering third-party software with an opt-out. Complaints in 2012 alleged adware without clear consent | [secondary] Wikipedia, review sites |
| Updates and reports | Updates itself on start by default. Beta builds send automatic error reports that omit the IP address and downloaded file names | [secondary] Wikipedia |
| Terms of use | I could **not** retrieve JDownloader's own terms (jdownloader.com did not resolve; the jdownloader.org legal/terms page does not exist). Wording about "not designed to bypass DRM, paywalls or access controls" and "the user is responsible for having the right to download" came from **jsdownloader.com, a different service**, and must not be attributed to JDownloader | [unverified] for JDownloader |
| Legal history | In 2013 a Hamburg court held that recording copy-protected RTMPE streams infringed anti-circumvention law, and held the company's CEO personally liable for that code, which an anonymous contributor had added to a nightly build | [secondary] Techdirt, Wikipedia |

**What this means for Current**

- Current's privacy position is simpler than JDownloader's: no account, no ads, no bundled offers, no automatic updates, no error or statistics reports, and no servers of its own [code: no `crashReporter`, analytics or update-check code; a test enforces this]. The privacy note states exactly that and nothing more.
- The Hamburg case is about **circumvention features and contributor code**, not about downloading in general. Current does not enable yt-dlp's unplayable-format options and reports DRM-protected videos as unsupported [code: `electron/core.ts`, no `--allow-unplayable-formats` anywhere]. If you accept outside contributions or extensions, review them before a release; extensions now run sandboxed, but they can still add site-specific behaviour.
- Related background: in October 2020 the RIAA's DMCA notice took youtube-dl's GitHub repository down, claiming its purpose was to circumvent YouTube's technical protection measures; GitHub reinstated it on 16 November 2020 after an EFF letter [secondary: BleepingComputer, The Register]. That shows the legal theory used against downloaders (anti-circumvention, not patents), and why keeping DRM/paywall bypass out of Current matters.

---

## 2. Patents: FFmpeg, gallery-dl and the rest

### 2.1 What Current actually does with these tools

- Current only ever **merges and probes**. The yt-dlp arguments contain `--merge-output-format mkv` and no recode, audio extraction, embedding or conversion options [code: `electron/engine.ts`]. yt-dlp merges with stream copy, so no video or audio is re-encoded in normal use.
- **Update (same day as the first draft):** Current no longer ships a general FFmpeg. It ships its own **remux-only build** of FFmpeg n9.0.2 (`scripts/build-ffmpeg.sh`) with **no encoders, no decoders and no hardware-acceleration code**. `ffmpeg -decoders`, `-encoders` and `-hwaccels` list nothing, and `npm run release:check` refuses to pass otherwise [code]. What remains is container reading and writing, stream parsers (which read stream headers), bitstream filters and network protocols. Everything below that talks about "the shipped DLLs include codec implementations" describes the earlier BtbN build and is kept for the reasoning.
- The earlier build was BtbN's LGPL shared FFmpeg `n9.0.2-22-g46d8f462ee`. It contained encoders and decoders (libopenh264, libopus, libmp3lame, libvpx, libaom, libsvtav1, libvvenc and others) even though Current never used them. The patent question for a distributor is mostly about what is shipped, not only what is used.
- gallery-dl downloads image files over HTTP. FFmpeg is only an optional dependency for converting Pixiv "ugoira" animations, and only when its post-processor is configured [secondary: gallery-dl documentation]. Current starts it with `--config-ignore`, so that path is off [code]. gallery-dl implements no codec.

### 2.2 The facts about video-codec patents

- **FFmpeg's own position.** The project says it does not know which patents apply ("we are not lawyers"), that H.264 and MPEG-4 documents warn of possible patent claims, that safety depends on where you live, and that **distributors bear the responsibility** for compliance; private users face little risk, commercial product makers more [primary: ffmpeg.org/legal.html].
- **H.264/AVC pool.** Via Licensing Alliance (which absorbed MPEG LA in 2023) licenses the essential patents. The licence covers encoders and decoders in products including "media player and other personal computer software". For PC software the first 100,000 units a year carry no royalty, then US$0.20 per unit, with an annual enterprise cap [primary: via-la.com]. Via LA states no open-source exemption [primary]. In 2010 MPEG LA also said it would not charge royalties for H.264 Internet video that is free to end users [secondary: Wikipedia]. Whether giving away free software to the public falls under the 100,000-unit threshold without signing a licence is **[unverified]**; I would ask Via LA or a lawyer.
- **Expiry.** Many H.264 patents have expired; sources disagree on the last ones (one source gives a US patent ending 29 November 2027, another a 2016-granted US patent running to November 2030) [secondary, conflicting]. Treat H.264 as "still partly in force".
- **Cisco OpenH264.** Cisco pays the pool for **its own pre-built binary**, free to users if conditions are met: the binary must be downloaded separately rather than bundled by a third party, users must be able to turn it off, and Cisco must be credited. The terms say nothing about patent cover for binaries built by someone else [primary: openh264.org/BINARY_LICENSE.txt]. BtbN's FFmpeg links OpenH264 **built from source**, so Cisco's cover does not apply to it [analysis].
- **HEVC and others.** Several pools and individual holders license HEVC and AAC; I did not research them individually.
- **Who gets sued.** Recent enforcement targets companies selling or streaming at scale: Nokia against Amazon and HP (H.264/H.265), and against Acer, Asus and Hisense (H.265, with a German court barring PC sales in January 2026 after finding Acer and Asus not "willing licensees") [secondary: Tom's Hardware, JUVE Patent, streaming-media press]. I found **no case in which a patent pool sued the developer of FFmpeg or x264**. A 2010 South Korean claim by Dideonet against companies using x264/ffmpeg-mt concerned a parallel-processing patent, not the codec standard, and the project's own mailing list recorded that it was being challenged [secondary]. Absence of evidence is not proof of safety.

### 2.3 How comparable public projects handle it

| Project | Approach | Confidence |
| --- | --- | --- |
| **Audacity** | Does **not** ship FFmpeg; users download it separately. The manual says "Due to patent restrictions, FFmpeg cannot be distributed with Audacity itself" | [primary] audacityteam.org manual |
| **VLC (VideoLAN)** | Ships codec implementations and relies on French law, where software patents are not accepted; disclaims responsibility for illegal use, and its documentation says end users may owe royalties where patents apply | [primary] videolan.org/legal.html; [secondary] documentation |
| **HandBrake** | Ships encoders and decoders; its maintainers say HandBrake itself charges no royalty and needs no licence for the sale of converted video, leaving licensing for content to those who distribute it | [secondary] project discussion #6856 |
| **mobile-ffmpeg** (library packaging) | Its wiki warns that FFmpeg, x264, x265, kvazaar and openh264 contain algorithms covered by software patents where those are recognised, and that shipping openh264 triggers MPEG LA obligations; it advises taking legal advice | [secondary] project wiki |
| **Electron** | Ships its own `ffmpeg.dll`. Maintainers never answered the issues asking whether the official build includes H.264/AAC (the issues were closed without reply). My own check of `ffmpeg.dll` found only container identifiers, which is **inconclusive** | [secondary]; [code] inconclusive |
| **yt-dlp front ends** | Some bundle yt-dlp and FFmpeg in their installers (a search found MediaForge Desktop and OmniGet); others, such as Tartube, require a separate FFmpeg | [secondary], not examined further |

The pattern: projects that are not selling anything either rely on jurisdiction (VLC), leave decoding to the user (Audacity), or ship the tool and state that licensing belongs to whoever uses or distributes content (HandBrake). Nobody I found claims a clear safe harbour.

### 2.4 Assessment for Current (analysis, not advice)

| Component | Patent exposure | Why |
| --- | --- | --- |
| FFmpeg libraries (remux-only build, current) | **Much reduced, not provably zero** | No codec implementation ships any more, so patents on encoding and decoding methods have nothing in the download to read on. The container code and the stream parsers (which read header fields such as picture size or AAC sample rate) remain; whether parsing a bitstream header can fall under a codec patent is a legal question I cannot answer |
| FFmpeg libraries (earlier BtbN build, retired) | Low in practice, not zero | Codec implementations were shipped though unused |
| OpenH264 | **Gone** | It was inside the earlier build; the remux-only build has no external libraries at all |
| yt-dlp, gallery-dl, Deno | **Very low** | No codec implementation. Their legal exposure is about circumvention and site terms, not patents. I found no patent dispute involving any of them |

Jurisdiction matters a great deal (FFmpeg's own page says so). Where you live and where you distribute decides how real this is.

### 2.5 Options to reduce exposure

| Option | Effect | Cost |
| --- | --- | --- |
| A. Keep the current LGPL build | Matches what many projects do; relies on low enforcement against free tools | None; keep the compliance steps below |
| B. Build a **remux-only FFmpeg** (muxers, demuxers, parsers, bitstream filters, protocols; no encoders or decoders) | Ships no codec implementation, so most of the patent question disappears, and the binary is smaller (about 6 MB instead of about 170 MB) | **Done.** You must build and maintain FFmpeg yourself: `npm run ffmpeg:build` (WSL or Linux with mingw-w64), two small patches carried forward on every FFmpeg upgrade, and testing of new site types |
| C. Download FFmpeg on first run with the user's consent, as Audacity does | Current would not distribute FFmpeg; the user obtains it from its publisher | Needs a download and verification step and an offline fallback; whether this changes your own liability is a legal question |
| D. Take a Via LA licence | Clear cover for H.264 | Paperwork and possibly cost above the free threshold; does not cover other codecs |

B is now in place. C or D remain available if a lawyer advises more caution.

### 2.5a What the remux-only build supports, and what it cannot do

Tested with the shipped binaries and, where stated, with yt-dlp itself (outputs checked by decoding them with an independent full FFmpeg):

- Joining separate video and audio files into MKV or MP4: H.264+AAC (MP4+M4A), VP9+Opus (WebM), AV1+Opus. Passed.
- MPEG-TS and HLS: H.264+AAC copied to MKV and to MP4 with `aac_adtstoasc`; local HLS playlists read directly. Passed after the two patches (without them AAC in TS has no sample rate and HLS has no picture size, because only a decoder fills them in).
- yt-dlp end to end: a real YouTube video (AV1+Opus) merged to MKV; a local HLS stream through yt-dlp's native downloader plus its m3u8 fix-up, and through yt-dlp's FFmpeg downloader. All decoded cleanly.
- Probing (`ffprobe`) of picture size and stream types, as Current does.

Known limits:
- Anything that must **decode or re-encode** will fail: converting formats, extracting or converting audio, embedding thumbnails as converted images, burning subtitles, resizing. Current uses none of these. Adding such a feature later means shipping codecs again.
- **HE-AAC** in ADTS (TS/HLS) reports its core sample rate, not the doubled rate a decoder would find. The stream data is copied unchanged, and the `aac_adtstoasc` filter writes the same core rate, so playback is unaffected in the cases tested.
- FLV and similar millisecond-timestamp inputs show duplicate-timestamp warnings in a null-muxer check; the full FFmpeg produces the same warnings for the same input, so this is not new.
- Sites or stream types I did not test (for example SAMPLE-AES HLS or unusual containers) may behave differently; the smoke suite and a few real downloads are the safety net, not an exhaustive test.

### 2.6 FFmpeg's compliance checklist and where Current stands

From ffmpeg.org/legal.html [primary]:

| Requirement | Status |
| --- | --- |
| No `--enable-gpl` or `--enable-nonfree` | Done: LGPL build [code] |
| Dynamic linking for the FFmpeg libraries | Done: shared DLLs |
| Distribute the complete FFmpeg source | Process in place: `npm run sources`; **you must attach the zip to every release** |
| Source available "on the same webserver as the binary", with configure options documented | Configure output is in `FFmpeg-BUILD.txt`; hosting is up to you |
| Attribution on the download page and in an about box; state that you do not own FFmpeg | **About-box text added** (Settings > Engine and THIRD-PARTY-NOTICES.md). Add the same sentence to your download page |
| Do not forbid reverse engineering in the EULA | Done: MIT licence, no EULA |
| Do not rename the DLLs | Done |
| Verify that no GPL library such as libx264 is included | Done: the build has no external libraries; `release:check` rejects anything but the remux-only build |
| Publish your modifications | Two patches in `scripts/ffmpeg-patches/`, shipped in the source zip (`npm run sources`) and in the repository |

---

## 3. Other legal areas this raised (not researched in depth)

- **Circumvention law (DMCA section 1201 and equivalents).** The main legal theory used against downloaders. Keep DRM and paywall bypass out of Current, keep the DRM refusal message, and review contributions and extensions.
- **Site terms of service and copyright.** Users, not Current, decide what to download; the privacy note and first-launch dialog say so, and the installer page repeats it.
- **Privacy law.** Current collects nothing itself, so there is no controller relationship to document, but the clipboard monitor, saved sign-ins and the Chrome cookie option are worth describing accurately, which the privacy note does. If you add any online service, update, report or account, the note and this analysis change.
- **Names and trademarks.** Deferred at your request.

## Sources

- FFmpeg: [License and Legal Considerations](https://www.ffmpeg.org/legal.html)
- Audacity: [Installing FFmpeg](https://www.audacityteam.org/manual/basics/installing-ffmpeg/)
- VideoLAN: [Legal](https://www.videolan.org/legal.html)
- Via LA: [AVC/H.264 programme](https://www.via-la.com/licensing-programs/avc-h-264/)
- Cisco: [OpenH264 binary licence](https://www.openh264.org/BINARY_LICENSE.txt)
- Wikipedia: [Advanced Video Coding](https://en.wikipedia.org/wiki/Advanced_Video_Coding), [JDownloader](https://en.wikipedia.org/wiki/JDownloader)
- JDownloader: [Privacy policy](https://my.jdownloader.org/legal/privacy.html)
- Techdirt: [German court ruling on JDownloader's CEO](https://www.techdirt.com/2013/12/05/german-court-says-ceo-open-source-company-liable-illegal-functions-submitted-community/)
- mobile-ffmpeg: [Patents wiki](https://github.com/tanersener/mobile-ffmpeg/wiki/Patents)
- FFmpeg mailing list: [ffmpeg-mt lawsuit](https://ffmpeg.org/pipermail/ffmpeg-devel/2011-October/115983.html)
- Tom's Hardware: [Acer and Asus, Nokia HEVC ruling](https://www.tomshardware.com/laptops/acer-and-asus-halt-pc-and-laptop-sales-in-germany-amid-h-264-codec-patent-dispute-nokia-wins-patent-ruling-forcing-tech-giants-to-license-hevc-codec)
- BleepingComputer: [youtube-dl removed from GitHub](https://www.bleepingcomputer.com/news/software/youtube-dl-removed-from-github-after-riaa-dmca-notice/)
- Electron: [issue 48097](https://github.com/electron/electron/issues/48097)
- HandBrake: [discussion 6856](https://github.com/HandBrake/HandBrake/discussions/6856)
