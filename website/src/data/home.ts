// Homepage data. SAMPLES also drives the demo in src/scripts/home.ts.
const G = {
  nl: "linear-gradient(160deg,#0f3b4a 0%,#1d6b6a 55%,#0b1f33 100%)",
  lx: "linear-gradient(160deg,#6b4a2a 0%,#c79a5a 60%,#3a2a1a 100%)",
  dd: "linear-gradient(160deg,#5a3a1f 0%,#c08a4a 55%,#2a1a10 100%)",
};

export type Sample = {
  url: string; label: string; hint: string; icon: string; title: string; site: string;
  kind: "video" | "gallery" | "locked"; q?: string; mb?: number; thumb?: string;
};

export const SAMPLES: Sample[] = [
  { url: "https://youtube.com/watch?v=aBcD123", label: "youtube.com/watch?v=aBcD123", hint: "a video", icon: "film", title: "Northern Lights Timelapse — Iceland 4K", site: "youtube.com", q: "2160p", mb: 512, kind: "video", thumb: G.nl },
  { url: "https://reddit.com/r/travel/comments/lisbon", label: "reddit.com/r/travel/…/lisbon", hint: "an album", icon: "images", title: "Lisbon Travel Album", site: "reddit.com", kind: "gallery", mb: 96, thumb: G.lx },
  { url: "https://vimeo.com/123456", label: "vimeo.com/123456", hint: "a video", icon: "film", title: "Desert Drone Flight", site: "vimeo.com", q: "1080p", mb: 182, kind: "video", thumb: G.dd },
  { url: "https://patreon.com/posts/members-only-qa", label: "patreon.com/posts/members-only", hint: "needs sign-in", icon: "lock", title: "Members-only Q&A", site: "patreon.com", kind: "locked" },
];

export const FAQ = [
  { q: "Is it really free?", a: "Yes. DriftFetch is MIT-licensed open source with no ads, trials or paid features. The tools it bundles keep their own open-source licences." },
  { q: "Which sites does it work with?", a: "Sites that yt-dlp and gallery-dl support, such as YouTube, Vimeo, Internet Archive and Dailymotion. Some sites need you to sign in once inside the app." },
  { q: "Do I need an account?", a: "No. There’s nothing to sign up for. If a site needs a sign-in, it’s stored encrypted on your PC and never sent anywhere else." },
  { q: "Mac or Linux?", a: "Not yet. DriftFetch is built and tested for Windows 10 and 11 only." },
  { q: "Where do my files go?", a: "To Downloads\DriftFetch by default, in a folder per site. You can change the folder, the sorting and the file names in Settings." },
  { q: "Is downloading allowed?", a: "Only save content you have the right to keep, and follow each site’s terms. DriftFetch doesn’t remove DRM or get around paywalls." },
];

const msg = "DriftFetch: copy a link and it downloads. Free and private, for Windows.";
const enc = encodeURIComponent;
export const shareLinks = (siteUrl: string) => [
  { label: "X", href: `https://x.com/intent/post?text=${enc(msg)}&url=${enc(siteUrl)}` },
  { label: "Reddit", href: `https://www.reddit.com/submit?url=${enc(siteUrl)}&title=${enc(msg)}` },
  { label: "WhatsApp", href: `https://wa.me/?text=${enc(msg + " " + siteUrl)}` },
  { label: "Email", href: `mailto:?subject=${enc("Try DriftFetch")}&body=${enc(msg + "\n" + siteUrl)}` },
];
