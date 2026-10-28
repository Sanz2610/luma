import React, { useCallback, useEffect, useRef, useState } from "react";
import Viewer from "./Viewer";
import { api } from "./api";
import PhotoDeletion, { usePhotoDeletion } from "./PhotoDeletion";
import ViewerWheelSetting from "./ViewerWheelSetting";
import { Modal, errorText } from "./ui";
export default function ViewerWindow() {
  const [state, setState] = useState(null);
  const [footerHidden, setFooterHidden] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const wheelGesture = useRef({});
  const savingRef = useRef(false);
  const closeOptions = useCallback(() => {
    if (!savingRef.current) setOptionsOpen(false);
  }, []);
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
      preferences.current = { ...preferences.current, ...value };
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
        wheelMode={state.viewerWheel || "zoom"}
        wheelGesture={wheelGesture}
        onOptions={() => {
          setSaveError("");
          setOptionsOpen(true);
        }}
        onFooterHidden={setFooterHidden}
        deleteBusy={deletion.busy}
        blocked={deletion.open || optionsOpen}
        onDelete={() => deletion.request([state.image.id])}
        onNavigate={(delta) => api.viewerNavigate(delta)}
        onClose={() => api.windowAction("close")}
        onReveal={(id) => api.reveal(id)}
      />
      <PhotoDeletion state={deletion} />
      {optionsOpen && (
        <Modal
          title="Viewer options"
          className="viewer-options-scrim"
          onClose={closeOptions}
        >
          <ViewerWheelSetting
            value={state.viewerWheel || "zoom"}
            disabled={saving}
            onChange={async (viewerWheel) => {
              savingRef.current = true;
              setSaving(true);
              setSaveError("");
              try {
                await api.setPreferences({ viewerWheel });
              } catch (error) {
                setSaveError(errorText(error));
              } finally {
                savingRef.current = false;
                setSaving(false);
              }
            }}
          />
          {saveError && (
            <p className="field-error" role="alert">
              Could not save: {saveError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={saving}
              onClick={closeOptions}
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
