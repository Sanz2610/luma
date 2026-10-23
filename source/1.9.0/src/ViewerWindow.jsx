import React, { useEffect, useRef, useState } from "react";
import Viewer from "./Viewer";
import { api } from "./api";
import PhotoDeletion, { usePhotoDeletion } from "./PhotoDeletion";
export default function ViewerWindow() {
  const [state, setState] = useState(null);
  const [footerHidden, setFooterHidden] = useState(false);
  const preferences = useRef({});
  const deletion = usePhotoDeletion({
    confirmDelete: state?.confirmDelete ?? true,
  });
  useEffect(() => {
    let live = true;
    let revision = 0;
    api.viewerState().then((value) => {
      if (live && revision === 0)
        setState(value ? { ...value, ...preferences.current } : value);
    });
    const off = api.onViewer((value) => {
      revision++;
      setState(value ? { ...value, ...preferences.current } : value);
    });
    const offPreferences = api.onPreferences((value) => {
      preferences.current = value;
      setState((previous) => (previous ? { ...previous, ...value } : previous));
    });
    return () => {
      live = false;
      off();
      offPreferences();
    };
  }, []);
  if (!state?.image)
    return (
      <div className="empty-state">
        <p>Opening image…</p>
      </div>
    );
  return (
    <>
      <Viewer
        key={state.image.id}
        images={[state.image]}
        id={state.image.id}
        position={state.position}
        count={state.count}
        detached
        footerHidden={footerHidden}
        onFooterHidden={setFooterHidden}
        deleteBusy={deletion.busy}
        blocked={deletion.open}
        onDelete={() => deletion.request([state.image.id])}
        onNavigate={(delta) => api.viewerNavigate(delta)}
        onClose={() => api.windowAction("close")}
        onReveal={(id) => api.reveal(id)}
      />
      <PhotoDeletion state={deletion} />
    </>
  );
}
