import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, FolderInput, LoaderCircle } from "lucide-react";
import { api } from "./api";
import { errorText, Modal, number } from "./ui";

export function usePhotoTransfer({ onResult } = {}) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("copy");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(null);
  useEffect(() => api.onTransfer(setProgress), []);
  const request = useCallback(
    async (ids, mode) => {
      if (locked.current || !ids.length) return;
      locked.current = true;
      setMode(mode);
      setProgress(null);
      setBusy(true);
      try {
        const result = await api.transfer([...new Set(ids)], mode);
        if (result) {
          if (result.failed.length) setFailures(result.failed);
          onResult?.(result, mode);
        }
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [onResult],
  );
  const close = useCallback(() => {
    setError("");
    setFailures(null);
  }, []);
  return {
    request,
    busy,
    mode,
    progress,
    error,
    failures,
    close,
    open: busy || !!error || !!failures,
  };
}

export default function PhotoTransfer({ state }) {
  const moving = state.mode === "move";
  return (
    <>
      {state.busy && (
        <Modal
          className="transfer-scrim"
          title={
            state.progress
              ? moving
                ? "Moving files…"
                : "Copying files…"
              : "Choose destination folder"
          }
          onClose={state.close}
          dismissible={false}
        >
          <p className="transfer-progress" role="status">
            <LoaderCircle className="spin" size={18} />
            {state.progress
              ? `${number(state.progress.done)} of ${number(state.progress.total)} files`
              : "Select a folder in the Windows dialog."}
          </p>
          <p className="modal-description">
            Existing files are kept. Duplicate names get a number.
          </p>
        </Modal>
      )}
      {(state.error || state.failures) && (
        <Modal
          className="transfer-scrim"
          title={
            moving
              ? "Some files could not be moved"
              : "Some files could not be copied"
          }
          onClose={state.close}
        >
          {state.error && (
            <p className="modal-description" role="alert">
              {state.error}
            </p>
          )}
          {state.failures && (
            <ul className="failure-list">
              {state.failures.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button className="button" onClick={state.close}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function TransferButtons({ selected, onTransfer }) {
  return (
    <>
      <button
        className="button"
        disabled={!selected.size}
        onClick={() => onTransfer([...selected], "move")}
      >
        <FolderInput size={15} />
        Move to…
      </button>
      <button
        className="button"
        disabled={!selected.size}
        onClick={() => onTransfer([...selected], "copy")}
      >
        <Copy size={15} />
        Copy to…
      </button>
    </>
  );
}
