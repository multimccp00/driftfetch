import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ClipboardPaste,
  ChevronDown,
  Folder,
  History,
  ListX,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { Action, Job, Snapshot } from "./shared";
import { isActive } from "./format";
import { JobRow, type RowActions } from "./JobRow";
import { Modal } from "./Modal";
import { windowRange } from "./window";

// Rows are a fixed height, so a long list only builds the rows in view.
const rowHeight = 56;

export interface Derived {
  byId: Map<string, Job>;
  queueJobs: Job[];
  hasFinished: boolean;
  sources: string[];
}

const terminal = ["completed", "cancelled", "duplicate"];
const stoppable = ["downloading", "processing", "queued", "resolving"];
const clearable = ["queued", "review", "collection", "paused", "failed"];

type Tab = [key: string, label: string];
const downloadTabs: Tab[] = [
  ["all", "All downloads"],
  ["active", "Active"],
  ["ready", "Ready"],
  ["paused", "Paused"],
  ["failed", "Failed"],
];
const historyTabs: Tab[] = [
  ["all", "All history"],
  ["completed", "Completed"],
  ["duplicate", "Duplicates"],
  ["cancelled", "Cancelled"],
];

const matches = (key: string, job: Job) =>
  key === "all" ||
  (key === "active"
    ? isActive(job)
    : key === "ready"
      ? ["review", "collection"].includes(job.status)
      : key === "failed"
        ? job.status === "failed" && !job.retryAt
        : job.status === key);

