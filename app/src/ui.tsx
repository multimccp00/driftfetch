import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Film, Images, LoaderCircle, UserRound } from "lucide-react";
import type { Job } from "./shared";

/** A labelled on/off control. The label is also the accessible name. */
export function Switch({
  label,
  value,
  onChange,
  hideLabel,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="switch-control">
      {!hideLabel && <span>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        className={`switch ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </label>
  );
}

// Thumbnails are fetched by the main process; a short-lived cache keeps rows
// that scroll out and back from asking again.
const thumbs = new Map<string, { at: number; data: string | null }>();
const retryAfter = 60_000;
// Thumbnails are data URLs; keep the newest few hundred so a long list can't hold them all.
const keep = 300;

function useThumbnail(job: Job) {
  const source =
    job.thumbnailUrl ||
    job.entries?.find((entry) => entry.thumbnail)?.thumbnail;
  const key = source ? job.id + source : "";
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<string | null>(
    () => thumbs.get(key)?.data ?? null,
  );
  useEffect(() => {
    const hit = thumbs.get(key);
    setData(hit?.data ?? null);
    if (!key || (hit && (hit.data || Date.now() - hit.at < retryAfter))) return;
    let live = true;
    const load = () =>
      Promise.resolve()
        .then(() => window.current.jobThumbnail(job.id))
        .catch(() => null)
        .then((image) => {
          thumbs.delete(key);
          thumbs.set(key, { at: Date.now(), data: image ?? null });
          while (thumbs.size > keep) thumbs.delete(thumbs.keys().next().value!);
          if (live) setData(image ?? null);
        });
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      void load();
      return () => {
        live = false;
      };
    }
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    });
    observer.observe(node);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [key, job.id]);
  return { ref, data };
}

/** The thumbnail slot: the source image when there is one, a hatch and a glyph otherwise. */
export function Thumb({ job, size = "md" }: { job: Job; size?: "md" | "lg" }) {
  const { ref, data } = useThumbnail(job);
  const px = size === "lg" ? 18 : 16;
  const glyph =
    job.status === "resolving" ? (
      <LoaderCircle size={px} className="spin" />
    ) : job.linkType === "profile" ? (
      <UserRound size={px} />
    ) : job.collectionKind === "images" || job.entries?.length ? (
      <Images size={px} />
    ) : (
      <Film size={px} />
    );
  const count =
    job.status === "collection" && job.entries && job.entries.length > 1
      ? job.entries.length
      : 0;
  return (
    <div
      ref={ref}
      className={`thumb ${size} ${job.status === "duplicate" ? "dim" : ""}`}
      aria-hidden="true"
    >
      {count > 0 && <span className="thumb-stack" />}
      <div className="thumb-face">
        {data ? <img src={data} alt="" draggable={false} /> : glyph}
      </div>
      {count > 0 && (
        <span className="thumb-count">
          <Images size={9} strokeWidth={2.25} />
          {count}
        </span>
      )}
    </div>
  );
}

/** Arrow keys, Home and End move through a radio group and pick the radio they land on. */
export function radioKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const forward = ["ArrowDown", "ArrowRight"];
  if (![...forward, "ArrowUp", "ArrowLeft", "Home", "End"].includes(e.key))
    return;
  const radios = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(
      '[role="radio"]:not(:disabled)',
    ),
  ];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const to =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? radios.length - 1
        : (at + (forward.includes(e.key) ? 1 : -1) + radios.length) %
          radios.length;
  radios[to].focus();
  radios[to].click();
}
