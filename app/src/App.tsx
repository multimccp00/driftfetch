import { CollectionPreview } from "./CollectionPreview";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Copy,
  Folder,
  Gauge,
  History,
  Layers,
  ListChecks,
  LoaderCircle,
  Minus,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { Action, Job, Snapshot, Settings } from "./shared";
import { ReviewQueue } from "./ReviewQueue";
import { SettingsView, type SettingsSection } from "./SettingsView";
import { DetailsPanel } from "./DetailsPanel";
import { bytes, collectionNoun, statusLabel } from "./format";
import { Modal } from "./Modal";
import { PrivacyNote } from "./PrivacyNote";
import { privacyNote } from "../shared/privacy-note";
import { ConfirmButton } from "./ConfirmButton";
import { JobList } from "./JobList";
import { Switch } from "./ui";

type Page = "downloads" | "history" | "settings" | "captures" | "review";
const label = (job: Job) =>
  statusLabel(job.status, job.collectionKind, collectionNoun(job));
const terminal = ["completed", "cancelled", "duplicate"];
const addedToast = (r: {
  added: number;
  duplicates: number;
  truncated: number;
}) =>
  r.added
    ? `${r.added} link${r.added === 1 ? "" : "s"} added${r.duplicates ? ` · ${r.duplicates} already in your list or history` : ""}${r.truncated ? ` · ${r.truncated} more skipped (200 per paste)` : ""}`
    : r.duplicates
      ? "Already in your list or history"
      : "No new links found";
// Undo stays available for 30 s, the same window the engine keeps removed rows.
const undoSeconds = 30;