/** The tabbed list card: tabs, toolbar, column header, rows and the footer. */
export function JobList({
  page,
  state,
  derived,
  execute,
  act,
  details,
  collection,
  openSettings,
}: {
  page: "downloads" | "history";
  state: Snapshot;
  derived: Derived;
  execute: (
    work: () => Promise<unknown>,
    success?: string,
    undoable?: boolean,
  ) => Promise<void>;
  act: (ids: string[], action: Action) => Promise<void>;
  details: (id: string) => void;
  collection: (job: Job) => void;
  openSettings: () => void;
}) {
  const history = page === "history";
  const jobs = state.jobs;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [dragged, setDragged] = useState<string>();
  const [confirm, setConfirm] = useState<"history" | "downloads">();
  const [clearing, setClearing] = useState(false);
  const tabs = history ? historyTabs : downloadTabs;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setScroll({ top: el.scrollTop, height: el.clientHeight }),
      );
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, []);

  const pageJobs = useMemo(
    () => jobs.filter((j) => terminal.includes(j.status) === history),
    [jobs, history],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [key] of tabs)
      result[key] = pageJobs.filter((j) => matches(key, j)).length;
    return result;
  }, [pageJobs, tabs]);
  const visible = useMemo(
    () =>
      pageJobs
        .filter(
          (j) =>
            matches(filter, j) &&
            (source === "all" || j.source === source) &&
            `${j.title} ${j.source}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          history
            ? (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt)
            : (a.queueOrder ?? a.createdAt) - (b.queueOrder ?? b.createdAt),
        ),
    [pageJobs, filter, source, search, history],
  );
  // How many waiting downloads come before each one, for "next in line".
  const ahead = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const j of visible) if (j.status === "queued") map.set(j.id, n++);
    return map;
  }, [visible]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // Drop selections for rows that left the list.
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => derived.byId.has(id));
      return next.length === current.length ? current : next;
    });
  }, [derived.byId]);

  const run = (ids: string[], action: Action) => {
    void act(ids, action);
    setSelected([]);
  };
  // Rows are memoised, so they get one stable object that always calls the latest handlers.
  const latest = useRef<RowActions>(null!);
  latest.current = {
    select: (id) =>
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    details,
    collection,
    act: (ids, action) => void act(ids, action),
    openFolder: (id) => void execute(() => window.current.openFolder(id)),
    openFile: (id) => void execute(() => window.current.openFile(id)),
    openSource: (id) => void execute(() => window.current.openSource(id)),
    dragStart: (id) => setDragged(id),
    dragEnd: () => setDragged(undefined),
    drop: (targetId, after) => {
      if (dragged)
        void execute(() => window.current.reorder(dragged, targetId, after));
      setDragged(undefined);
    },
  };
  const rowActions = useMemo<RowActions>(
    () => ({
      select: (id) => latest.current.select(id),
      details: (id) => latest.current.details(id),
      collection: (job) => latest.current.collection(job),
      act: (ids, action) => latest.current.act(ids, action),
      openFolder: (id) => latest.current.openFolder(id),
      openFile: (id) => latest.current.openFile(id),
      openSource: (id) => latest.current.openSource(id),
      dragStart: (id) => latest.current.dragStart(id),
      dragEnd: () => latest.current.dragEnd(),
      drop: (targetId, after) => latest.current.drop(targetId, after),
    }),
    [],
  );

  const onTabKey = (e: ReactKeyboardEvent, index: number) => {
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setFilter(tabs[next][0]);
    setSelected([]);
    tabRefs.current[next]?.focus();
  };

  const range = windowRange(
    scroll.top,
    scroll.height,
    visible.length,
    rowHeight,
  );
  const running = jobs.filter((j) => stoppable.includes(j.status));
  const filtering = !!search || filter !== "all" || source !== "all";
  const allOn = !!visible.length && visible.every((j) => selectedSet.has(j.id));
  const someOn = selected.length > 0 && !allOn;

  return (
    <section
      className="list-card"
      aria-label={history ? "History" : "Downloads"}
    >
      <div className="tabs" role="tablist" aria-label="Filter the list">
        {tabs.map(([key, label], i) => {
          const on = filter === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className={on ? "active" : ""}
              onKeyDown={(e) => onTabKey(e, i)}
              onClick={() => {
                setFilter(key);
                setSelected([]);
              }}
            >
              {label}
              {(count > 0 || key === "all") && (
                <span
                  className={`count ${key === "failed" && count ? "danger" : ""}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="toolbar">
        <div className="field search-field">
          <Search size={15} />
          <input
            aria-label={history ? "Search history" : "Search downloads"}
            placeholder={history ? "Search history" : "Search downloads"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="bare"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <label className="select-field">
          <select
            aria-label="Filter by site"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">All sites</option>
            {derived.sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <span className="grow" />
        {history ? (
          <>
            <button
              className="btn sm"
              onClick={() =>
                void execute(() => window.current.checkFiles(), "Files checked")
              }
            >
              <RefreshCw size={14} />
              <span className="btn-label">Check files</span>
            </button>
            <button
              className="btn sm"
              disabled={!derived.hasFinished}
              onClick={() =>
                void execute(
                  () => window.current.exportHistory(selected),
                  selected.length
                    ? "Selected history exported."
                    : "History exported.",
                )
              }
            >
              <ArrowUpRight size={14} />
              <span className="btn-label">Export CSV</span>
            </button>
            <button
              className="btn sm"
              disabled={!derived.hasFinished}
              onClick={() => setConfirm("history")}
            >
              <ListX size={14} />
              <span className="btn-label">Clear history</span>
            </button>
          </>
        ) : (
          <>
            <button
              className="btn sm"
              disabled={!jobs.some((j) => clearable.includes(j.status))}
              onClick={() => setConfirm("downloads")}
            >
              <ListX size={14} />
              <span className="btn-label">Clear list</span>
            </button>
            <button
              className="btn sm"
              disabled={!running.length}
              onClick={() =>
                run(
                  running.map((j) => j.id),
                  "pause",
                )
              }
            >
              <Pause size={14} />
              <span className="btn-label">Pause all</span>
            </button>
          </>
        )}
      </div>
      <div className="table-head">
        <input
          aria-label="Select all visible downloads"
          type="checkbox"
          ref={(box) => {
            if (box) box.indeterminate = someOn;
          }}
          checked={allOn}
          onChange={(e) =>
            setSelected(e.target.checked ? visible.map((j) => j.id) : [])
          }
        />
        <span className="span2">VIDEO / SOURCE</span>
        <span>STATUS</span>
        <span className="right">SIZE / SPEED</span>
        <span />
      </div>
      <div className="job-list" ref={listRef}>
        {range.start > 0 && (
          <div aria-hidden style={{ height: range.start * rowHeight }} />
        )}
        {visible.slice(range.start, range.end).map((job) => (
          <JobRow
            key={job.id}
            job={job}
            settings={state.settings}
            selected={selectedSet.has(job.id)}
            reorderable={page === "downloads"}
            dragging={!!dragged}
            ahead={ahead.get(job.id)}
            actions={rowActions}
          />
        ))}
        {range.end < visible.length && (
          <div
            aria-hidden
            style={{ height: (visible.length - range.end) * rowHeight }}
          />
        )}
        {!visible.length && (
          <div className="empty-state">
            <div className="empty-tile">
              {history ? (
                <History size={22} />
              ) : filtering ? (
                <Search size={22} />
              ) : (
                <ClipboardPaste size={22} />
              )}
            </div>
            <h2>
              {filtering
                ? "Nothing matches"
                : history
                  ? "Nothing in history yet"
                  : "No downloads yet"}
            </h2>
            <p>
              {filtering
                ? "Try another search or a different tab."
                : history
                  ? "Finished and cancelled downloads show up here."
                  : "Copy a video or gallery link in your browser and it shows up here. You can also press Ctrl+V to paste one or several links, or Ctrl+Shift+V to give them a group name."}
            </p>
            {!history && !filtering && state.settings.clipboardWatch && (
              <span className="empty-hint">
                <span className="dot cyan" /> Watching clipboard
              </span>
            )}
          </div>
        )}
      </div>
      <div className="list-foot">
        {selected.length ? (
          <div className="bulk">
            <strong>{selected.length} selected</strong>
            {history ? (
              <>
                <button
                  className="btn xs"
                  onClick={() => run(selected, "again")}
                >
                  <ArrowDownToLine size={13} /> Download again
                </button>
                <button
                  className="btn xs danger-text"
                  onClick={() => run(selected, "remove")}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn xs"
                  onClick={() => run(selected, "start")}
                >
                  <Play size={13} /> Start
                </button>
                <button
                  className="btn xs"
                  onClick={() => run(selected, "pause")}
                >
                  <Pause size={13} /> Pause
                </button>
                <button
                  className="btn xs danger-text"
                  onClick={() => run(selected, "remove")}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </>
            )}
            <button className="btn xs quiet" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        ) : (
          <span className="foot-count">
            <span className="dot accent" />
            {visible.length} item{visible.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="grow" />
        <span className="foot-path" title={state.settings.downloadDir}>
          <Folder size={14} />
          <code>{state.settings.downloadDir}</code>
          <button className="link-button" onClick={openSettings}>
            Change
          </button>
        </span>
        <span className="foot-note">
          <span className="rule" />
          Duplicates are skipped
          <ShieldCheck size={13} />
        </span>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "history"
              ? "Clear all history?"
              : "Clear download list?"
          }
          subtitle={
            confirm === "history"
              ? "Downloaded files will stay on disk."
              : "Files already saved on disk will stay there."
          }
          close={() => {
            if (!clearing) setConfirm(undefined);
          }}
        >
          <p className="plain">
            {confirm === "history"
              ? "This removes all completed, cancelled and duplicate entries, including entries hidden by filters. Active downloads stay in the list. Removed entries will no longer prevent duplicate downloads."
              : "This removes waiting, paused, collection, and problem entries from the Downloads screen. Active transfers keep running, and completed downloads remain in History."}
          </p>
          <div className="modal-actions">
            <button
              className="btn"
              disabled={clearing}
              onClick={() => setConfirm(undefined)}
            >
              {confirm === "history" ? "Keep history" : "Keep list"}
            </button>
            <button
              className="btn primary"
              disabled={clearing}
              onClick={() =>
                void execute(
                  async () => {
                    setClearing(true);
                    try {
                      await (confirm === "history"
                        ? window.current.clearHistory()
                        : window.current.clearDownloads());
                      setSelected([]);
                      setConfirm(undefined);
                    } finally {
                      setClearing(false);
                    }
                  },
                  confirm === "history"
                    ? "History cleared. Downloaded files were kept."
                    : "Download list cleared. Saved files were kept.",
                  true,
                )
              }
            >
              {clearing
                ? "Clearing…"
                : confirm === "history"
                  ? "Clear all history"
                  : "Clear download list"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
