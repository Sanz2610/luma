import React, { useEffect, useState } from "react";
import { X, FolderOpen } from "lucide-react";
import { api } from "./api";
import { IconButton } from "./ui";
const date = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "Not available";
const fileSize = (value) =>
  value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(2)} MB`
    : `${(value / 1024).toFixed(1)} KB`;
const capturedDate = (value) => {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(
    value || "",
  );
  if (!match) return value;
  return date(
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ).getTime(),
  );
};
export default function ImageInfo({ image, onClose, onReveal }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api
      .imageInfo(image.id)
      .then((data) => {
        if (live) setState({ data });
      })
      .catch(() => {
        if (live) setState({ error: true });
      });
    return () => {
      live = false;
    };
  }, [image.id]);
  const data = state.data;
  return (
    <aside
      className="image-details"
      aria-label="Image information"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <h2>Info</h2>
        <IconButton label="Close image information" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="image-details-content">
        <dl>
          <dt>File name</dt>
          <dd>{image.name}</dd>
          {state.loading ? (
            <dd role="status">Reading image information…</dd>
          ) : state.error ? (
            <dd role="alert">Could not read image information.</dd>
          ) : (
            <>
              <dt>Date and time</dt>
              <dd>
                {data.captured
                  ? capturedDate(data.captured)
                  : date(data.created)}
              </dd>
              <dt>Size info</dt>
              <dd>
                {data.width && data.height
                  ? `${data.width} × ${data.height}`
                  : "Dimensions not available"}
              </dd>
              <dd>
                {[
                  fileSize(data.size),
                  data.dpi ? `${data.dpi} dpi` : null,
                  data.bitDepth ? `${data.bitDepth} bit` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
              <dt>Format</dt>
              <dd>
                {data.format}
                {data.pages > 1
                  ? ` · ${data.pages} pages (first page shown)`
                  : ""}
              </dd>
              {(data.previewOnly || image.previewOnly) && (
                <dd>Embedded RAW preview</dd>
              )}
              {image.converted && !image.previewOnly && (
                <dd>Display preview, up to 4096 px</dd>
              )}
              {data.camera && (
                <>
                  <dt>Camera</dt>
                  <dd>{data.camera}</dd>
                </>
              )}
              <dt>Modified</dt>
              <dd>{date(data.modified)}</dd>
              <dt>Source and folder location</dt>
              <dd>This PC</dd>
              <dd>
                <button
                  className="image-location"
                  onClick={() => onReveal(image.id)}
                  title="Show in Explorer"
                >
                  <FolderOpen size={14} />
                  {data.filePath}
                </button>
              </dd>
            </>
          )}
        </dl>
      </div>
    </aside>
  );
}
