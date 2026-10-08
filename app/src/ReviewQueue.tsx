import { useState } from "react";
import { ChevronDown, ListChecks, Play, Search, X } from "lucide-react";
import type { Job, Snapshot } from "./shared";
import { qualityWarning } from "../shared/quality";
import { bytes, clock } from "./format";
import { Thumb } from "./ui";

/** Links added with "Hold for review": pick quality and start only what you want. */
export function ReviewQueue({
  state,
  detail,
  preview,
  execute,
}: {
  state: Snapshot;
  detail: (job: Job) => void;
  preview: (job: Job) => void;
  execute: (work: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const jobs = state.jobs.filter(
    (j) =>
      j.status === "review" &&
      `${j.title} ${j.source}`.toLowerCase().includes(search.toLowerCase()),
  );
  const collections = state.jobs.filter(
    (job) =>
      job.status === "collection" &&
      `${job.title} ${job.source}`.toLowerCase().includes(search.toLowerCase()),
  );
  const ids = jobs
    .filter((j) => selected.includes(j.id) && !j.refreshing)
    .map((j) => j.id)
    .slice(0, 500);
  return (
    <section className="list-card review-card" aria-label="Review queue">
      <div className="toolbar">
        <div className="field search-field">
          <Search size={15} />
          <input
            aria-label="Search review queue"
            placeholder="Search titles or sources"
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
        <span className="grow" />
        <button
          className="btn sm"
          disabled={!jobs.some((j) => !j.refreshing)}
          onClick={() =>
            setSelected(
              jobs
                .filter((j) => !j.refreshing)
                .slice(0, 500)
                .map((j) => j.id),
            )
          }
        >
          Select visible (first 500)
        </button>
        <button
          className="btn sm"
          disabled={!selected.length}
          onClick={() => setSelected([])}
        >
          Clear selection
        </button>
        <button
          className="btn sm primary"
          disabled={!ids.length}
          onClick={() =>
            execute(async () => {
              await window.current.action(ids, "start");
              setSelected([]);
            })
          }
        >
          <Play size={14} strokeWidth={2} />
          Start selected ({ids.length})
        </button>
      </div>
      <p className="list-note">
        Links added here wait for your selection, even with Auto-download on.
        Sizes are estimates; separate audio and merging can need more space.
      </p>
      <div className="job-list">
        {collections.map((job) => (
          <div className="review-row" key={job.id}>
            <span />
            <Thumb job={job} />
            <div className="video-text">
              <button className="video-title" onClick={() => detail(job)}>
                {job.title}
              </button>
              <div className="video-meta">
                <span>{job.source}</span>
                <span>
                  {job.entries?.length || 0} items waiting for selection
                </span>
              </div>
            </div>
            <div className="review-controls">
              <button className="btn" onClick={() => preview(job)}>
                <ListChecks size={15} />
                Preview &amp; select
              </button>
            </div>
          </div>
        ))}
        {jobs.map((job) => {
          const format = job.formats?.find(
            (f) => f.id === job.selectedFormatId,
          );
          const size = format?.size || job.totalBytes;
          const warning = qualityWarning(job, state.settings);
          return (
            <div className="review-row" key={job.id}>
              <input
                type="checkbox"
                aria-label={`Review ${job.title}`}
                checked={selected.includes(job.id)}
                disabled={job.refreshing}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, job.id]
                      : selected.filter((id) => id !== job.id),
                  )
                }
              />
              <Thumb job={job} />
              <div className="video-text">
                <button className="video-title" onClick={() => detail(job)}>
                  {job.title}
                </button>
                <div className="video-meta">
                  <span>{job.source}</span>
                  {job.duration ? (
                    <span className="num">{clock(job.duration)}</span>
                  ) : null}
                  <span>
                    {size ? `${bytes(size)} estimated` : "Size unknown"}
                  </span>
                </div>
                {warning && <p className="row-warning">{warning}</p>}
                {job.formatsError && (
                  <p className="row-warning">{job.formatsError}</p>
                )}
              </div>
              <div className="review-controls">
                <label className="select-field">
                  <select
                    aria-label={`Quality for ${job.title}`}
                    disabled={job.refreshing || !!job.targetDir}
                    value={job.selectedFormatId || ""}
                    onChange={(e) =>
                      execute(() =>
                        window.current.setFormat(job.id, e.target.value),
                      )
                    }
                  >
                    <option value="">Automatic</option>
                    {job.formats?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.height ? `${f.height}p` : "Unknown resolution"} ·{" "}
                        {f.id}
                        {f.separateAudio ? " + audio" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button
                  className="btn sm"
                  disabled={job.refreshing}
                  onClick={() =>
                    execute(() => window.current.refreshFormats(job.id))
                  }
                >
                  {job.refreshing ? "Checking…" : "Recheck formats"}
                </button>
              </div>
            </div>
          );
        })}
        {!jobs.length && !collections.length && (
          <div className="empty-state">
            <div className="empty-tile">
              <ListChecks size={22} />
            </div>
            <h2>Nothing to review</h2>
            <p>
              Press Ctrl+V on this page to paste links. They wait here so you
              can look at the quality before anything downloads.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
