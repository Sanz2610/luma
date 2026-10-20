import React, { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { api } from "./api";
import { version } from "../package.json";

export function useUpdates() {
  const [state, setState] = useState({
    version,
    mode: "development",
    status: "disabled",
    automatic: true,
  });
  useEffect(() => {
    let live = true;
    const update = (value) => {
      if (live) setState(value);
    };
    const unsubscribe = api.onUpdates?.(update);
    api
      .updateState?.()
      .then(update)
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);
  return state;
}
export default function Updates({ state }) {
  const [error, setError] = useState("");
  const action = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const busy = ["checking", "downloading", "installing"].includes(state.status);
  const messages = {
    disabled: "Updates are available in the packaged Windows app.",
    idle: "Check for a newer version of Luma.",
    checking: "Checking for updates…",
    current: "You're up to date.",
    available: `Luma ${state.nextVersion} is available.`,
    downloading: `Downloading ${state.nextVersion} · ${Math.round(state.percent || 0)}%`,
    ready: `Luma ${state.nextVersion} is ready to install.`,
    installing: "Opening the update installer…",
    error: state.message,
  };
  return (
    <section className="settings-section update-section">
      <h3>
        <RefreshCw size={17} /> Updates
      </h3>
      <p>
        Luma {state.version || version}
        {state.mode === "portable" ? " · Portable" : ""}
      </p>
      <p role="status">{messages[state.status] || messages.idle}</p>
      {state.mode !== "development" && (
        <>
          <div className="setting-row">
            <label htmlFor="automatic-updates">Automatic updates</label>
            <button
              id="automatic-updates"
              role="switch"
              aria-checked={state.automatic}
              className={`switch ${state.automatic ? "on" : ""}`}
              onClick={() =>
                action(() => api.setAutomaticUpdates(!state.automatic))
              }
            >
              <span />
            </button>
          </div>
          <p>
            {state.mode === "portable"
              ? "Checks automatically. Download a new portable file from Releases."
              : "Checks and downloads in the background. Restart when you're ready; Windows may ask for Administrator access."}
          </p>
          {state.status === "downloading" && (
            <progress
              aria-label="Update download progress"
              value={state.percent}
              max="100"
            />
          )}
          <div className="update-actions">
            <button
              className="button"
              disabled={busy || state.status === "ready"}
              onClick={() => action(() => api.checkUpdates())}
            >
              Check for updates
            </button>
            {state.mode === "installed" &&
              ["available", "error"].includes(state.status) &&
              state.nextVersion && (
                <button
                  className="button"
                  onClick={() => action(() => api.downloadUpdate())}
                >
                  <Download size={14} /> Download update
                </button>
              )}
            {state.status === "ready" && (
              <button
                className="button primary"
                onClick={() => action(() => api.installUpdate())}
              >
                Restart to update
              </button>
            )}
            {state.mode === "portable" && state.status === "available" && (
              <button
                className="button primary"
                onClick={() => action(() => api.openReleases())}
              >
                Download portable
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
