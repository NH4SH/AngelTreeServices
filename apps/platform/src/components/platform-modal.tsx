"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Props = {
  children: ReactNode;
  className: string;
  label?: string;
  labelledBy?: string;
  closeHref?: string;
  onDismiss?: () => void;
};

let scrollLocks = 0;
let previousOverflow = "";

// Native modal dialogs keep background content inert, including nested overlays.
export function PlatformModal({ children, className, label, labelledBy, closeHref, onDismiss }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks++ === 0) previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const initialFocus = dialog.querySelector<HTMLElement>("[data-modal-initial-focus]")
      ?? dialog.querySelector<HTMLElement>('button:not(:disabled):not([aria-hidden="true"]), a[href]:not([aria-hidden="true"]), input:not(:disabled):not([type="hidden"])');
    initialFocus?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      const destination = opener?.isConnected && opener !== document.body
        ? opener : document.getElementById("platform-main-content");
      destination?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`platform-modal ${className}`}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        if (onDismiss) onDismiss();
        else if (closeHref) router.replace(closeHref, { scroll: false });
      }}
      ref={ref}
    >
      {children}
    </dialog>
  );
}
