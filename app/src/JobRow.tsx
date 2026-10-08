import { memo, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronRight,
  CircleAlert,
  CircleStop,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  ListChecks,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
  X,
} from "lucide-react";
import type { Action, Job, Settings } from "./shared";
import {
  bytes,
  bytesOf,
  clock,
  collectionNoun,
  countdown,
  failureSummary,
  time,
  when,
} from "./format";
import { qualityWarning } from "../shared/quality";
import { scheduleAllows } from "../shared/transfer-policy";
import { Thumb } from "./ui";

const waiting = ["queued", "review", "paused", "failed"];

/** Callbacks are stable, so a memoised row only rerenders when its own job changes. */
export interface RowActions {
  select(id: string): void;
  details(id: string): void;
  collection(job: Job): void;
  act(ids: string[], action: Action): void;
  openFolder(id: string): void;
  openFile(id: string): void;
  openSource(id: string): void;
  dragStart(id: string): void;
  dragEnd(): void;
  drop(targetId: string, after: boolean): void;
}

type Tone = "accent" | "cyan" | "muted" | "wait" | "danger" | "ok";
interface View {
  tone: Tone;
  icon?: ReactNode;
  dot?: boolean;
  label: string;
  percent?: number;
  bar?: "fill" | "paused" | "indeterminate";
  sub?: string;
  subLink?: () => void;
  size: string;
  sizeBottom: string;
}

