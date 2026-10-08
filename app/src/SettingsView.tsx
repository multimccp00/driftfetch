import { useEffect, useState, type ReactNode } from "react";
import {
  AppWindow,
  Archive,
  ArrowDownToLine,
  Bell,
  CalendarClock,
  Chrome,
  ChevronDown,
  Clipboard,
  Clock,
  FileUp,
  Folder,
  FolderOpen,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  PanelBottom,
  Plus,
  Power,
  Puzzle,
  RotateCw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { ConfirmButton } from "./ConfirmButton";
import { Modal } from "./Modal";
import { PrivacyNote } from "./PrivacyNote";
import type { Settings, Snapshot } from "./shared";
import { Switch, radioKeys } from "./ui";
import { when } from "./format";

export type SettingsSection = "downloads" | "quality" | "sites" | "advanced";

const sections: {
  key: SettingsSection;
  icon: ReactNode;
  label: string;
  hint: string;
  title: string;
  desc: string;
}[] = [
  {
    key: "downloads",
    icon: <ArrowDownToLine size={16} />,
    label: "Downloads",
    hint: "Clipboard, auto-start, timing",
    title: "Downloads",
    desc: "What DriftFetch does when you copy a link, and when it tells you about it.",
  },
  {
    key: "quality",
    icon: <SlidersHorizontal size={16} />,
    label: "Quality & files",
    hint: "Resolution, folders, names",
    title: "Quality & files",
    desc: "How good downloads are and where they’re saved. Changes apply to downloads that haven’t started yet.",
  },
  {
    key: "sites",
    icon: <KeyRound size={16} />,
    label: "Sites & sign-ins",
    hint: "Accounts and per-site rules",
    title: "Sites & sign-ins",
    desc: "Sign in once for sites that need it, and set rules for particular sites.",
  },
  {
    key: "advanced",
    icon: <Wrench size={16} />,
    label: "Advanced",
    hint: "Speed, engine, backup, privacy",
    title: "Advanced",
    desc: "Things most people never need to change.",
  },
];

type Tone = "default" | "hi" | "muted" | "danger";
interface Row {
  id: string;
  section: SettingsSection;
  group: string;
  label: string;
  desc?: string;
  /** Extra words the search also matches. */
  words?: string;
  icon?: ReactNode;
  tone?: Tone;
  lead?: string;
  control?: ReactNode;
  below?: ReactNode;
  dim?: boolean;
}

const checked = [
  ["YouTube", "Video", "Formats found · public check"],
  ["Internet Archive", "Video", "Formats found · public check"],
  ["Dailymotion", "Video", "Formats found · public check"],
  ["Wikimedia Commons", "Media file", "Formats found · public check"],
  ["PeerTube", "Video", "Formats found · public check"],
  [
    "Instagram",
    "Post, carousel, profile",
    "Uses gallery-dl · needs a public production check",
  ],
  ["Vimeo", "Video", "Needs a signed-in session for the checked page"],
  ["TED", "Talk", "Needs attention · extractor returned invalid metadata"],
  ["Rumble", "Video", "Needs attention · checked page returned 403"],
];

const speeds = [0, 256, 512, 1024, 2048, 5120, 10240];
const speedLabel = (kib: number) =>
  !kib
    ? "No limit"
    : kib >= 1024
      ? `${+(kib / 1024).toFixed(1)} MB/s`
      : `${kib} KB/s`;

const tokens = ["{title}", "{source}", "{date}", "{id}"];
const sample = (template: string) =>
  template
    .replaceAll("{title}", "Northern Lights Timelapse")
    .replaceAll("{source}", "youtube.com")
    .replaceAll("{date}", "2026-10-05")
    .replaceAll("{id}", "aBcD123");

const methodLabel = (kind: string, profile?: string) =>
  kind === "chrome"
    ? `Chrome profile · ${profile}`
    : kind === "api"
      ? "Encrypted API credentials"
      : kind === "credentials"
        ? "Encrypted account"
        : kind === "browser"
          ? "Built-in browser"
          : "Imported cookies.txt";

export function SettingsView({
  state,
  update,
  execute,
  section,
  setSection,
}: {
  state: Snapshot;
  update: (patch: Partial<Settings>) => Promise<void>;
  execute: (work: () => Promise<unknown>, success?: string) => Promise<void>;
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
}) {
  const s = state.settings;
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState(s.filenameTemplate);
  useEffect(() => setTemplate(s.filenameTemplate), [s.filenameTemplate]);

  // Sites & sign-ins
  const [domain, setDomain] = useState("");
  const [profile, setProfile] = useState(state.chromeProfiles[0] || "Default");
  const [chromeOpen, setChromeOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const extension = state.extensions.find(
    (e) => e.enabled && e.domains.includes(normalized),
  );
  const account = extension?.account;
  const knownDomains = [
    ...new Set([
      ...state.sessions.map((x) => x.domain),
      ...state.extensions.filter((e) => e.enabled).flatMap((e) => e.domains),
    ]),
  ].sort();
  useEffect(() => setValues({}), [normalized, extension?.id]);
  const connect = (work: () => Promise<unknown>) =>
    execute(async () => {
      setConnecting(true);
      try {
        await work();
      } finally {
        setConnecting(false);
      }
    });
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleSource, setRuleSource] = useState("");
  const [ruleQuality, setRuleQuality] = useState<Settings["quality"]>(
    s.quality,
  );
  const [ruleSpeed, setRuleSpeed] = useState(String(s.speedLimitKiB));
  const [ruleConnections, setRuleConnections] = useState(s.fragmentConcurrency);
  const [ruleSimultaneous, setRuleSimultaneous] = useState(0);
  const [ruleDelay, setRuleDelay] = useState(0);
  const [ruleFolder, setRuleFolder] = useState("");
  const [ruleAuto, setRuleAuto] = useState(s.autoDownload);
  const [results, setResults] = useState(false);

  // Backup and privacy
  const [backup, setBackup] = useState<"export" | "restore">();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [backupWorking, setBackupWorking] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const closeBackup = () => {
    if (backupWorking) return;
    setBackup(undefined);
    setPassword("");
    setConfirmPassword("");
  };
  const runBackup = (action: "export" | "restore") =>
    execute(async () => {
      setBackupWorking(true);
      try {
        const message = await window.current.backup(action, password);
        setBackup(undefined);
        setPassword("");
        setConfirmPassword("");
        await execute(async () => {}, message);
      } finally {
        setBackupWorking(false);
      }
    });

  const btn = (
    label: ReactNode,
    onClick: () => void,
    kind?: "primary" | "danger",
    disabled?: boolean,
    props?: { "aria-label"?: string },
  ) => (
    <button
      className={`btn ${kind ?? ""}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {label}
    </button>
  );
  const select = (
    label: string,
    value: string | number,
    options: [string | number, string][],
    onChange: (value: string) => void,
  ) => (
    <label className="select-field wide">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
  const cards = (
    name: string,
    value: number,
    items: [string, string, string?][],
    pick: (index: number) => void,
  ) => (
    <div
      className="cards"
      role="radiogroup"
      aria-label={name}
      onKeyDown={radioKeys}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(([title, desc, tag], i) => (
        <button
          key={title}
          role="radio"
          aria-checked={value === i}
          tabIndex={value === i ? 0 : -1}
          className={`card-option ${value === i ? "on" : ""}`}
          onClick={() => pick(i)}
        >
          <span className="radio" />
          <span className="card-text">
            <span className="card-title">
              {title}
              {tag && <span className="tag">{tag}</span>}
            </span>
            <span className="card-desc">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
  const seg = (
    name: string,
    value: string,
    options: [string, string][],
    pick: (value: string) => void,
  ) => (
    <div
      className="seg"
      role="radiogroup"
      aria-label={name}
      onKeyDown={radioKeys}
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          tabIndex={value === v ? 0 : -1}
          className={value === v ? "on" : ""}
          onClick={() => pick(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
  const toggle = (label: string, value: boolean, patch: keyof Settings) => (
    <Switch
      label={label}
      hideLabel
      value={value}
      onChange={(v) => update({ [patch]: v } as Partial<Settings>)}
    />
  );
  const commitTemplate = () => {
    if (template === s.filenameTemplate) return;
    // Keep {id}: the engine refuses a name that cannot tell videos apart.
    if (!template.includes("{id}")) setTemplate(s.filenameTemplate);
    void update({ filenameTemplate: template });
  };
  const folderPath = (value: string, extra?: ReactNode) => (
    <div className="path-field">
      <div className="path-box">
        <Folder size={15} />
        <code title={value}>{value || "Not set"}</code>
      </div>
      {extra}
    </div>
  );
  const saveRule = () => {
    const source = ruleSource
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    void execute(async () => {
      await window.current.settings({
        sourceRules: [
          ...s.sourceRules.filter((rule) => rule.source !== source),
          {
            source,
            quality: ruleQuality,
            speedLimitKiB: Number(ruleSpeed),
            fragmentConcurrency: ruleConnections,
            maxSimultaneous: ruleSimultaneous || undefined,
            requestDelaySec: ruleDelay || undefined,
            downloadDir: ruleFolder.trim() || undefined,
            autoDownload: ruleAuto,
          },
        ],
      });
      setRuleSource("");
      setRuleFolder("");
      setRuleSimultaneous(0);
      setRuleDelay(0);
      setRuleOpen(false);
    }, "Site rule saved.");
  };
  const ruleSummary = (rule: Settings["sourceRules"][number]) =>
    [
      rule.quality === "best"
        ? "Best"
        : rule.quality
          ? `Up to ${rule.quality}p`
          : "Global quality",
      rule.speedLimitKiB ? speedLabel(rule.speedLimitKiB) : "No speed limit",
      `${rule.fragmentConcurrency || 1} connection${(rule.fragmentConcurrency || 1) === 1 ? "" : "s"}`,
      rule.maxSimultaneous ? `${rule.maxSimultaneous} at a time` : "",
      rule.requestDelaySec ? `${rule.requestDelaySec} s between requests` : "",
      rule.autoDownload === false ? "review first" : "starts automatically",
      rule.downloadDir ? `saves to ${rule.downloadDir}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const tools: [string, string, boolean, string][] = [
    [
      "yt-dlp",
      state.engine.version || "Not installed",
      state.engine.available,
      "Finds videos and formats",
    ],
    [
      "gallery-dl",
      "Bundled",
      state.engine.available,
      "Finds images in galleries and profiles",
    ],
    [
      "FFmpeg",
      "Remux-only · LGPLv3",
      state.engine.ffmpegAvailable,
      "Joins audio and video",
    ],
    [
      "Deno",
      state.engine.jsRuntimeVersion || "Bundled",
      state.engine.jsRuntimeAvailable,
      "Runs scripts some sites need",
    ],
  ];

  const rows: Row[] = [
    // ---------- Downloads ----------
    {
      id: "clipboard",
      section: "downloads",
      group: "Picking up links",
      label: "Watch clipboard",
      desc: "Picks up video and gallery links you copy in any app while DriftFetch is open or in the tray.",
      icon: <Clipboard size={17} />,
      tone: "hi",
      control: toggle("Watch clipboard", s.clipboardWatch, "clipboardWatch"),
    },
    {
      id: "popup",
      section: "downloads",
      group: "Picking up links",
      label: "Show a popup when a link is picked up",
      desc: "A small window near the tray shows what was found.",
      icon: <PanelBottom size={17} />,
      control: toggle(
        "Link notifications",
        s.captureNotifications,
        "captureNotifications",
      ),
    },
    {
      id: "single",
      section: "downloads",
      group: "Single videos",
      label: "When you copy a video link",
      words: "auto-download automatically start",
      below: cards(
        "When you copy a video link",
        s.autoDownload ? 0 : 1,
        [
          [
            "Start right away",
            "Downloads at your default quality as soon as it’s found.",
            "Recommended",
          ],
          [
            "Wait in my list",
            "Shows as Ready so you can pick quality first, then press Start.",
          ],
        ],
        (i) => void update({ autoDownload: i === 0 }),
      ),
    },
    {
      id: "gallery",
      section: "downloads",
      group: "Galleries, playlists and profiles",
      label: "When a link has several items",
      words: "collection album playlist images",
      below: cards(
        "When a link has several items",
        s.autoDownloadCollections ? 1 : 0,
        [
          ["Let me choose", "Opens the picker so you can tick what you want."],
          [
            "Download every image",
            "Image galleries start straight away. Playlists, channels and profiles still open the picker.",
          ],
        ],
        (i) => void update({ autoDownloadCollections: i === 1 }),
      ),
    },
    {
      id: "preview",
      section: "downloads",
      group: "Galleries, playlists and profiles",
      label: "Preview before downloading",
      desc: "Shows thumbnails and lets you choose items before a gallery or collection starts. This takes priority over automatic gallery downloads and site rules.",
      control: toggle(
        "Preview collections",
        s.previewCollections,
        "previewCollections",
      ),
    },
    {
      id: "finish",
      section: "downloads",
      group: "Finishing and problems",
      label: "When a download finishes",
      desc: "A Windows notification, or nothing.",
      icon: <Bell size={17} />,
      control: select(
        "Completion action",
        s.completionAction,
        [
          ["notify", "Show notification"],
          ["none", "Do nothing"],
        ],
        (v) =>
          void update({ completionAction: v as Settings["completionAction"] }),
      ),
    },
    {
      id: "retry",
      section: "downloads",
      group: "Finishing and problems",
      label: "Retry automatically",
      desc: "Temporary network and server failures retry up to three times, after 15, 30 and 60 seconds, and DriftFetch waits when a site asks it to slow down. Access and disk errors wait for you.",
      icon: <RotateCw size={17} />,
      control: toggle(
        "Automatic retries",
        s.automaticRetries,
        "automaticRetries",
      ),
    },
    {
      id: "schedule",
      section: "downloads",
      group: "Schedule",
      label: "Only download at certain times",
      desc: "Uses this PC’s local time while DriftFetch is running. Transfers wait outside the window; active transfers keep their partial files. Manually paused items stay paused.",
      icon: <CalendarClock size={17} />,
      control: toggle(
        "Download schedule",
        s.scheduleEnabled,
        "scheduleEnabled",
      ),
      below: (
        <div className={`times ${s.scheduleEnabled ? "" : "dim"}`}>
          <span>From</span>
          <label className="time-field">
            <Clock size={14} />
            <input
              aria-label="Schedule start"
              type="time"
              value={s.scheduleStart}
              onChange={(e) =>
                e.target.value && void update({ scheduleStart: e.target.value })
              }
            />
          </label>
          <span>to</span>
          <label className="time-field">
            <Clock size={14} />
            <input
              aria-label="Schedule stop"
              type="time"
              value={s.scheduleEnd}
              onChange={(e) =>
                e.target.value && void update({ scheduleEnd: e.target.value })
              }
            />
          </label>
          <span className="muted">
            {s.scheduleEnabled ? "Every day" : "Turn on to use"}
          </span>
        </div>
      ),
    },

    // ---------- Quality & files ----------
    {
      id: "quality",
      section: "quality",
      group: "Video quality",
      label: "Download videos at",
      words: "resolution 1080 720 best",
      below: cards(
        "Download videos at",
        ["best", "1080", "720"].indexOf(s.quality),
        [
          [
            "Best available",
            "Highest the site offers, up to 4K. Audio and video are joined without re-encoding.",
            "Recommended",
          ],
          [
            "Up to 1080p",
            "Full HD. Smaller files, still sharp on most screens.",
          ],
          [
            "Up to 720p",
            "Saves space and bandwidth. Good for laptops and phones.",
          ],
        ],
        (i) => void update({ quality: (["best", "1080", "720"] as const)[i] }),
      ),
    },
    {
      id: "warn",
      section: "quality",
      group: "Video quality",
      label: "Warn me when a video is lower than",
      desc: "Shows an amber badge on the row. Never blocks the download.",
      control: select(
        "Quality warning threshold",
        s.warnBelowHeight,
        [
          [720, "720p"],
          [1080, "1080p"],
          [0, "Only if unknown or mismatched"],
        ],
        (v) => void update({ warnBelowHeight: Number(v) }),
      ),
    },
    {
      id: "folder",
      section: "quality",
      group: "Where files go",
      label: "Download folder",
      desc: "New downloads are saved here. Files already saved stay where they are.",
      below: folderPath(
        s.downloadDir,
        <>
          {btn(
            <>
              <FolderOpen size={14} /> Open
            </>,
            () => void execute(() => window.current.openFolder()),
          )}
          {btn(
            "Change…",
            () =>
              void execute(async () => {
                const folder = await window.current.chooseFolder();
                if (folder)
                  await window.current.settings({ downloadDir: folder });
              }),
          )}
        </>,
      ),
    },
    {
      id: "grouping",
      section: "quality",
      group: "Where files go",
      label: "Sort into folders",
      desc: "Uses the site that hosts the video, even if you copied the link somewhere else.",
      control: seg(
        "Sort into folders",
        s.grouping,
        [
          ["source", "By site"],
          ["date", "By date"],
          ["none", "None"],
        ],
        (v) => void update({ grouping: v as Settings["grouping"] }),
      ),
      below: (
        <div className="example">
          <span>Example</span>
          <code>
            {`…\\DriftFetch${s.grouping === "source" ? "\\youtube.com" : s.grouping === "date" ? "\\2026-10-05" : ""}\\${sample(s.filenameTemplate)}.mp4`}
          </code>
        </div>
      ),
    },
    {
      id: "names",
      section: "quality",
      group: "Where files go",
      label: "File names",
      desc: "How new files are named. Keep {id} so each video stays identifiable. A short suffix prevents overwrites.",
      below: (
        <div className="template">
          <div className="input-row">
            <input
              className="mono-input"
              aria-label="Filename template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              onBlur={commitTemplate}
              onKeyDown={(e) => e.key === "Enter" && commitTemplate()}
            />
          </div>
          <div className="chips">
            <span>Insert</span>
            {tokens.map((token) => (
              <button
                key={token}
                className="chip"
                onClick={() => {
                  const next = template.includes(token)
                    ? template
                    : `${template} ${token}`.trim();
                  setTemplate(next);
                  void update({ filenameTemplate: next });
                }}
              >
                {token}
              </button>
            ))}
          </div>
          <div className="example">
            <span>Preview</span>
            <code>{sample(template)}.mp4</code>
          </div>
        </div>
      ),
    },
    {
      id: "watch-folder",
      section: "quality",
      group: "Import from a folder",
      label: "Watch a folder for .txt link lists",
      desc:
        s.folderWatchDir ||
        "Drop a .txt file with one link per line. DriftFetch adds the links once, then moves the file into a “processed” folder.",
      control: btn(
        "Choose folder…",
        () =>
          void execute(async () => {
            const folder = await window.current.chooseFolderWatch();
            if (folder)
              await window.current.settings({ folderWatchDir: folder });
          }),
      ),
    },

    // ---------- Sites & sign-ins ----------
    ...state.sessions.map<Row>((saved) => ({
      id: `session-${saved.domain}`,
      section: "sites",
      group: `Signed-in sites · ${state.sessions.length}`,
      label: saved.domain,
      desc: `${methodLabel(saved.kind, saved.profile)} · saved ${when(saved.updatedAt)}${
        ["api", "credentials"].includes(saved.kind) &&
        !state.extensions.some(
          (e) => e.enabled && e.domains.includes(saved.domain),
        )
          ? " · Enable a matching extension to use this account."
          : ""
      }`,
      lead: saved.domain[0].toUpperCase(),
      control: (
        <span className="btn-row">
          {btn("Update", () => {
            setValues({});
            setDomain(saved.domain);
            document
              .getElementById("sign-in-card")
              ?.scrollIntoView({ block: "nearest" });
          })}
          <ConfirmButton
            className="btn danger"
            title={`Remove session for ${saved.domain}`}
            aria-label={`Remove session for ${saved.domain}`}
            confirmLabel="Remove? You must sign in again"
            onConfirm={() =>
              void execute(() => window.current.removeSession(saved.domain))
            }
          >
            Remove
          </ConfirmButton>
        </span>
      ),
    })),
    ...s.sourceRules.map<Row>((rule) => ({
      id: `rule-${rule.source}`,
      section: "sites",
      group: `Site rules · ${s.sourceRules.length}`,
      label: rule.source,
      desc: ruleSummary(rule),
      lead: rule.source[0].toUpperCase(),
      control: (
        <span className="btn-row">
          {btn("Edit", () => {
            setRuleSource(rule.source);
            setRuleQuality(rule.quality ?? s.quality);
            setRuleSpeed(String(rule.speedLimitKiB ?? 0));
            setRuleConnections(rule.fragmentConcurrency ?? 1);
            setRuleSimultaneous(rule.maxSimultaneous ?? 0);
            setRuleDelay(rule.requestDelaySec ?? 0);
            setRuleFolder(rule.downloadDir ?? "");
            setRuleAuto(rule.autoDownload ?? s.autoDownload);
            setRuleOpen(true);
          })}
          <ConfirmButton
            className="icon-button"
            title={`Remove rule for ${rule.source}`}
            aria-label={`Remove rule for ${rule.source}`}
            confirmLabel="Remove rule?"
            onConfirm={() =>
              void update({
                sourceRules: s.sourceRules.filter(
                  (item) => item.source !== rule.source,
                ),
              })
            }
          >
            <Trash2 size={16} />
          </ConfirmButton>
        </span>
      ),
    })),
    {
      id: "add-rule",
      section: "sites",
      group: `Site rules · ${s.sourceRules.length}`,
      label: "Add a rule",
      desc: "Set quality, speed, connections, downloads at once, a pause between requests, a folder and auto-start for one site.",
      words: "site rule per-source",
      lead: "+",
      control: btn(ruleOpen ? "Close" : "Add rule", () =>
        setRuleOpen(!ruleOpen),
      ),
      below: ruleOpen ? (
        <div className="rule-grid">
          <label>
            Site
            <input
              aria-label="Rule source"
              value={ruleSource}
              onChange={(e) => setRuleSource(e.target.value)}
              placeholder="example.com"
            />
          </label>
          <label>
            Quality
            <select
              aria-label="Rule quality"
              value={ruleQuality}
              onChange={(e) =>
                setRuleQuality(e.target.value as Settings["quality"])
              }
            >
              <option value="best">Best quality</option>
              <option value="1080">Up to 1080p</option>
              <option value="720">Up to 720p</option>
            </select>
          </label>
          <label>
            Speed limit (KiB/s, 0 is none)
            <input
              aria-label="Rule speed in KiB per second"
              type="number"
              min="0"
              max="1000000"
              value={ruleSpeed}
              onChange={(e) => setRuleSpeed(e.target.value)}
            />
          </label>
          <label>
            Connections
            <select
              aria-label="Rule connections"
              value={ruleConnections}
              onChange={(e) => setRuleConnections(Number(e.target.value))}
            >
              {[1, 2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n} connection{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label>
            At the same time
            <select
              aria-label="Rule simultaneous downloads"
              value={ruleSimultaneous}
              onChange={(e) => setRuleSimultaneous(Number(e.target.value))}
            >
              <option value={0}>No per-site limit</option>
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n} at a time
                </option>
              ))}
            </select>
          </label>
          <label>
            Pause between requests
            <select
              aria-label="Rule pause between requests"
              value={ruleDelay}
              onChange={(e) => setRuleDelay(Number(e.target.value))}
            >
              <option value={0}>No pause</option>
              {[1, 2, 5, 10, 30].map((n) => (
                <option key={n} value={n}>
                  {n} s between requests
                </option>
              ))}
            </select>
          </label>
          <label className="wide-field">
            Folder
            <span className="input-row">
              <input
                aria-label="Rule download folder"
                value={ruleFolder}
                onChange={(e) => setRuleFolder(e.target.value)}
                placeholder="Default download folder"
              />
              {btn(
                <>
                  <Folder size={14} /> Choose…
                </>,
                () =>
                  void execute(async () => {
                    const folder = await window.current.chooseFolder();
                    if (folder) setRuleFolder(folder);
                  }),
              )}
            </span>
          </label>
          <label className="check-line wide-field">
            <input
              aria-label="Auto-download for site"
              type="checkbox"
              checked={ruleAuto}
              onChange={(e) => setRuleAuto(e.target.checked)}
            />
            Start single links automatically
          </label>
          <div className="wide-field btn-row end">
            {btn("Save rule", saveRule, "primary", !ruleSource.trim())}
          </div>
        </div>
      ) : undefined,
    },
    {
      id: "compat",
      section: "sites",
      group: "Compatibility",
      label: "Checked sites",
      desc: "YouTube, Internet Archive, Dailymotion, Wikimedia Commons, PeerTube and more were checked in September 2026. Some sites need a sign-in. These are real checks, not a promise that every link will work (details in docs/SUPPORT-MATRIX.md).",
      words: "compatibility supported",
      control: btn(results ? "Hide results" : "View results", () =>
        setResults(!results),
      ),
      below: results ? (
        <div className="compat">
          {checked.map(([site, kind, result]) => (
            <div key={site} className="compat-row">
              <strong>{site}</strong>
              <span>
                {kind} · {result}
              </span>
              <span
                className={`status-chip ${result.startsWith("Formats") ? "ok" : "wait"}`}
              >
                <span className="dot" />
                {result.startsWith("Formats") ? "Checked" : "Review"}
              </span>
            </div>
          ))}
        </div>
      ) : undefined,
    },

    // ---------- Advanced ----------
    {
      id: "concurrency",
      section: "advanced",
      group: "Speed",
      label: "Downloads at the same time",
      desc: "Others wait in line until one finishes. Lower this if a site limits requests or your connection is busy.",
      control: seg(
        "Downloads at the same time",
        String(s.concurrency),
        [
          ...[1, 2, 3, 4, 5].map((n): [string, string] => [
            String(n),
            String(n),
          ]),
          ...(s.concurrency === 0 || s.concurrency > 5
            ? ([
                [
                  String(s.concurrency),
                  s.concurrency ? String(s.concurrency) : "No limit",
                ],
              ] as [string, string][])
            : []),
        ],
        (v) => void update({ concurrency: Number(v) }),
      ),
    },
    {
      id: "connections",
      section: "advanced",
      group: "Speed",
      label: "Connections per download",
      desc: "More can be faster for segmented streams, but some sites limit them.",
      control: select(
        "Connections per stream",
        s.fragmentConcurrency,
        [1, 2, 4, 6, 8].map((n) => [
          n,
          n === 1 ? "1 connection" : `${n} connections`,
        ]),
        (v) => void update({ fragmentConcurrency: Number(v) }),
      ),
    },
    {
      id: "speed",
      section: "advanced",
      group: "Speed",
      label: "Speed limit",
      desc: "Per download. Keeps some bandwidth free for everything else. Applies when a transfer starts or resumes.",
      control: select(
        "Speed limit in KiB per second",
        s.speedLimitKiB,
        [...new Set([...speeds, s.speedLimitKiB])]
          .sort((a, b) => a - b)
          .map((n) => [n, speedLabel(n)]),
        (v) => void update({ speedLimitKiB: Number(v) }),
      ),
    },
    {
      id: "engine",
      section: "advanced",
      group: "Download engine",
      label: "Tools DriftFetch uses",
      desc: "Updated separately from the app. New versions are checked against the maintainers’ signature before installing. Pause active work before updating.",
      control: (
        <span className="btn-row">
          {btn(
            "Restore previous",
            () => void execute(() => window.current.engineAction("rollback")),
            undefined,
            !state.engine.canRollback || state.engine.busy,
          )}
          {btn(
            state.engine.busy ? "Working…" : "Check for updates",
            () => void execute(() => window.current.engineAction("update")),
            "primary",
            state.engine.busy,
          )}
        </span>
      ),
      below: (
        <>
          <div className="tools">
            {tools.map(([name, version, ready, purpose]) => (
              <div key={name} className="tool">
                <div className="tool-top">
                  <strong>{name}</strong>
                  <span className={`ready ${ready ? "ok" : "bad"}`}>
                    <span className="dot" />
                    {ready ? "Ready" : "Missing"}
                  </span>
                </div>
                <code>{version}</code>
                <span>{purpose}</span>
              </div>
            ))}
          </div>
          {state.engine.message && (
            <div className="note">{state.engine.message}</div>
          )}
        </>
      ),
    },
    {
      id: "extensions-add",
      section: "advanced",
      group: "Extensions",
      label: state.extensions.length
        ? `${state.extensions.length} extension${state.extensions.length === 1 ? "" : "s"} installed`
        : "No extensions installed",
      desc: "Extensions add support for extra sites. They run in a restricted process and start turned off. They can use the network and receive the saved login for their own sites. Only add ones from people you trust.",
      icon: <Puzzle size={17} />,
      tone: "muted",
      words: "extension plugin provider",
      control: btn(
        <>
          <Plus size={14} /> Add extension file…
        </>,
        () => void execute(() => window.current.importExtension()),
      ),
    },
    ...state.extensions.map<Row>((extension) => ({
      id: `extension-${extension.id}`,
      section: "advanced",
      group: "Extensions",
      label: `${extension.name} · ${extension.version}`,
      desc: `${extension.domains.join(", ")} · ${extension.enabled ? "Enabled" : "Disabled"}${extension.error ? ` · ${extension.error}` : ""}`,
      lead: extension.name[0]?.toUpperCase(),
      control: (
        <span className="btn-row">
          {btn(
            extension.enabled ? "Disable" : "Enable",
            () =>
              void execute(() =>
                window.current.extensionAction(
                  extension.id,
                  extension.enabled ? "disable" : "enable",
                ),
              ),
          )}
          <ConfirmButton
            className="icon-button"
            title={`Remove ${extension.name}`}
            aria-label={`Remove ${extension.name}`}
            confirmLabel="Remove? It must be re-added"
            onConfirm={() =>
              void execute(() =>
                window.current.extensionAction(extension.id, "remove"),
              )
            }
          >
            <Trash2 size={16} />
          </ConfirmButton>
        </span>
      ),
    })),
    {
      id: "backup",
      section: "advanced",
      group: "Backup & privacy",
      label: "Encrypted backup",
      desc: "Settings, links and history. Not sign-ins or video files. The password can’t be recovered.",
      icon: <Archive size={17} />,
      control: (
        <span className="btn-row">
          {btn("Restore…", () => setBackup("restore"))}
          {btn("Export…", () => setBackup("export"))}
        </span>
      ),
    },
    {
      id: "privacy",
      section: "advanced",
      group: "Backup & privacy",
      label: "Privacy",
      desc: "No account, no ads, no tracking. Everything stays in %APPDATA%\\DriftFetch on this PC.",
      icon: <ShieldCheck size={17} />,
      control: btn("Read privacy note", () => setPrivacyOpen(true)),
    },
    {
      id: "licences",
      section: "advanced",
      group: "Backup & privacy",
      label: "Open-source licences",
      desc: "DriftFetch is MIT-licensed. FFmpeg (LGPL), yt-dlp, gallery-dl and the other bundled tools keep their own licences, and the source offer explains how to get their source code.",
      icon: <Scale size={17} />,
      control: btn(
        "Open licence folder",
        () => void execute(() => window.current.openLicenses()),
      ),
    },
    {
      id: "theme",
      section: "advanced",
      group: "App",
      label: "Appearance",
      desc: "Dark, light, or the same as Windows.",
      icon: <Moon size={17} />,
      words: "theme dark light mode",
      control: seg(
        "Appearance",
        s.theme,
        [
          ["dark", "Dark"],
          ["light", "Light"],
          ["system", "System"],
        ],
        (v) => void update({ theme: v as Settings["theme"] }),
      ),
    },
    {
      id: "login",
      section: "advanced",
      group: "App",
      label: "Open DriftFetch when Windows starts",
      desc: "Starts quietly in the tray, ready to pick up links.",
      icon: <Power size={17} />,
      control: toggle("Launch with Windows", s.launchAtLogin, "launchAtLogin"),
    },
    {
      id: "update",
      section: "advanced",
      group: "App",
      label: `DriftFetch ${state.appVersion}`,
      desc: "Use one desktop shortcut. To update, choose a newer DriftFetch installer and keep its .sha256 file beside it. DriftFetch saves and closes its workers before starting the installer.",
      icon: <AppWindow size={17} />,
      control: (
        <span className="btn-row">
          {btn(
            "Create desktop shortcut",
            () =>
              void execute(
                () => window.current.appAction("shortcut"),
                "Desktop shortcut updated.",
              ),
          )}
          {btn(
            "Install app update…",
            () => void execute(() => window.current.appAction("update")),
          )}
        </span>
      ),
    },
    {
      id: "quit",
      section: "advanced",
      group: "App",
      label: "Quit DriftFetch",
      desc: "Closing the window keeps DriftFetch in the tray. Quitting also stops the clipboard watcher.",
      icon: <LogOut size={17} />,
      tone: "danger",
      control: btn(
        "Quit",
        () => void execute(() => window.current.windowAction("quit")),
        "danger",
        false,
        {
          "aria-label": "Quit DriftFetch",
        },
      ),
    },
  ];

  const term = query.trim().toLowerCase();
  const searching = term.length > 0;
  const visibleRows = rows.filter((row) =>
    searching
      ? `${row.label} ${row.desc ?? ""} ${row.group} ${row.words ?? ""}`
          .toLowerCase()
          .includes(term)
      : row.section === section,
  );
  const currentSection = sections.find((x) => x.key === section)!;
  // Group rows in order of first appearance, per section when searching.
  const blocks: { key: string; title: string; rows: Row[] }[] = [];
  for (const row of visibleRows) {
    const key = `${row.section}/${row.group}`;
    let block = blocks.find((b) => b.key === key);
    if (!block) blocks.push((block = { key, title: row.group, rows: [] }));
    block.rows.push(row);
  }

  const hero = (!searching || /sign|account|cookie|login/.test(term)) &&
    (searching || section === "sites") && (
      <div className="hero" id="sign-in-card">
        <div className="hero-head">
          <span className="hero-key">
            <KeyRound size={20} strokeWidth={2} />
          </span>
          <div>
            <h3>Sign in to a site</h3>
            <p>
              Instagram, Reddit, Patreon and other sites need a sign-in for
              private or members-only posts. Do it once here and DriftFetch
              remembers it.
            </p>
          </div>
        </div>
        <div className="hero-body">
          <label className="hero-domain">
            Site
            <input
              aria-label="Source domain"
              list="account-domains"
              placeholder="example.com"
              value={domain}
              disabled={connecting}
              onChange={(e) => setDomain(e.target.value)}
            />
            <datalist id="account-domains">
              {knownDomains.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          {account && (
            <div className="hero-fields">
              {account.fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                  <input
                    aria-label={field.label}
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={4096}
                    value={values[field.key] || ""}
                    disabled={connecting}
                    onChange={(e) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          <div className="btn-row wrap">
            {account && (
              <button
                className="btn primary lg"
                disabled={
                  connecting ||
                  account.fields.some(
                    (f) => f.required && !values[f.key]?.trim(),
                  )
                }
                onClick={() =>
                  void connect(async () => {
                    await window.current.saveAccount(normalized, values);
                    setValues({});
                  })
                }
              >
                <ShieldCheck size={16} strokeWidth={2} />
                Save account
              </button>
            )}
            <button
              className={`btn lg ${account ? "" : "primary"}`}
              disabled={connecting || !normalized}
              onClick={() =>
                void connect(() => window.current.browserSession(normalized))
              }
            >
              <AppWindow size={16} strokeWidth={2} />
              Sign in with built-in browser
            </button>
            <button
              className="btn lg"
              disabled={connecting || !normalized}
              onClick={() =>
                void connect(() => window.current.importSession(normalized))
              }
            >
              <FileUp size={15} />
              Import cookies.txt
            </button>
            <button
              className="btn lg"
              disabled={connecting || !normalized}
              aria-expanded={chromeOpen}
              onClick={() => setChromeOpen(!chromeOpen)}
            >
              <Chrome size={15} />
              Use a Chrome profile
            </button>
          </div>
          {chromeOpen && (
            <div className="hero-chrome">
              <label className="select-field wide">
                <select
                  aria-label="Chrome profile"
                  value={profile}
                  disabled={connecting}
                  onChange={(e) => setProfile(e.target.value)}
                >
                  {state.chromeProfiles.length ? (
                    state.chromeProfiles.map((p) => (
                      <option key={p}>{p}</option>
                    ))
                  ) : (
                    <option>No Chrome profiles found</option>
                  )}
                </select>
                <ChevronDown size={14} />
              </label>
              <button
                className="btn"
                disabled={
                  connecting || !normalized || !state.chromeProfiles.length
                }
                onClick={() =>
                  void connect(() =>
                    window.current.chromeSession(normalized, profile),
                  )
                }
              >
                Connect Chrome
              </button>
              <span className="fine">
                Chrome usually blocks other apps from reading its cookies on
                Windows. If this fails, sign in with the built-in browser or
                import cookies.txt.
              </span>
            </div>
          )}
          {!normalized && (
            <p className="fine">Type the site's address above to continue.</p>
          )}
          <div className="lock-line">
            <Lock size={12} />
            Encrypted with your Windows account. Never leaves this PC.
          </div>
          <p className="fine">
            For the built-in browser, log in and close the window to save the
            session. Saving another connection for a site replaces the earlier
            one.
          </p>
        </div>
      </div>
    );

  return (
    <div className="settings-page">
      <div className="settings-head">
        <div className="grow">
          <h1>Settings</h1>
          <p>Changes save as you make them.</p>
        </div>
        <label className="field search-field settings-search">
          <Search size={14} />
          <input
            aria-label="Search settings"
            placeholder="Search settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="bare"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
      </div>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.key}
              className={!searching && item.key === section ? "active" : ""}
              aria-current={
                !searching && item.key === section ? "page" : undefined
              }
              onClick={() => {
                setQuery("");
                setSection(item.key);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <div className="settings-inner">
            <h2>
              {searching
                ? visibleRows.length
                  ? `Results for “${query.trim()}”`
                  : "No matching settings"
                : currentSection.title}
            </h2>
            <p className="section-desc">
              {searching ? "Searching every section." : currentSection.desc}
            </p>
            {hero}
            {blocks.map((block) => (
              <div className="sgroup" key={block.key}>
                <div className="sgroup-title">
                  {searching
                    ? `${sections.find((x) => x.key === block.key.split("/")[0])!.label} · ${block.title}`
                    : block.title}
                </div>
                <div className="scard">
                  {block.rows.map((row) => (
                    <div className="srow" key={row.id}>
                      {row.icon && (
                        <span className={`lead tone-${row.tone ?? "default"}`}>
                          {row.icon}
                        </span>
                      )}
                      {row.lead && (
                        <span className="lead-letter">{row.lead}</span>
                      )}
                      <div className="srow-text">
                        <div className="srow-label">{row.label}</div>
                        {row.desc && (
                          <div className="srow-desc">{row.desc}</div>
                        )}
                      </div>
                      {row.control}
                      {row.below && (
                        <div
                          className={`srow-below ${row.icon ? "indent" : ""} ${row.dim ? "dim" : ""}`}
                        >
                          {row.below}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {backup && (
        <Modal
          title={
            backup === "export" ? "Export encrypted backup" : "Restore backup"
          }
          subtitle={
            backup === "export"
              ? "Choose a password. It can’t be recovered if you forget it."
              : "Enter the password you used when you exported the backup."
          }
          close={closeBackup}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void runBackup(backup);
            }}
          >
            <label>
              Backup password (at least 12 characters)
              <input
                autoFocus
                type="password"
                autoComplete="new-password"
                aria-label="Backup password (at least 12 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {backup === "export" && (
              <label>
                Confirm password (to export)
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="Confirm password (to export)"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword && confirmPassword !== password && (
                  <span className="field-error">
                    The passwords do not match.
                  </span>
                )}
              </label>
            )}
            <p className="fine">
              {backup === "export"
                ? "A backup includes settings, video links and history, but no account sessions or video files."
                : "Restore applies saved settings and merges missing entries into existing history. Pause active work first. Automatic downloading turns off, restored pending items stay paused, and existing sign-ins stay on this PC. Video files must be copied separately and can be reconnected with Locate file."}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={backupWorking}
                onClick={closeBackup}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={
                  backupWorking ||
                  password.length < 12 ||
                  (backup === "export" && confirmPassword !== password)
                }
              >
                {backup === "export"
                  ? "Export encrypted backup"
                  : "Restore backup"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {privacyOpen && (
        <Modal
          title="Privacy note"
          subtitle="How DriftFetch handles your data."
          close={() => setPrivacyOpen(false)}
        >
          <PrivacyNote />
          <div className="modal-actions">
            <button className="btn" onClick={() => setPrivacyOpen(false)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
