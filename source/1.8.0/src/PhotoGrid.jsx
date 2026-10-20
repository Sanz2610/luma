import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Check, ImageOff } from "lucide-react";
import { useThumbnail } from "./Thumbnail";
import { thumbnailEdge } from "./thumbnail-client";
import { IconButton } from "./ui";
import { gridGeometry } from "./layout.mjs";

const Photo = memo(function Photo({
  image,
  index,
  selected,
  organizing,
  fit,
  showNames,
  activate,
  edge,
}) {
  const { url, failed } = useThumbnail(image, edge);
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      className={`photo ${selected ? "selected" : ""} ${loaded ? "loaded" : ""}`}
      data-index={index}
      data-id={image.id}
      aria-label={`${organizing ? (selected ? "Deselect" : "Select") : "View"} ${image.name}`}
      aria-pressed={organizing ? selected : undefined}
      onClick={(event) => activate(image, index, event)}
    >
      {failed ? (
        <span className="image-failed">
          <ImageOff />
          <span>Image unavailable</span>
        </span>
      ) : url ? (
        <img
          src={url}
          alt={image.name}
          decoding="async"
          draggable="false"
          style={{ objectFit: fit }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      ) : null}
      <span className={`photo-caption ${showNames ? "always" : ""}`}>
        {image.name}
      </span>
      {organizing && (
        <span className="photo-check">{selected && <Check size={15} />}</span>
      )}
    </button>
  );
});
export default function PhotoGrid({
  images,
  columns,
  gap,
  ratio,
  fit,
  showNames,
  selected,
  organizing,
  onPhoto,
  scrollKey,
}) {
  const container = useRef(null);
  const scrollFrame = useRef(null);
  const [bounds, setBounds] = useState({ width: 1200, height: 700 });
  const [scroll, setScroll] = useState(0);
  const layout = useMemo(
    () => gridGeometry(bounds.width, columns, gap === "compact" ? 3 : 9, ratio),
    [bounds.width, columns, gap, ratio],
  );
  const edge = thumbnailEdge(layout.cell, ratio);
  const previous = useRef({ ...layout, scrollKey });
  const rows = Math.ceil(images.length / layout.columns);
  const total = Math.max(
    0,
    rows * layout.rowHeight - (gap === "compact" ? 3 : 9),
  );
  const first = Math.max(0, Math.floor(scroll / layout.rowHeight) - 1);
  const last = Math.min(
    rows,
    Math.ceil((scroll + bounds.height) / layout.rowHeight) + 1,
  );
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scrollFrame.current);
    };
  }, []);
  useLayoutEffect(() => {
    const el = container.current,
      old = previous.current;
    if (old.scrollKey !== scrollKey) el.scrollTop = 0;
    else if (
      old.columns !== layout.columns ||
      old.rowHeight !== layout.rowHeight
    ) {
      const anchor = Math.floor(el.scrollTop / old.rowHeight) * old.columns;
      el.scrollTop = Math.floor(anchor / layout.columns) * layout.rowHeight;
    }
    if (el.scrollTop > total - bounds.height)
      el.scrollTop = Math.max(0, total - bounds.height);
    setScroll(el.scrollTop);
    previous.current = { ...layout, scrollKey };
  }, [layout, scrollKey, total, bounds.height]);
  return (
    <>
      <div
        ref={container}
        className="gallery-scroll"
        role="region"
        aria-label="Photo grid"
        tabIndex={-1}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          cancelAnimationFrame(scrollFrame.current);
          scrollFrame.current = requestAnimationFrame(() => setScroll(top));
        }}
        onKeyDown={(event) => {
          const index = Number(
            event.target.closest("[data-index]")?.dataset.index,
          );
          const offset = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: layout.columns,
            ArrowUp: -layout.columns,
          }[event.key];
          if (!Number.isFinite(index) || !offset) return;
          event.preventDefault();
          const next = Math.max(0, Math.min(images.length - 1, index + offset)),
            row = Math.floor(next / layout.columns),
            element = container.current;
          if (row * layout.rowHeight < element.scrollTop)
            element.scrollTop = row * layout.rowHeight;
          else if (
            row * layout.rowHeight + layout.height >
            element.scrollTop + bounds.height
          )
            element.scrollTop =
              row * layout.rowHeight + layout.height - bounds.height;
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              element
                .querySelector(`[data-index="${next}"]`)
                ?.focus({ preventScroll: true }),
            ),
          );
        }}
      >
        <div className="virtual-grid" style={{ height: total }}>
          <div
            className="grid-window"
            style={{
              top: first * layout.rowHeight,
              width: layout.contentWidth,
              left: Math.max(0, (bounds.width - layout.contentWidth) / 2),
              gridTemplateColumns: `repeat(${layout.columns}, ${layout.cell}px)`,
              gridAutoRows: layout.height,
              gap: gap === "compact" ? 3 : 9,
            }}
          >
            {images
              .slice(first * layout.columns, last * layout.columns)
              .map((image, index) => (
                <Photo
                  key={`${image.id}:${image.thumbnail}`}
                  image={image}
                  index={first * layout.columns + index}
                  selected={selected.has(image.id)}
                  organizing={organizing}
                  fit={fit}
                  showNames={showNames}
                  activate={onPhoto}
                  edge={edge}
                />
              ))}
          </div>
        </div>
      </div>
      <div className="grid-jump-controls" aria-label="Jump through photos">
        <IconButton
          label="Go to top"
          disabled={scroll < 1}
          onClick={() =>
            container.current.scrollTo({ top: 0, behavior: "instant" })
          }
        >
          <ChevronUp size={17} />
        </IconButton>
        <IconButton
          label="Go to bottom"
          disabled={scroll >= total - bounds.height - 1}
          onClick={() =>
            container.current.scrollTo({ top: total, behavior: "instant" })
          }
        >
          <ChevronDown size={17} />
        </IconButton>
      </div>
    </>
  );
}
