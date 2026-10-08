import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CirclePlay,
  CircleStop,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  KeyRound,
  ListChecks,
  Pause,
  Play,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import type { Action, Job, Snapshot } from "./shared";
import {
  bytes,
  bytesOf,
  clock,
  collectionNoun,
  countdown,
  failureSummary,
  needsSignIn,
  time,
  when,
} from "./format";
import { Modal } from "./Modal";
import {
  explanation,
  readerFailureExplanation,
  extensionExplanation,
} from "../shared/diagnostics";
import { qualityWarning } from "../shared/quality";
import { Thumb, radioKeys } from "./ui";

type Tone = "accent" | "cyan" | "muted" | "wait" | "danger" | "ok";
interface Card {
  tone: Tone;
  icon: ReactNode;
  label: string;
  value?: string;
  bar?: { percent: number; kind?: "fill" | "wait" | "paused" };
  sub?: string;
}
interface Button {
  icon: ReactNode;
  label: string;
  run: () => void;
  kind?: "primary" | "danger";
  disabled?: boolean;
}

/** Steps for fixing a failure, when there is a clear one. */
const stepsFor = (job: Job) =>
  needsSignIn(job)
    ? [
        `Sign in to ${job.source} again (this opens a sign-in window).`,
        "Come back and choose Retry.",
      ]
    : undefined;

