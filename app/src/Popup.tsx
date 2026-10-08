import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Film, Images, LoaderCircle, X } from "lucide-react";
import { collectionNoun, statusLabel } from "./format";
import "./tokens.css";
import "./popup.css";
type Item = {
  id: string;
  jobId?: string;
  thumbnail?: string;
  source: string;
  title: string;
  status: string;
  quality?: string;
  collectionKind?: "images" | "videos";
};
type State = {
  checking: boolean;
  theme?: "dark" | "light" | "system";
  items: Item[];
};
declare global {
  interface Window {
    capturePopup: {
      action(action: string): void;
      subscribe(fn: (state: State) => void): () => void;
    };
  }
}
const tone = (status: string) =>
  ["downloading", "processing", "resolving", "queued"].includes(status)
    ? "cyan"
    : ["review", "collection"].includes(status)
      ? "accent"
      : status === "completed"
        ? "ok"
        : status === "failed"
          ? "danger"
          : "muted";
/** A download can still be stopped, or its quality chosen, until it has finished. */
const open = ["resolving", "review", "queued", "downloading", "paused"];
function Popup() {
  const [state, setState] = useState<State>({ checking: true, items: [] });
  const imageGalleries = state.items.filter(
    (item) => item.collectionKind === "images",
  );
  useEffect(() => window.capturePopup.subscribe(setState), []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme =
        state.theme === "system"
          ? media.matches
            ? "light"
            : "dark"
          : (state.theme ?? "dark");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);
  // One capture gets the quick actions; several share the plain footer.
  const only = state.items.length === 1 ? state.items[0] : undefined;
  const actionable = !!only?.jobId && open.includes(only.status);
  return (
    <section
      onMouseEnter={() => window.capturePopup.action("hover")}
      onMouseLeave={() => window.capturePopup.action("leave")}
    >
      <header>
        <img src="icon.png" alt="" />
        <strong>
          {state.checking
            ? "Checking your links"
            : imageGalleries.length
              ? `${imageGalleries.length === 1 ? "Image gallery" : "Image galleries"} found`
              : state.items.length === 1
                ? "Link captured"
                : "Links captured"}
        </strong>
        <small>{state.items.length} captured</small>
        <button
          aria-label="Dismiss notification"
          onClick={() => window.capturePopup.action("dismiss")}
        >
          <X size={14} />
        </button>
      </header>
      <div className="items">
        {state.items.map((item) => (
          <article key={item.id}>
            <div className="slot">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" />
              ) : item.status === "resolving" ? (
                <LoaderCircle size={15} className="spin" />
              ) : item.collectionKind === "images" ? (
                <Images size={15} />
              ) : (
                <Film size={15} />
              )}
            </div>
            <div className="text">
              <strong title={item.title}>{item.title}</strong>
              <small>
                {item.source}
                {item.quality && item.quality !== "Unknown" && (
                  <span className="quality">{item.quality}</span>
                )}
              </small>
              <span className={`state ${tone(item.status)}`}>
                <i />
                {statusLabel(
                  item.status,
                  item.collectionKind,
                  collectionNoun(item),
                )}
              </span>
            </div>
          </article>
        ))}
      </div>
      <footer>
        {only ? (
          <div className="actions">
            {actionable && (
              <button
                onClick={() =>
                  window.capturePopup.action(`choose:${only.jobId}`)
                }
              >
                Choose quality
              </button>
            )}
            <button onClick={() => window.capturePopup.action("open")}>
              Open DriftFetch
            </button>
            {actionable && (
              <button
                className="danger"
                onClick={() =>
                  window.capturePopup.action(`cancel:${only.jobId}`)
                }
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <>
            <span>
              {state.items.filter((i) => i.status === "failed").length} need
              attention ·{" "}
              {state.items.filter((i) => i.status === "duplicate").length}{" "}
              duplicates
            </span>
            <button onClick={() => window.capturePopup.action("open")}>
              Open DriftFetch
            </button>
          </>
        )}
      </footer>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
