import React from "react";

export default function ViewerWheelSetting({
  value,
  onChange,
  disabled = false,
}) {
  return (
    <div className="viewer-wheel-setting">
      <label className="input-label" htmlFor="viewer-wheel">
        Mouse wheel
      </label>
      <select
        id="viewer-wheel"
        value={value}
        disabled={disabled}
        aria-describedby="viewer-wheel-hint"
        data-initial-focus
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="zoom">Zoom in or out</option>
        <option value="navigate">View next or previous photo</option>
      </select>
      <p id="viewer-wheel-hint" className="field-hint">
        {value === "navigate" && (
          <>Scroll down for the next photo, up for the previous photo. </>
        )}
        Ctrl + mouse wheel always zooms in or out.
      </p>
    </div>
  );
}
