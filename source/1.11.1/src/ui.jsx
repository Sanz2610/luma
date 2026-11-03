import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function IconButton({ label, children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function Modal({ title, children, onClose, className = "", onKeyDown }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      box = ref.current;
    (
      box.querySelector("[data-initial-focus]") ||
      box.querySelector("input,button,select") ||
      box
    ).focus();
    const handler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const controls = [
          ...box.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === controls.at(-1)
        ) {
          event.preventDefault();
          controls[0]?.focus();
        }
      }
    };
    box.addEventListener("keydown", handler);
    return () => {
      box.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div
      className={`modal-scrim ${className}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="modal-title">
          <h2>{title}</h2>
          <IconButton data-folder-action label="Close dialog" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
export const number = (value) => new Intl.NumberFormat("en-US").format(value);
export const bytes = (value) =>
  value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
export const basename = (value) =>
  value?.split(/[\\/]/).filter(Boolean).at(-1) || "";
export const errorText = (error) =>
  error.message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
