import React, { useEffect, useState } from "react";
import Viewer from "./Viewer";
import { api } from "./api";
export default function ViewerWindow() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    let revision = 0;
    api.viewerState().then((value) => {
      if (live && revision === 0) setState(value);
    });
    const off = api.onViewer((value) => {
      revision++;
      setState(value);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  if (!state?.image)
    return (
      <div className="empty-state">
        <p>Opening image…</p>
      </div>
    );
  return (
    <Viewer
      key={state.image.id}
      images={[state.image]}
      id={state.image.id}
      position={state.position}
      count={state.count}
      detached
      onNavigate={(delta) => api.viewerNavigate(delta)}
      onClose={() => api.windowAction("close")}
      onReveal={(id) => api.reveal(id)}
    />
  );
}
