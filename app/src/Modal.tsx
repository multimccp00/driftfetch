import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

const focusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog over the whole window, or (`side`) a panel sliding in from the right.
 * Focus is trapped, Esc closes, and everything behind becomes inert.
 * A dialog's children go into a scrolling body; `bare` lets them bring their own body and footer.
 */
export function Modal({
  title,
  subtitle,
  close,
  children,
  wide,
  side,
  bare,
  header,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
  bare?: boolean;
  /** Replaces the title block (the side panel shows a thumbnail and meta line). */
  header?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const id = useId();
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    // An autoFocus field inside the dialog keeps focus; otherwise take it.
    if (!dialogRef.current?.contains(document.activeElement))
      dialogRef.current?.focus();
    // Everything behind the dialog becomes unreachable.
    const backdrop = backdropRef.current;
    const background = [...(backdrop?.parentElement?.children ?? [])].filter(
      (element): element is HTMLElement =>
        element !== backdrop &&
        element instanceof HTMLElement &&
        // Toasts must still be announced.
        !element.matches('[role="status"], [role="alert"], [aria-live]'),
    );
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => {
      background.forEach((element) => element.removeAttribute("inert"));
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  // Keep Tab inside the dialog.
  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? []),
    ];
    if (!items.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      ref={backdropRef}
      className={side ? "modal-backdrop side" : "modal-backdrop"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={subtitle ? `${id}-subtitle` : undefined}
        className={
          side ? "side-panel" : wide ? "modal collection-modal" : "modal"
        }
        tabIndex={-1}
        onKeyDown={trap}
      >
        <div className="modal-head">
          {header}
          <div className="modal-titles">
            <h2 id={`${id}-title`} className={side ? "panel-title" : undefined}>
              {title}
            </h2>
            {subtitle && (
              <p id={`${id}-subtitle`} className="modal-subtitle">
                {subtitle}
              </p>
            )}
          </div>
          <button
            className="icon-button modal-close"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={16} />
          </button>
        </div>
        {bare || side ? children : <div className="modal-body">{children}</div>}
      </section>
    </div>
  );
}