/** The side panel for one download. `full` is the job with its format list loaded. */
export function DetailsPanel({
  detail,
  full,
  jobs,
  state,
  execute,
  act,
  open,
  collection,
  close,
}: {
  detail: Job;
  full: Job;
  jobs: Job[];
  state?: Snapshot;
  execute: (work: () => Promise<unknown>, success?: string) => Promise<void>;
  act: (ids: string[], action: Action) => Promise<void>;
  open: (job: Job) => void;
  collection: (job: Job) => void;
  close: () => void;
}) {
  const [techOpen, setTechOpen] = useState(false);
  // The countdown fills a bar toward "resumes"; its length is what was left when the panel opened.
  const [now, setNow] = useState(Date.now());
  const wait = useRef(0);
  useEffect(() => {
    if (!detail.retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [detail.retryAt]);
  const left = detail.retryAt
    ? Math.max(0, Math.ceil((detail.retryAt - now) / 1000))
    : 0;
  if (left > wait.current) wait.current = left;
  const id = [detail.id];
  const rate = !!detail.retryAt && detail.status === "failed";
  const missing = detail.fileMissing && detail.status === "completed";
  const settings = state?.settings;

  const card = (): Card => {
    if (missing)
      return {
        tone: "wait",
        icon: <CircleAlert size={16} strokeWidth={2} />,
        label: "File not found",
        sub: detail.filePath,
      };
    if (rate)
      return {
        tone: "wait",
        icon: <Clock size={16} strokeWidth={2} />,
        label:
          detail.failureCode === "RATE_LIMIT"
            ? `Waiting on ${detail.source}`
            : "Trying again soon",
        value: countdown(left),
        bar: {
          percent: wait.current
            ? Math.round((1 - left / wait.current) * 100)
            : 0,
          kind: "wait",
        },
        sub:
          detail.failureCode === "RATE_LIMIT"
            ? "Resumes by itself. You don’t need to do anything."
            : `Retry ${detail.retryCount || 1} of 3. Partial files are kept.`,
      };
    switch (detail.status) {
      case "downloading": {
        const items = detail.linkType === "profile" || detail.imageSearch;
        return {
          tone: "cyan",
          icon: <ArrowDownToLine size={16} strokeWidth={2} />,
          label: "Downloading",
          value: items ? undefined : `${Math.floor(detail.progress)}%`,
          bar: items ? undefined : { percent: detail.progress },
          sub: items
            ? `${detail.filesSaved || 0} files saved${detail.speed ? ` · ${bytes(detail.speed)}/s` : ""}`
            : [
                detail.totalBytes && detail.downloadedBytes
                  ? `${bytesOf(detail.downloadedBytes, detail.totalBytes)}`
                  : "",
                detail.speed ? `${bytes(detail.speed)}/s` : "",
                detail.eta ? `about ${time(detail.eta)} left` : "",
              ]
                .filter(Boolean)
                .join(" · "),
        };
      }
      case "processing":
        return {
          tone: "cyan",
          icon: <ArrowDownToLine size={16} strokeWidth={2} />,
          label: "Finishing",
          sub: "Joining audio and video into one file.",
        };
      case "review":
        return {
          tone: "accent",
          icon: <CirclePlay size={16} strokeWidth={2} />,
          label: "Ready to download",
          value: detail.totalBytes ? `≈${bytes(detail.totalBytes)}` : undefined,
          sub: detail.holdForReview
            ? "Held for review. Start it when you’re ready."
            : "Auto-download is off, so this waits for you to start it.",
        };
      case "queued":
        return {
          tone: "muted",
          icon: <Clock size={16} strokeWidth={2} />,
          label: "Waiting in line",
          sub: "Starts when a download finishes.",
        };
      case "resolving":
        return {
          tone: "muted",
          icon: <Clock size={16} strokeWidth={2} />,
          label: "Checking link",
          sub: "Finding what can be downloaded.",
        };
      case "paused":
        return {
          tone: "muted",
          icon: <Pause size={16} strokeWidth={2} />,
          label: "Paused",
          value: detail.progress
            ? `${Math.floor(detail.progress)}%`
            : undefined,
          bar: detail.progress
            ? { percent: detail.progress, kind: "paused" }
            : undefined,
        };
      case "collection":
        return {
          tone: "accent",
          icon: <ListChecks size={16} strokeWidth={2} />,
          label: "Choose items",
          sub: `${detail.entries?.length || 0} ${collectionNoun(detail)} found. Pick the ones you want.`,
        };
      case "failed":
        return {
          tone: "danger",
          icon: <CircleAlert size={16} strokeWidth={2} />,
          label: "Couldn’t download",
          sub: `${failureSummary(detail)} · ${detail.source}`,
        };
      case "completed":
        return {
          tone: "ok",
          icon: <CircleCheck size={16} strokeWidth={2} />,
          label: "Saved",
          value: bytes(detail.totalBytes),
          sub: when(detail.finishedAt ?? detail.updatedAt),
        };
      case "cancelled":
        return {
          tone: "muted",
          icon: <CircleStop size={16} strokeWidth={2} />,
          label: "Cancelled",
          sub: when(detail.updatedAt),
        };
      default:
        return {
          tone: "muted",
          icon: <Copy size={16} strokeWidth={2} />,
          label: "Already in list",
          sub: "This video is already in Downloads or History.",
        };
    }
  };
  const status = card();

  const b = (
    icon: ReactNode,
    label: string,
    run: () => void,
    kind?: "primary" | "danger",
  ): Button => ({ icon, label, run, kind });
  const buttons = (): Button[] => {
    const list: Button[] = [];
    const again = b(<RotateCw size={15} />, "Download again", () => {
      void act(id, "again");
      close();
    });
    const cancel = b(
      <X size={15} />,
      "Cancel download",
      () => {
        void act(id, "cancel");
        close();
      },
      "danger",
    );
    if (missing)
      return [
        b(
          <FolderOpen size={15} />,
          "Locate file",
          () => void execute(() => window.current.locateFile(detail.id)),
          "primary",
        ),
        again,
      ];
    if (rate) {
      return [
        b(
          <CircleStop size={15} />,
          "Stop retrying",
          () => void act(id, "pause"),
        ),
        b(
          <ExternalLink size={15} />,
          `Open ${detail.source}`,
          () => void execute(() => window.current.openSource(detail.id)),
        ),
      ];
    }
    switch (detail.status) {
      case "downloading":
      case "processing":
        list.push(
          b(<Pause size={15} />, "Pause", () => void act(id, "pause")),
          cancel,
        );
        break;
      case "review":
        list.push(
          b(
            <Play size={15} />,
            "Start download",
            () => void act(id, "start"),
            "primary",
          ),
          b(
            <ArrowUpToLine size={15} />,
            "Download next",
            () => void act(id, "next"),
          ),
        );
        break;
      case "queued":
        list.push(
          b(
            <ArrowUpToLine size={15} />,
            "Download next",
            () => void act(id, "next"),
          ),
          b(<Pause size={15} />, "Pause", () => void act(id, "pause")),
          cancel,
        );
        break;
      case "paused":
        list.push(
          b(
            <Play size={15} />,
            "Resume",
            () => void act(id, "start"),
            "primary",
          ),
          cancel,
        );
        break;
      case "collection":
        list.push(
          b(
            <ListChecks size={15} />,
            "Choose items",
            () => collection(detail),
            "primary",
          ),
        );
        break;
      case "failed":
        if (needsSignIn(detail))
          list.push(
            b(
              <KeyRound size={15} />,
              `Sign in to ${detail.source}`,
              () =>
                void execute(
                  () => window.current.browserSession(detail.source),
                  "Session saved. Retry the download when you are ready.",
                ),
              "primary",
            ),
          );
        list.push(
          b(
            <RotateCw size={15} />,
            "Retry",
            () => void act(id, "start"),
            needsSignIn(detail) ? undefined : "primary",
          ),
          b(
            <ExternalLink size={15} />,
            "Open source page",
            () => void execute(() => window.current.openSource(detail.id)),
          ),
        );
        break;
      case "completed":
        list.push(
          b(
            <Play size={15} />,
            "Open file",
            () => void execute(() => window.current.openFile(detail.id)),
            "primary",
          ),
          b(
            <FolderOpen size={15} />,
            "Open folder",
            () => void execute(() => window.current.openFolder(detail.id)),
          ),
          again,
        );
        break;
      case "cancelled":
        list.push(again);
        break;
      case "duplicate": {
        const original = jobs.find((j) => j.id === detail.duplicateOf);
        if (original)
          list.push(
            b(<ChevronRight size={15} />, "Go to original", () =>
              open(original),
            ),
          );
        list.push(again);
        break;
      }
    }
    return list;
  };

  const warning = state && qualityWarning(full, state.settings);
  const choosable =
    !!full.formats?.length &&
    !detail.targetDir &&
    ["review", "queued", "failed"].includes(detail.status);
  const formats = [...(full.formats ?? [])].reverse();
  const steps =
    detail.status === "failed" && !rate ? stepsFor(detail) : undefined;
  const meta = [detail.source, detail.quality, clock(detail.duration)]
    .filter((part) => part && part !== "Unknown")
    .join(" · ");
  const original = detail.duplicateOf
    ? jobs.find((j) => j.id === detail.duplicateOf)
    : undefined;
  const tech: [string, ReactNode][] = [
    ["Copied link", detail.originalUrl],
    ["Page", detail.resolvedUrl || "Not reached yet"],
    ["Source ID", detail.mediaKey || "Not identified yet"],
    [
      "Format",
      detail.actualFormatId
        ? `${detail.actualFormatId} (used)`
        : detail.selectedFormatId ||
          (detail.preferredFormatId
            ? `Automatic (prefers ${detail.preferredFormatId})`
            : "Automatic"),
    ],
    [
      "Saving to",
      detail.filePath || detail.targetDir || settings?.downloadDir || "",
    ],
    ["Added", when(detail.createdAt)],
  ];
  if (detail.failureCode) tech.push(["Error code", detail.failureCode]);
  if (detail.retryAt)
    tech.push([
      "Retries",
      `${detail.retryCount || 1} of 3 · ${settings?.automaticRetries ? "automatic" : "off"}`,
    ]);
  if (original) tech.push(["Duplicate of", original.title]);
  if (detail.discoveredItems !== undefined)
    tech.push([
      "Items found",
      `${detail.discoveredItems}${detail.sourceItemCount !== undefined ? ` of ${detail.sourceItemCount} reported` : " (source total unknown)"}`,
    ]);
  if (detail.expectedFiles !== undefined)
    tech.push([
      "Files verified",
      `${detail.verifiedFiles ?? "Not checked"} of ${detail.expectedFiles}${detail.missingFiles ? ` · ${detail.missingFiles} missing` : ""}`,
    ]);
  const discovery = detail.collectionDiscovery;
  if (discovery) {
    tech.push(
      ["API pages read", String(discovery.pagesRead)],
      [
        "API posts",
        `${discovery.uniquePosts} distinct · ${discovery.duplicatePosts} repeated`,
      ],
      [
        "Without files",
        `${discovery.postsWithoutFiles} · ${discovery.invalidPosts} invalid records`,
      ],
      [
        "Shared file URLs",
        `${discovery.sharedFileUrls} (the same file is saved once)`,
      ],
      [
        "Paging stopped",
        {
          "empty-page": "API returned an empty page",
          "repeated-page": "API kept repeating the same posts",
          "page-limit": "Page limit reached",
        }[discovery.stopReason],
      ],
    );
  }
  detail.extensionChecks?.forEach((check) =>
    tech.push([
      check.stage === "redirect" ? "Redirected page" : "Extension check",
      extensionExplanation(check.outcome),
    ]),
  );
  detail.collectionReadAttempts?.forEach((attempt) =>
    tech.push([
      attempt.reader === "api" ? "API reader" : "HTML fallback",
      `${
        attempt.outcome === "succeeded"
          ? "returned a list"
          : attempt.outcome === "empty"
            ? "no list returned"
            : attempt.outcome
      }${attempt.failureCode ? ` · ${attempt.failureCode} — ${readerFailureExplanation(attempt.failureCode)}` : ""}`,
    ]),
  );

  return (
    <Modal
      side
      title={detail.title}
      subtitle={meta || undefined}
      close={close}
      header={<Thumb job={detail} size="lg" />}
    >
      <div className="panel-scroll">
        <div className={`status-card tone-${status.tone}`}>
          <div className="status-card-head">
            {status.icon}
            <span className="grow">{status.label}</span>
            {status.value && <span className="num value">{status.value}</span>}
          </div>
          {status.bar && (
            <div className="meter">
              <i
                className={status.bar.kind ?? "fill"}
                style={{
                  width: `${Math.min(100, Math.max(2, status.bar.percent))}%`,
                }}
              />
            </div>
          )}
          {status.sub && <div className="status-sub num">{status.sub}</div>}
        </div>

        <section>
          <h3>
            {detail.status === "failed" && !rate
              ? "What happened"
              : "What’s happening"}
          </h3>
          <p>{explanation(detail)}</p>
          {steps && (
            <ol className="steps">
              {steps.map((text, i) => (
                <li key={text}>
                  <span>{i + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="panel-actions">
          {buttons().map((button) => (
            <button
              key={button.label}
              className={`btn ${button.kind ?? ""}`}
              disabled={button.disabled}
              onClick={button.run}
            >
              {button.icon}
              {button.label}
            </button>
          ))}
        </div>

        <section>
          <div className="section-line">
            <h3>Quality</h3>
            {!["completed", "duplicate", "cancelled"].includes(
              detail.status,
            ) && (
              <button
                className="link-button"
                disabled={
                  detail.refreshing ||
                  ["downloading", "processing", "resolving"].includes(
                    detail.status,
                  )
                }
                onClick={() =>
                  void execute(() => window.current.refreshFormats(detail.id))
                }
              >
                {detail.refreshing ? "Checking formats…" : "Recheck formats"}
              </button>
            )}
          </div>
          {warning && <div className="note wait">{warning}</div>}
          {detail.formatsError && (
            <div className="note wait">
              Recheck failed: {detail.formatsError} The previous format list was
              kept.
            </div>
          )}
          {choosable ? (
            <div
              className="radio-list"
              role="radiogroup"
              aria-label="Format for this download"
              onKeyDown={radioKeys}
            >
              {[
                {
                  value: "",
                  label: "Automatic",
                  meta: detail.preferredFormatId
                    ? `prefers ${detail.preferredFormatId}`
                    : "uses your quality setting",
                },
                ...formats.map((f) => ({
                  value: f.id,
                  label: f.height ? `${f.height}p` : "Resolution unknown",
                  meta: `${f.ext} · ${f.id}${f.separateAudio ? " + audio" : ""}${f.size ? ` · ≈${bytes(f.size)}` : ""}${f.bitrate ? ` · ${Math.round(f.bitrate)} kb/s` : ""}`,
                })),
              ].map((option) => {
                const on = (detail.selectedFormatId || "") === option.value;
                return (
                  <button
                    key={option.value}
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    className={`radio-row ${on ? "on" : ""}`}
                    onClick={() =>
                      void execute(() =>
                        window.current.setFormat(detail.id, option.value),
                      )
                    }
                  >
                    <span className="radio" />
                    <span className="grow">{option.label}</span>
                    <span className="meta num">{option.meta}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="plain">
              {!detail.quality || detail.quality === "Unknown" ? (
                "Not known until the link can be read."
              ) : (
                <>
                  {detail.status === "completed" ? "Saved at" : "Detected as"}{" "}
                  <strong>{detail.quality}</strong>
                  {detail.actualFormatId
                    ? ` · format ${detail.actualFormatId}`
                    : ""}
                </>
              )}
            </p>
          )}
          <p className="fine">
            {choosable
              ? "A specific format overrides your quality setting for this download only."
              : detail.status === "downloading"
                ? "Quality can’t change once a download has started."
                : !full.formats?.length &&
                    detail.quality &&
                    detail.quality !== "Unknown"
                  ? "No format list is available. Older entries need a fresh link check."
                  : ""}
            {detail.formatsCheckedAt
              ? ` Checked ${new Date(detail.formatsCheckedAt).toLocaleString()} · engine ${detail.checkedEngineVersion || "unknown"}.`
              : ""}
          </p>
        </section>

        <section className="tech">
          <button
            className="disclosure"
            aria-expanded={techOpen}
            onClick={() => setTechOpen(!techOpen)}
          >
            <ChevronRight size={14} className={techOpen ? "turned" : ""} />
            Technical details
          </button>
          {techOpen && (
            <dl className="kv">
              {tech.map(([key, value]) => (
                <div key={key} className="kv-row">
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
      <div className="panel-foot">
        <button
          className="btn"
          onClick={() =>
            void execute(
              () => window.current.copyDiagnostic(detail.id),
              "Diagnostic report copied. URLs, titles, file paths, and credentials are omitted.",
            )
          }
        >
          <Copy size={14} />
          Copy diagnostic report
        </button>
        <span className="grow" />
        <button
          className="btn quiet-danger"
          title="Keeps any saved files on disk"
          onClick={() => {
            void act(id, "remove");
            close();
          }}
        >
          <Trash2 size={14} />
          Remove from list
        </button>
      </div>
    </Modal>
  );
}
