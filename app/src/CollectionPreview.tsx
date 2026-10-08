import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Image,
  Maximize2,
  Search,
} from "lucide-react";
import type { Entry, Job } from "./shared";
import { collectionNoun } from "./format";

// A stable empty list keeps the memos below from rerunning every render.
const EMPTY: Entry[] = [];

/** The picker for an album, playlist or profile: tick what to download, then confirm. */
export function CollectionPreview({
  job,
  selected,
  change,
  confirm,
  cancel,
}: {
  job: Job;
  selected: string[];
  change: (ids: string[]) => void;
  confirm: () => Promise<void>;
  cancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [large, setLarge] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Every snapshot hands over a fresh job object; the entry list only changes with its length,
  // so it must not restart the thumbnail loading each time a download elsewhere makes progress.
  const entries = useMemo(
    () => job.entries || EMPTY,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job.id, job.entries?.length],
  );
  const videos = collectionNoun(job) === "videos";
  // Typing in a 10k-item gallery should not refilter and refetch on every key.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 150);
    return () => clearTimeout(timer);
  }, [search]);
  const find = (term: string) =>
    entries.filter((entry) =>
      `${entry.title} ${entry.id}`.toLowerCase().includes(term.toLowerCase()),
    );
  const filtered = useMemo(() => find(query), [entries, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const visible = useMemo(
    () => filtered.slice(page * 12, page * 12 + 12),
    [filtered, page],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // Thumbnails already fetched stay across pages; only new entries are requested.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false,
      cursor = 0;
    // What this run has in flight: if the run is replaced, those must be asked for again.
    const mine = new Set<string>();
    setLarge(undefined);
    const work = async () => {
      while (!stopped && cursor < visible.length) {
        const entry = visible[cursor++];
        if (requested.current.has(entry.id)) continue;
        requested.current.add(entry.id);
        mine.add(entry.id);
        const data = await window.current
          .previewCollectionEntry(job.id, entry.id)
          .catch(() => null);
        if (stopped) return;
        mine.delete(entry.id);
        setImages((current) => ({ ...current, [entry.id]: data }));
      }
    };
    void Promise.all([work(), work()]);
    return () => {
      stopped = true;
      for (const id of mine) requested.current.delete(id);
      void window.current.cancelCollectionPreviews(job.id).catch(() => {});
    };
  }, [job.id, visible]);
  // Escape leaves the enlarged image, not the whole dialog.
  useEffect(() => {
    if (!large) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setLarge(undefined);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [large]);
  const toggle = (entry: Entry) =>
    change(
      selectedSet.has(entry.id)
        ? selected.filter((id) => id !== entry.id)
        : [...selected, entry.id],
    );
  const noun = collectionNoun(job);
  return (
    <>
      <div className="modal-body picker-body">
        <div className="picker-toolbar">
          <label className="field search-field">
            <Search size={14} />
            <input
              aria-label="Search collection items"
              placeholder="Search titles or item IDs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <button
            className="btn quiet"
            disabled={busy || !filtered.length}
            onClick={() =>
              // The typed text, not the debounced one, so a quick click selects what is typed.
              change([
                ...new Set([
                  ...selected,
                  ...find(search).map((entry) => entry.id),
                ]),
              ])
            }
          >
            {search ? "Select all results" : `Select all ${entries.length}`}
          </button>
          <button
            className="btn quiet"
            disabled={busy || !visible.length}
            onClick={() =>
              change([
                ...new Set([...selected, ...visible.map((entry) => entry.id)]),
              ])
            }
          >
            Select this page
          </button>
          <button
            className="btn quiet"
            disabled={busy || !selected.length}
            onClick={() => change([])}
          >
            Clear selection
          </button>
          <span className="grow" />
          <span className="count-line num" aria-live="polite">
            <strong>{selected.length}</strong> of {entries.length} selected
          </span>
        </div>
        {job.collectionLimited && (
          <div className="note wait">
            This list may be incomplete. Only the selected entries will be
            added.
          </div>
        )}
        {large && images[large] ? (
          <div className="preview-large">
            <button className="btn" onClick={() => setLarge(undefined)}>
              <ChevronLeft size={15} /> Back to items
            </button>
            <img
              src={images[large]!}
              alt={
                entries.find((entry) => entry.id === large)?.title ||
                "Item preview"
              }
            />
          </div>
        ) : (
          <div className="picker-grid">
            {visible.map((entry, index) => {
              const on = selectedSet.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`tile ${on ? "on" : ""}`}
                  onClick={() => !busy && toggle(entry)}
                >
                  <div className={`tile-image ${videos ? "wide" : ""}`}>
                    {images[entry.id] ? (
                      <img
                        src={images[entry.id]!}
                        alt=""
                        onError={() =>
                          setImages((current) => ({
                            ...current,
                            [entry.id]: null,
                          }))
                        }
                      />
                    ) : (
                      <span className="tile-empty">
                        <Image size={22} />
                        {images[entry.id] === null
                          ? "No preview"
                          : "Loading preview…"}
                      </span>
                    )}
                    <input
                      type="checkbox"
                      className="tile-check"
                      aria-label={`Select ${entry.title}`}
                      checked={on}
                      disabled={busy}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(entry)}
                    />
                    <button
                      className="tile-enlarge"
                      aria-label={`Enlarge preview: ${entry.title}`}
                      title="Enlarge"
                      disabled={!images[entry.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLarge(entry.id);
                      }}
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>
                  <div className="tile-caption">
                    <span title={entry.title}>
                      {entry.title || `Item ${page * 12 + index + 1}`}
                    </span>
                  </div>
                </div>
              );
            })}
            {!filtered.length && <p className="plain">No matching items.</p>}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button
          className="btn icon"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="num page-line">
          Page {page + 1} of {pages}
        </span>
        <button
          className="btn icon"
          aria-label="Next page"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
        <span className="fine hint">
          Closing keeps the {noun === "videos" ? "list" : "album"} waiting in
          your list.
        </span>
        <span className="grow" />
        <button className="btn" onClick={cancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || !selected.length}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            "Adding…"
          ) : (
            <>
              <ArrowDownToLine size={15} strokeWidth={2} />
              Download {selected.length} selected
            </>
          )}
        </button>
      </div>
    </>
  );
}
