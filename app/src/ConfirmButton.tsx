import { useEffect, useState, type ComponentProps } from "react";

/** First click arms the button, a second click within 4 s confirms. */
export function ConfirmButton({
  children,
  confirmLabel = "Click again to confirm",
  onConfirm,
  ...rest
}: Omit<ComponentProps<"button">, "onClick"> & {
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      {...rest}
      className={armed ? `${rest.className ?? ""} armed` : rest.className}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
