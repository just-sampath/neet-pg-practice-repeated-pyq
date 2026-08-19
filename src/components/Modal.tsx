import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onClose: () => void;
}

export default function Modal({
  title,
  children,
  confirmLabel,
  tone = "default",
  onConfirm,
  onClose,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title">{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__actions">
          <button ref={closeRef} className="button button--quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={tone === "danger" ? "button button--danger" : "button button--primary"}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
