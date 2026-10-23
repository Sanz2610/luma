import React, { useCallback, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "./api";
import { errorText, Modal, number } from "./ui";

// Keep the requested IDs fixed while the confirmation is open, even if the
// library changes underneath it. The main process revalidates every file.
export function usePhotoDeletion({ confirmDelete = true, onResult } = {}) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(null);
  const locked = useRef(false);
  const execute = useCallback(
    async (ids) => {
      if (locked.current) return;
      locked.current = true;
      setBusy(true);
      try {
        const result = await api.trash(ids);
        setPending(null);
        if (result.failed.length) setFailures(result.failed);
        onResult?.(result);
      } catch (cause) {
        setPending(null);
        setError(errorText(cause));
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [onResult],
  );
  const request = useCallback(
    (ids) => {
      if (locked.current || !ids.length) return;
      const unique = [...new Set(ids)];
      if (confirmDelete) setPending(unique);
      else execute(unique);
    },
    [confirmDelete, execute],
  );
  const cancel = useCallback(() => {
    if (!locked.current) setPending(null);
  }, []);
  const closeError = useCallback(() => setError(""), []);
  const closeFailures = useCallback(() => setFailures(null), []);
  return {
    request,
    execute,
    pending,
    busy,
    error,
    failures,
    cancel,
    closeError,
    closeFailures,
    open: !!pending || busy || !!error || !!failures,
  };
}

export default function PhotoDeletion({ state }) {
  return (
    <>
      {state.busy && !state.pending && (
        <div className="toast deletion-status" role="status">
          <LoaderCircle className="spin" size={16} />
          Moving photos to Recycle Bin…
        </div>
      )}
      {state.pending && (
        <Modal title="Move photos to Recycle Bin?" onClose={state.cancel}>
          <div className="delete-symbol">
            <Trash2 size={27} />
          </div>
          <p className="modal-description">
            <strong>
              {number(state.pending.length)}{" "}
              {state.pending.length === 1 ? "photo" : "photos"}
            </strong>{" "}
            will be moved from the original folder to Windows Recycle Bin.
          </p>
          <p className="recycle-note">
            <ShieldCheck size={16} />
            You can restore them from Recycle Bin.
          </p>
          {state.busy && (
            <p className="delete-progress" role="status">
              <LoaderCircle className="spin" size={16} />
              Moving photos…
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button"
              onClick={state.cancel}
              disabled={state.busy}
            >
              Keep photos
            </button>
            <button
              className="button danger"
              onClick={() => state.execute(state.pending)}
              disabled={state.busy}
            >
              <Trash2 size={15} />
              {state.busy ? "Moving…" : "Move to Recycle Bin"}
            </button>
          </div>
        </Modal>
      )}
      {state.error && (
        <Modal title="Could not delete photos" onClose={state.closeError}>
          <p className="modal-description" role="alert">
            {state.error}
          </p>
          <div className="modal-actions">
            <button className="button" onClick={state.closeError}>
              Close
            </button>
          </div>
        </Modal>
      )}
      {state.failures && (
        <Modal
          title="Some photos could not be deleted"
          onClose={state.closeFailures}
        >
          <p className="modal-description">
            These files are still in their original folders.
          </p>
          <ul className="failure-list">
            {state.failures.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="button" onClick={state.closeFailures}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