export function App() {
  const [state, setState] = useState<Snapshot>();
  const [page, setPage] = useState<Page>("downloads");
  const [section, setSection] = useState<SettingsSection>("downloads");
  const [collectionId, setCollectionId] = useState<string>();
  const [entryIds, setEntryIds] = useState<string[]>([]);
  // A fresh object per message restarts the timer and re-announces repeats;
  // errors stay until dismissed so long messages can be read.
  const [toast, setToastState] = useState<{
    id: number;
    text: string;
    error: boolean;
    undo?: () => void;
  }>();
  const setToast = (text: string, error = false, undo?: () => void) =>
    setToastState(
      text ? { id: Date.now() + Math.random(), text, error, undo } : undefined,
    );
  const [detailId, setDetailId] = useState<string>();
  // Links pasted with Ctrl+Shift+V wait here for a group name and the review choice.
  const [pasted, setPasted] = useState<{ text: string; count: number }>();
  const [groupName, setGroupName] = useState("");
  const [holdPasted, setHoldPasted] = useState(false);
  const [adding, setAdding] = useState(false);
  const shiftHeld = useRef(false);
  const [full, setFull] = useState<Job>();
  useEffect(() => {
    if (page === "history") void window.current?.checkFiles().catch(() => {});
  }, [page]);
  useEffect(() => window.current?.onNavigate(setPage), []);
  useEffect(
    () =>
      window.current?.onOpenJob((id) => {
        setPage("downloads");
        setDetailId(id);
      }),
    [],
  );
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void window.current
      ?.isMaximized()
      .then(setMaximized)
      .catch(() => {});
    return window.current?.onMaximized(setMaximized);
  }, []);
  useEffect(() => {
    if (!window.current) {
      setToast(
        "Open DriftFetch using the desktop app to connect to the download engine.",
        true,
      );
      return;
    }
    void window.current
      .snapshot()
      .then(setState)
      .catch((e) => setToast(String(e), true));
    return window.current.subscribe(setState);
  }, []);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timeout = setTimeout(
      () => setToastState(undefined),
      toast.undo ? undoSeconds * 1000 : 6500,
    );
    return () => clearTimeout(timeout);
  }, [toast]);
  async function execute(
    work: () => Promise<unknown>,
    success?: string,
    undoable = false,
  ) {
    try {
      await work();
      if (success)
        setToast(
          success,
          false,
          undoable
            ? () =>
                void execute(
                  () => window.current.undoRemove(),
                  "Restored to your list.",
                )
            : undefined,
        );
    } catch (e) {
      setToast(
        String(e).replace(
          /^Error: (Error invoking remote method '[^']+': Error: )?/,
          "",
        ),
        true,
      );
    }
  }
  const update = (patch: Partial<Settings>) =>
    execute(() => window.current.settings(patch));
  const act = (ids: string[], action: Action) =>
    execute(
      () => window.current.action(ids, action),
      action === "remove"
        ? ids.length === 1
          ? "Removed from your list."
          : `Removed ${ids.length} downloads.`
        : undefined,
      action === "remove",
    );
  const theme = state?.settings.theme;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system"
          ? media.matches
            ? "light"
            : "dark"
          : (theme ?? "dark");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  // Ctrl+V anywhere outside a text field or dialog adds the pasted links, like JDownloader.
  // It also works with the clipboard watcher on, so a watcher that misses a link is no problem;
  // a link the watcher already took is reported as already in the list.
  // Ctrl+Shift+V asks for a group name and whether to hold the links for review first.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      shiftHeld.current = e.shiftKey && (e.ctrlKey || e.metaKey);
    };
    document.addEventListener("keydown", keys, true);
    document.addEventListener("keyup", keys, true);
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector('[role="dialog"]')) return;
      const text = e.clipboardData?.getData("text") || "";
      if (!/https?:\/\//i.test(text)) return;
      e.preventDefault();
      if (shiftHeld.current) {
        setGroupName("");
        setHoldPasted(page === "review");
        setPasted({
          text,
          count: new Set(text.match(/https?:\/\/\S+/gi) ?? []).size,
        });
        return;
      }
      void execute(async () => {
        const result = await window.current.addLinks(text, page === "review");
        setToast(addedToast(result));
      });
    };
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("keydown", keys, true);
      document.removeEventListener("keyup", keys, true);
      document.removeEventListener("paste", paste);
    };
  }, [page]);
  async function addPasted() {
    if (!pasted) return;
    setAdding(true);
    await execute(async () => {
      const result = await window.current.addLinks(
        pasted.text,
        holdPasted || page === "review",
        groupName,
      );
      setToast(addedToast(result));
      setPasted(undefined);
    });
    setAdding(false);
  }
  const jobs = state?.jobs || [];
  // One pass over the list per snapshot; the counts below no longer rescan it on every render.
  const derived = useMemo(() => {
    const byId = new Map<string, Job>();
    const active: Job[] = [],
      queueJobs: Job[] = [],
      completed: Job[] = [],
      attention: Job[] = [];
    const sources = new Set<string>();
    let reviewCount = 0,
      waiting = 0,
      hasFinished = false;
    for (const j of state?.jobs ?? []) {
      byId.set(j.id, j);
      sources.add(j.source);
      if (terminal.includes(j.status)) hasFinished = true;
      else queueJobs.push(j);
      if (["downloading", "processing"].includes(j.status)) active.push(j);
      if (j.status === "completed") completed.push(j);
      if (j.status === "failed" && !j.retryAt) attention.push(j);
      if (j.status === "review") reviewCount++;
      if (
        ["queued", "review", "collection", "resolving", "paused"].includes(
          j.status,
        )
      )
        waiting++;
    }
    return {
      byId,
      active,
      queueJobs,
      completed,
      attention,
      reviewCount,
      waiting,
      hasFinished,
      sources: [...sources].sort(),
    };
  }, [state]);
  const { byId, active, queueJobs, completed } = derived;
  // Dialogs hold ids, not job copies: they follow live updates and close when the job is removed.
  const detail = detailId ? byId.get(detailId) : undefined;
  const collection = collectionId ? byId.get(collectionId) : undefined;
  // The snapshot omits formats of finished jobs; load them when details open.
  useEffect(() => {
    if (!detailId) return setFull(undefined);
    let live = true;
    void window.current
      .jobDetail(detailId)
      .then((job) => live && setFull(job))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [detailId, detail?.status, detail?.formatsCheckedAt]);
  const detailFull = detail && full?.id === detail.id ? full : detail;
  // Screen readers hear when a download finishes or fails.
  const reported = useRef<Set<string> | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const done = jobs.filter((j) => ["completed", "failed"].includes(j.status));
    const keys = new Set(done.map((j) => j.id + j.status));
    const previous = reported.current;
    reported.current = keys;
    if (!previous) return;
    const fresh = done.filter((j) => !previous.has(j.id + j.status));
    if (fresh.length === 1)
      setAnnouncement(
        (fresh[0].status === "completed" ? "Finished: " : "Needs attention: ") +
          fresh[0].title,
      );
    else if (fresh.length > 1)
      setAnnouncement(fresh.length + " downloads finished or need attention");
  }, [state]);
  const speed = active.reduce((sum, j) => sum + (j.speed || 0), 0);
  const showCollection = (job: Job) => {
    setCollectionId(job.id);
    setEntryIds(
      job.collectionKind === "images"
        ? job.entries?.map((entry) => entry.id) || []
        : [],
    );
  };
  const go = (next: Page) => {
    setDetailId(undefined);
    setPage(next);
  };
  const openSettings = (next?: SettingsSection) => {
    if (next) setSection(next);
    go("settings");
  };
  const title: Record<Page, [string, string]> = {
    review: [
      "Review queue",
      "Choose quality and start only the videos you want.",
    ],
    downloads: ["Downloads", "Copy a link and DriftFetch takes it from there."],
    history: ["History", "Everything you’ve saved or cancelled."],
    captures: ["Recent captures", "What happened to your last 100 links."],
    settings: ["Settings", ""],
  };
  const watching = state?.settings.clipboardWatch;
  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-name">
          <img className="title-icon" src="icon.png" alt="" />
          <strong>DriftFetch</strong>
          <i />
          <span>DOWNLOAD MANAGER</span>
        </div>
        <div className="window-buttons">
          <button
            aria-label="Minimize"
            title="Minimize"
            onClick={() =>
              void window.current?.windowAction("minimize").catch(() => {})
            }
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() =>
              void window.current?.windowAction("maximize").catch(() => {})
            }
          >
            {maximized ? (
              <Copy size={11} strokeWidth={1.5} />
            ) : (
              <Square size={11} strokeWidth={1.5} />
            )}
          </button>
          <button
            aria-label="Close to tray"
            title="Close to tray"
            className="close-window"
            onClick={() =>
              void window.current?.windowAction("close").catch(() => {})
            }
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-icon" src="icon.png" alt="" />
          <div className="brand-text">
            <strong>DriftFetch</strong>
            <span>Video &amp; image downloader</span>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main">
          <Nav
            active={page === "review"}
            icon={<ListChecks size={17} />}
            label="Review queue"
            count={derived.reviewCount}
            onClick={() => go("review")}
          />
          <Nav
            active={page === "downloads"}
            icon={<ArrowDownToLine size={17} />}
            label="Downloads"
            count={queueJobs.length}
            onClick={() => go("downloads")}
          />
          <Nav
            active={page === "history"}
            icon={<History size={17} />}
            label="History"
            onClick={() => go("history")}
          />
          <Nav
            active={page === "captures"}
            icon={<ClipboardList size={17} />}
            label="Recent captures"
            onClick={() => go("captures")}
          />
          <Nav
            active={page === "settings"}
            icon={<SlidersHorizontal size={17} />}
            label="Settings"
            className="settings-nav-item"
            onClick={() => openSettings()}
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={17} />
            <strong>Stays on this PC</strong>
            <p>Downloads, history and sign-ins never leave this computer.</p>
          </div>
          <button
            className="sidebar-folder"
            title="Open download folder"
            onClick={() => execute(() => window.current.openFolder())}
          >
            <Folder size={16} />
            <span>Download folder</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="version">
            <span
              className={`dot ${state?.engine.available ? "ok" : "bad"}`}
              title={
                state?.engine.available ? "Engine ready" : "Engine unavailable"
              }
            />
            <span className="version-text">
              {state?.engine.available ? "Engine ready" : "Engine unavailable"}
            </span>
            <span className="version-number">v{state?.appVersion || "…"}</span>
          </div>
        </div>
      </aside>
      <main>
        {!state ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            Connecting to DriftFetch…
          </div>
        ) : page === "settings" ? (
          <SettingsView
            state={state}
            update={update}
            execute={execute}
            section={section}
            setSection={setSection}
          />
        ) : (
          <div className="page">
            <div className="page-heading">
              <div>
                <h1>{title[page][0]}</h1>
                <p>{title[page][1]}</p>
              </div>
            </div>
            {page === "review" ? (
              <ReviewQueue
                state={state}
                detail={(job) => setDetailId(job.id)}
                preview={showCollection}
                execute={execute}
              />
            ) : page === "captures" ? (
              <section className="list-card" aria-label="Recent captures">
                <div className="toolbar">
                  <p className="list-note inline">
                    Captures include copied and pasted links. Private clipboard
                    text is never recorded.
                  </p>
                  <span className="grow" />
                  <ConfirmButton
                    className="btn sm"
                    confirmLabel="Clear the whole log?"
                    disabled={!state.captures.length}
                    onConfirm={() =>
                      void execute(() => window.current.clearCaptures())
                    }
                  >
                    <Trash2 size={14} />
                    <span className="btn-label">Clear log</span>
                  </ConfirmButton>
                </div>
                <div className="job-list">
                  {!state.captures.length && (
                    <div className="empty-state">
                      <div className="empty-tile">
                        <ClipboardList size={22} />
                      </div>
                      <h2>No links captured yet</h2>
                      <p>Copy a link, or press Ctrl+V to paste links.</p>
                    </div>
                  )}
                  {state.captures.map((c) => {
                    const job = c.jobId ? byId.get(c.jobId) : undefined;
                    return (
                      <button
                        className="capture-row"
                        key={c.id}
                        disabled={!job}
                        onClick={() => job && setDetailId(job.id)}
                      >
                        <span className="capture-main">
                          <strong>{job?.title || c.source}</strong>
                          <small>
                            {c.source} ·{" "}
                            {c.origin === "clipboard" ? "Clipboard" : "Pasted"}{" "}
                            · {new Date(c.at).toLocaleString()}
                          </small>
                        </span>
                        <span className="capture-status">
                          {c.duplicate
                            ? "Already in list"
                            : job
                              ? label(job)
                              : "Removed from list"}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <>
                {page === "downloads" && (
                  <>
                    <div className={`strip ${watching ? "" : "off"}`}>
                      <span className="strip-icon">
                        <Radio size={17} />
                      </span>
                      <div className="strip-text">
                        <strong>
                          {watching
                            ? "Listening for links"
                            : "Not watching the clipboard"}
                        </strong>
                        <span>
                          {watching
                            ? "Copy a video or gallery link in your browser and it appears here."
                            : "Copied links are ignored. Press Ctrl+V to paste links here, or turn Watch clipboard on. Ctrl+Shift+V pastes with a group name."}
                        </span>
                      </div>
                      <Switch
                        label="Watch clipboard"
                        value={state.settings.clipboardWatch}
                        onChange={(value) => update({ clipboardWatch: value })}
                      />
                      <i className="v-divider" />
                      <Switch
                        label="Auto-download"
                        value={state.settings.autoDownload}
                        onChange={(value) => update({ autoDownload: value })}
                      />
                    </div>
                    {(!state.engine.available ||
                      !state.engine.ffmpegAvailable) && (
                      <div className="note danger">
                        <CircleAlert size={16} />
                        <span>
                          {!state.engine.available
                            ? "The download engine is missing. Install it in Settings → Advanced."
                            : "FFmpeg is missing. Reinstall DriftFetch to restore its bundled tools."}
                        </span>
                        <button
                          className="link-button"
                          onClick={() => openSettings("advanced")}
                        >
                          Open settings <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                    <div className="stats">
                      <Stat
                        icon={<ArrowDownToLine size={16} />}
                        label="DOWNLOADING"
                        value={String(active.length)}
                        note={
                          speed
                            ? `${bytes(speed)}/s combined`
                            : "Nothing running"
                        }
                        live={active.length > 0}
                      />
                      <Stat
                        icon={<Layers size={16} />}
                        label="IN QUEUE"
                        value={String(derived.waiting)}
                        note={
                          state.settings.concurrency
                            ? `${state.settings.concurrency} at a time`
                            : "No limit"
                        }
                      />
                      <Stat
                        icon={<CheckCheck size={16} />}
                        label="COMPLETED"
                        value={String(completed.length)}
                        note="Saved to this PC"
                      />
                      <Stat
                        icon={<Gauge size={16} />}
                        label="DEFAULT QUALITY"
                        value={
                          state.settings.quality === "best"
                            ? "Best"
                            : `${state.settings.quality}p`
                        }
                        note={
                          state.settings.quality === "best"
                            ? "Highest the site offers"
                            : "Resolution limit"
                        }
                      />
                    </div>
                  </>
                )}
                <JobList
                  key={page}
                  page={page}
                  state={state}
                  derived={derived}
                  execute={execute}
                  act={act}
                  details={(id) => setDetailId(id)}
                  collection={showCollection}
                  openSettings={() => openSettings("quality")}
                />
              </>
            )}
          </div>
        )}
      </main>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      {state && state.settings.privacyNoticeVersion < privacyNote.version && (
        <Modal
          title="Before you start"
          subtitle="How DriftFetch handles your data."
          close={() =>
            void update({ privacyNoticeVersion: privacyNote.version })
          }
        >
          <PrivacyNote />
          <div className="modal-actions">
            <button
              className="btn primary"
              onClick={() =>
                void update({ privacyNoticeVersion: privacyNote.version })
              }
            >
              I understand
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={toast.error ? "toast error" : "toast"}
          role={toast.error ? "alert" : "status"}
          key={toast.id}
        >
          <span className="toast-icon">
            {toast.error ? (
              <CircleAlert size={15} />
            ) : toast.undo ? (
              <Trash2 size={15} />
            ) : (
              <CircleCheck size={15} />
            )}
          </span>
          <span className="toast-text">{toast.text}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undo?.();
              }}
            >
              Undo
            </button>
          )}
          {(toast.error || !toast.undo) && (
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          )}
          {toast.undo && (
            <span
              className="toast-bar"
              style={{ animationDuration: `${undoSeconds}s` }}
            />
          )}
        </div>
      )}
      {pasted && (
        <Modal
          title="Add pasted links"
          subtitle="Choose a group and whether to look at them before they download."
          close={() => !adding && setPasted(undefined)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void addPasted();
            }}
          >
            <label>
              <span className="label-line">
                Group name <span className="muted">· optional</span>
              </span>
              <input
                autoFocus
                aria-label="Download group"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="For example: Holiday videos"
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                aria-label="Hold links for review"
                checked={holdPasted || page === "review"}
                disabled={page === "review"}
                onChange={(e) => setHoldPasted(e.target.checked)}
              />
              Hold for review before downloading
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={adding}
                onClick={() => setPasted(undefined)}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={adding}>
                Add {pasted.count} link{pasted.count === 1 ? "" : "s"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {collection && (
        <Modal
          title={
            collection.collectionKind === "images"
              ? "Choose images to download"
              : "Choose videos to download"
          }
          subtitle={`${collection.title} · ${collection.source} · ${collection.entries?.length ?? 0} ${collectionNoun(collection)}`}
          close={() => setCollectionId(undefined)}
          wide
          bare
        >
          <CollectionPreview
            key={collection.id}
            job={collection}
            selected={entryIds}
            change={setEntryIds}
            cancel={() => setCollectionId(undefined)}
            confirm={() =>
              execute(async () => {
                const result = await window.current.selectCollection(
                  collection.id,
                  entryIds,
                );
                setCollectionId(undefined);
                if (result?.duplicates)
                  setToast(
                    `${result.added} added · ${result.duplicates} already downloaded or in your list. Remove the earlier copy from History to download it again.`,
                  );
              })
            }
          />
        </Modal>
      )}
      {detail && detailFull && (
        <DetailsPanel
          key={detail.id}
          detail={detail}
          full={detailFull}
          jobs={jobs}
          state={state}
          execute={execute}
          act={act}
          open={(job) => setDetailId(job.id)}
          collection={(job) => {
            setDetailId(undefined);
            showCollection(job);
          }}
          close={() => setDetailId(undefined)}
        />
      )}
    </div>
  );
}
function Nav({
  active,
  icon,
  label,
  count,
  className,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""} ${className ?? ""}`}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={onClick}
    >
      {icon}
      <span className="nav-label">{label}</span>
      {!!count && <b>{count}</b>}
    </button>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
  live,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  live?: boolean;
}) {
  return (
    <div className={`stat ${live ? "live" : ""}`}>
      <div className="stat-top">
        {label}
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        {live && <span className="dot cyan" />}
        {note}
      </div>
    </div>
  );
}