/** Rows that tick (countdowns, schedule waits) own a 1 s clock; the others never rerender for it. */
function useNow(running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/** What a row says about its job: label, colour, progress, and the line under it. */
export function rowView(
  job: Job,
  settings: Settings,
  now: number,
  actions: Pick<RowActions, "collection" | "details">,
  ahead?: number,
): View {
  const spinner = <LoaderCircle size={13} className="spin" strokeWidth={2} />;
  const profile = job.linkType === "profile" || job.imageSearch;
  const none = { size: "—", sizeBottom: "" };
  const estimated = (n?: number) =>
    n ? { size: bytes(n), sizeBottom: "estimated" } : none;
  const left = job.retryAt
    ? Math.max(0, Math.ceil((job.retryAt - now) / 1000))
    : 0;
  if (job.fileMissing && job.status === "completed")
    return {
      tone: "wait",
      icon: <CircleAlert size={13} strokeWidth={2} />,
      label: "File missing",
      sub: "Use Locate file in Details",
      subLink: () => actions.details(job.id),
      size: bytes(job.totalBytes),
      sizeBottom: "Not found",
    };
  if (job.retryAt && job.status === "failed")
    return {
      tone: "wait",
      icon: <Clock size={13} strokeWidth={2} />,
      label:
        job.failureCode === "RATE_LIMIT"
          ? `Rate limited · resumes in ${countdown(left)}`
          : `Retry in ${left}s`,
      sub:
        job.failureCode === "RATE_LIMIT"
          ? "The site asked us to wait · continues by itself"
          : "A temporary problem · retrying by itself",
      ...none,
    };
  switch (job.status) {
    case "resolving":
      return {
        tone: "muted",
        icon: spinner,
        label: "Checking link",
        sub: "Finding what can be downloaded",
        ...none,
      };
    case "review":
      return {
        tone: "accent",
        dot: true,
        label: "Ready to start",
        sub: job.holdForReview
          ? "Held for review"
          : settings.autoDownload
            ? "Waiting for you to start it"
            : "Auto-download is off",
        ...(job.imageSearch ? none : estimated(job.totalBytes)),
      };
    case "queued":
      return {
        tone: "muted",
        dot: true,
        label: !scheduleAllows(settings, new Date(now))
          ? "Waiting for schedule"
          : ahead
            ? `Waiting · ${ahead} ahead`
            : "Waiting · next in line",
        sub: "Starts when a download finishes",
        ...estimated(job.totalBytes),
      };
    case "downloading":
      return profile
        ? {
            tone: "cyan",
            dot: true,
            label: job.imageSearch ? "Saving search results" : "Saving profile",
            bar: "indeterminate",
            sub: `${job.filesSaved || 0} files saved`,
            size: bytes(job.downloadedBytes ?? job.totalBytes),
            sizeBottom: job.speed ? `${bytes(job.speed)}/s` : "",
          }
        : {
            tone: "cyan",
            dot: true,
            label: job.eta
              ? `Downloading · ${time(job.eta)} left`
              : "Downloading",
            percent: Math.floor(job.progress),
            bar: "fill",
            size:
              job.totalBytes && job.downloadedBytes
                ? bytesOf(job.downloadedBytes, job.totalBytes)
                : bytes(job.totalBytes),
            sizeBottom: job.speed ? `${bytes(job.speed)}/s` : "",
          };
    case "processing":
      return {
        tone: "cyan",
        icon: spinner,
        label: "Finishing",
        bar: "indeterminate",
        sub: "Joining audio and video",
        size: bytes(job.totalBytes),
        sizeBottom: "",
      };
    case "paused":
      return {
        tone: "muted",
        icon: <Pause size={13} strokeWidth={2} />,
        label: "Paused",
        percent: job.progress ? Math.floor(job.progress) : undefined,
        bar: job.progress ? "paused" : undefined,
        size:
          job.totalBytes && job.downloadedBytes
            ? bytesOf(job.downloadedBytes, job.totalBytes)
            : bytes(job.totalBytes),
        sizeBottom: "",
      };
    case "collection":
      return {
        tone: "accent",
        dot: true,
        label: "Choose items",
        sub: `Select from ${job.entries?.length || 0} ${collectionNoun(job)}`,
        subLink: () => actions.collection(job),
        ...none,
      };
    case "failed":
      return {
        tone: "danger",
        icon: <CircleAlert size={13} strokeWidth={2} />,
        label: failureSummary(job),
        sub: "See what happened",
        subLink: () => actions.details(job.id),
        ...none,
      };
    case "completed": {
      const ext = job.filePath?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
      return {
        tone: "ok",
        icon: <Check size={13} strokeWidth={2} />,
        label: "Saved",
        sub: when(job.finishedAt ?? job.updatedAt),
        size: bytes(job.totalBytes),
        sizeBottom: ext
          ? ext.toUpperCase()
          : job.linkType === "profile"
            ? "Folder"
            : "",
      };
    }
    case "cancelled":
      return {
        tone: "muted",
        icon: <CircleStop size={13} strokeWidth={2} />,
        label: "Cancelled",
        sub: when(job.updatedAt),
        ...none,
      };
    case "duplicate":
      return {
        tone: "muted",
        icon: <Copy size={13} strokeWidth={2} />,
        label: "Already in list",
        sub: "Go to original",
        subLink: job.duplicateOf
          ? () => actions.details(job.duplicateOf!)
          : undefined,
        ...none,
      };
  }
  return { tone: "muted", label: job.status, ...none };
}

interface RowButton {
  icon: ReactNode;
  label: string;
  run: () => void;
}

function rowButtons(job: Job, actions: RowActions): RowButton[] {
  const id = [job.id];
  const button = (icon: ReactNode, label: string, run: () => void) => ({
    icon,
    label,
    run,
  });
  const remove = button(<X size={16} />, "Remove", () =>
    actions.act(id, "remove"),
  );
  const details = button(<Info size={16} />, "Download details", () =>
    actions.details(job.id),
  );
  if (job.fileMissing && job.status === "completed")
    return [
      details,
      button(<RotateCw size={16} />, "Download again", () =>
        actions.act(id, "again"),
      ),
      remove,
    ];
  if (job.retryAt && job.status === "failed")
    return [
      button(<CircleStop size={16} />, "Stop retrying", () =>
        actions.act(id, "pause"),
      ),
      details,
    ];
  switch (job.status) {
    case "resolving":
      return [remove];
    case "review":
      return [
        button(<Play size={16} />, "Start", () => actions.act(id, "start")),
        details,
        remove,
      ];
    case "queued":
      return [
        button(<ArrowUpToLine size={16} />, "Download next", () =>
          actions.act(id, "next"),
        ),
        button(<Pause size={16} />, "Pause", () => actions.act(id, "pause")),
        remove,
      ];
    case "downloading":
    case "processing":
      return [
        button(<Pause size={16} />, "Pause", () => actions.act(id, "pause")),
        button(<X size={16} />, "Cancel", () => actions.act(id, "cancel")),
      ];
    case "paused":
      return [
        button(<Play size={16} />, "Resume", () => actions.act(id, "start")),
        remove,
      ];
    case "collection":
      return [
        button(<ListChecks size={16} />, "Choose items", () =>
          actions.collection(job),
        ),
        remove,
      ];
    case "failed":
      return [
        button(<RotateCw size={16} />, "Retry", () => actions.act(id, "start")),
        button(<ExternalLink size={16} />, "Open source page", () =>
          actions.openSource(job.id),
        ),
        details,
      ];
    case "completed":
      return [
        button(<FolderOpen size={16} />, "Open folder", () =>
          actions.openFolder(job.id),
        ),
        button(<Play size={16} />, "Open file", () => actions.openFile(job.id)),
        button(<ArrowDownToLine size={16} />, "Download again", () =>
          actions.act(id, "again"),
        ),
      ];
    case "cancelled":
      return [
        button(<ArrowDownToLine size={16} />, "Download again", () =>
          actions.act(id, "again"),
        ),
        remove,
      ];
    default:
      return [remove];
  }
}

function JobRowView({
  job,
  settings,
  selected,
  reorderable,
  dragging,
  ahead,
  actions,
}: {
  job: Job;
  settings: Settings;
  selected: boolean;
  reorderable: boolean;
  dragging: boolean;
  ahead?: number;
  actions: RowActions;
}) {
  const canReorder = reorderable && waiting.includes(job.status);
  // A waiting row only needs the clock to notice the schedule window; a countdown always does.
  const now = useNow(
    !!job.retryAt || (job.status === "queued" && settings.scheduleEnabled),
  );
  const view = rowView(job, settings, now, actions, ahead);
  const warning = qualityWarning(job, settings);
  const raw = job.status === "resolving";
  return (
    <div
      className={`job-row ${selected ? "selected" : ""}`}
      data-job-id={job.id}
      data-status={job.status}
      title={
        canReorder
          ? "Drag above or below another waiting download to reorder"
          : undefined
      }
      draggable={canReorder}
      onClick={() => actions.details(job.id)}
      onDragStart={(event) => {
        actions.dragStart(job.id);
        event.dataTransfer.setData("text/plain", job.id);
      }}
      onDragEnd={() => actions.dragEnd()}
      onDragOver={(event) => {
        if (dragging && waiting.includes(job.status)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        actions.drop(job.id, event.clientY > rect.top + rect.height / 2);
      }}
    >
      <input
        aria-label={`Select ${job.title}`}
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => actions.select(job.id)}
      />
      <Thumb job={job} />
      <div className="video-text">
        <button
          className={`video-title ${raw ? "mono" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            actions.details(job.id);
          }}
          title={raw ? job.originalUrl : job.title}
        >
          {raw ? job.originalUrl : job.title}
        </button>
        <div className="video-meta">
          <span>{job.source}</span>
          {job.quality && job.quality !== "Unknown" && (
            <span className={`quality-pill ${warning ? "warn" : ""}`}>
              {job.quality}
            </span>
          )}
          {job.duration ? (
            <span className="num">{clock(job.duration)}</span>
          ) : null}
        </div>
      </div>
      <div className="status-cell">
        <div className={`status-label tone-${view.tone}`}>
          {view.dot && <span className="dot" />}
          {view.icon}
          <span className="status-text">{view.label}</span>
          {view.percent !== undefined && (
            <span className="percent">{view.percent}%</span>
          )}
        </div>
        {view.bar === "indeterminate" ? (
          <div className="progress indeterminate" aria-hidden="true">
            <i />
          </div>
        ) : view.bar ? (
          <div
            className={`progress ${view.bar}`}
            role="progressbar"
            aria-label={job.title + " progress"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.floor(job.progress)}
          >
            <i style={{ width: `${Math.max(job.progress || 0, 2)}%` }} />
          </div>
        ) : null}
        {view.sub &&
          (view.subLink ? (
            <button
              className="sub-line link"
              onClick={(e) => {
                e.stopPropagation();
                view.subLink!();
              }}
            >
              <span>{view.sub}</span>
              <ChevronRight size={12} />
            </button>
          ) : (
            <span className="sub-line">{view.sub}</span>
          ))}
      </div>
      <div className="size-cell">
        <span className="size-top">{view.size}</span>
        <span className="size-bottom">{view.sizeBottom}</span>
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        {rowButtons(job, actions).map((b) => (
          <button
            key={b.label}
            className="icon-button"
            title={b.label}
            aria-label={`${b.label}: ${job.title}`}
            onClick={b.run}
          >
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
// Snapshots deserialize fresh objects every time, so compare what actually changes.
export const JobRow = memo(
  JobRowView,
  (a, b) =>
    a.job.id === b.job.id &&
    a.job.updatedAt === b.job.updatedAt &&
    a.job.status === b.job.status &&
    a.job.progress === b.job.progress &&
    a.selected === b.selected &&
    a.reorderable === b.reorderable &&
    a.dragging === b.dragging &&
    a.ahead === b.ahead &&
    a.settings.quality === b.settings.quality &&
    a.settings.autoDownload === b.settings.autoDownload &&
    a.settings.warnBelowHeight === b.settings.warnBelowHeight &&
    a.settings.scheduleEnabled === b.settings.scheduleEnabled &&
    a.settings.scheduleStart === b.settings.scheduleStart &&
    a.settings.scheduleEnd === b.settings.scheduleEnd,
);
