import React, { useEffect, useState } from "react";
import { api } from "./api";
import { IconButton } from "./ui";

export function useWindowState() {
  const [state, setState] = useState({ maximized: false, fullscreen: false });
  useEffect(() => {
    let live = true;
    const update = (value) => {
      if (live) setState(value);
    };
    const unsubscribe = api.onWindowState?.(update);
    api
      .windowState()
      .then(update)
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);
  return state;
}
export default function WindowMaximize({ state, viewer = false }) {
  const restore = state.maximized || state.fullscreen;
  return (
    <IconButton
      label={
        restore
          ? viewer
            ? "Restore viewer"
            : "Restore window"
          : viewer
            ? "Maximize viewer"
            : "Maximize window"
      }
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={() =>
        api.windowAction(
          state.fullscreen ? "set-fullscreen" : "maximize",
          false,
        )
      }
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
        data-window-icon={restore ? "restore" : "maximize"}
      >
        {restore ? (
          <>
            <path d="M5.5 3.5V2.5H13.5V10.5H12.5" />
            <rect x="2.5" y="4.5" width="8" height="8" rx=".5" />
          </>
        ) : (
          <rect x="3" y="3" width="10" height="10" rx=".5" />
        )}
      </svg>
    </IconButton>
  );
}
