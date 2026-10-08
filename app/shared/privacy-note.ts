/**
 * The privacy note, written once. The app shows it on first launch and in
 * Settings > Privacy; scripts/make-privacy-notice.mjs turns it into the text on
 * the installer's first page (build/privacy-notice.txt, checked by a test).
 * Bump `version` when the note changes in a way users should see again.
 * Keep every statement true of the code: tests/privacy-note.test.ts and the
 * release check only guard the wording, not the behaviour.
 */
export interface PrivacySection {
  heading: string;
  paragraphs: string[];
}
export const privacyNote = {
  version: 2,
  title: "Privacy note",
  summary:
    "DriftFetch runs on your computer. It has no account, no ads and no usage tracking, and it does not send your links, history or settings to its developers or to anyone else. It contacts the websites you ask it to download from, and nothing more unless you use a feature described below.",
  sections: [
    {
      heading: "What DriftFetch keeps on your computer",
      paragraphs: [
        "Everything DriftFetch knows is stored in your Windows user profile, in the folder %APPDATA%\\DriftFetch: your download history (links, titles and where files were saved), your settings, a short log of recently captured links, and, only if you add them, saved site sign-ins and extension credentials.",
        "Saved sign-ins and credentials are encrypted with Windows' protection for your user account. A backup is created only when you export one, and it is protected by the password you choose.",
        "DriftFetch sends no crash reports, error reports or statistics to anyone.",
      ],
    },
    {
      heading: "The clipboard",
      paragraphs: [
        'While "Watch clipboard" is on (it is on by default), DriftFetch reads text you copy. It acts only on text made entirely of web links, and it ignores addresses on your own network and links that look like password-reset, verification or sign-in links.',
        "When it recognises a link, it adds it to your list and contacts that website to find out what can be downloaded. You can turn this off with the Watch clipboard switch on the Downloads page or in Settings.",
      ],
    },
    {
      heading: "Who DriftFetch contacts",
      paragraphs: [
        "The website of every link you add, and the servers that website uses to deliver its media. Those sites see your internet address and the details a download program sends, in the same way as for a browser, plus the cookies of any sign-in you saved for that site.",
        "GitHub, only when you press Update engine in Settings, to download a new yt-dlp. DriftFetch checks the maintainers' signature before it installs it.",
        "The sources of thumbnails, when it shows one in your list or in a collection preview, and the extension providers you enable, for their own websites.",
        "Nothing else. DriftFetch has no servers of its own.",
      ],
    },
    {
      heading: "The tools DriftFetch uses",
      paragraphs: [
        "DriftFetch starts yt-dlp, gallery-dl, FFmpeg and a JavaScript runtime (Deno) on your computer. They run only for links you add or open. To read some websites, yt-dlp may run that site's own player scripts in the JavaScript runtime.",
      ],
    },
    {
      heading: "Signing in to sites",
      paragraphs: [
        '"Sign in with DriftFetch" opens a browser window inside DriftFetch and keeps the session on this computer. "Import cookies.txt" stores the cookie file you choose. "Chrome session" lets DriftFetch read the cookies that your Chrome profile holds for the site you name.',
        "Saved sessions are used only for downloads from that site. Remove them at any time in Settings > Sites & sign-ins.",
      ],
    },
    {
      heading: "Diagnostic reports",
      paragraphs: [
        '"Copy diagnostic report" copies a short report to your clipboard only when you press it. It leaves out links, titles, file paths, cookies and the engine\'s raw output.',
      ],
    },
    {
      heading: "Controlling your data",
      paragraphs: [
        "Remove entries from History or the download list, clear the capture log, and remove saved accounts in Settings. Downloaded files are never deleted by these actions.",
        "Uninstalling DriftFetch keeps your data. To remove everything, delete the folder %APPDATA%\\DriftFetch after uninstalling.",
      ],
    },
    {
      heading: "Your downloads",
      paragraphs: [
        "You are responsible for downloading only content you have the right to download. DriftFetch does not try to bypass DRM or paywalls; protected videos are reported as unsupported.",
      ],
    },
    {
      heading: "Questions and changes",
      paragraphs: [
        "Questions about this note: SET-BEFORE-RELEASE",
        "If this note changes in a way that matters, DriftFetch shows it again the next time you open it.",
      ],
    },
  ] as PrivacySection[],
};

/** Plain text for the installer page, wrapped for a fixed-width box. */
export function privacyNoteText(note = privacyNote): string {
  const wrap = (text: string, width = 74) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      if (line && (line + " " + word).length > width) {
        lines.push(line);
        line = word;
      } else line = line ? line + " " + word : word;
    }
    if (line) lines.push(line);
    return lines.join("\r\n");
  };
  return (
    [
      note.title.toUpperCase(),
      "",
      wrap(note.summary),
      ...note.sections.flatMap((section) => [
        "",
        section.heading.toUpperCase(),
        ...section.paragraphs.map((p) => "\r\n" + wrap(p)),
      ]),
    ]
      .join("\r\n")
      .replace(/\r\n\r\n\r\n/g, "\r\n\r\n") + "\r\n"
  );
}
