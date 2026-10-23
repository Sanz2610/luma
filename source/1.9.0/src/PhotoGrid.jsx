import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronUp, ChevronDown, Check, ImageOff } from "lucide-react";
import { useThumbnail } from "./Thumbnail";
import { thumbnailEdge } from "./thumbnail-client";
import { IconButton } from "./ui";
import { gridGeometry, gridSelection } from "./layout.mjs";

const Photo = memo(function Photo({
  image,
  index,
  selected,
  organizing,
  fit,
  showNames,
  activate,
  contextMenu,
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
      onContextMenu={(event) => contextMenu(image, event)}
      onKeyDown={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          contextMenu(image, event);
        }
      }}
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
  onContextMenu,
  onSelection,
  scrollKey,
}) {
  const container = useRef(null);
  const scrollFrame = useRef(null);
  const gesture = useRef(null);
  const dragFrame = useRef(null);
  const suppressClick = useRef(false);
  const [marquee, setMarquee] = useState(null);
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
  const cancelSelection = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(dragFrame.current);
    if (current && container.current?.hasPointerCapture(current.pointerId))
      container.current.releasePointerCapture(current.pointerId);
    setMarquee(null);
  }, []);
  useEffect(() => {
    const blur = () => cancelSelection();
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("blur", blur);
      cancelSelection();
    };
  }, [cancelSelection, scrollKey, layout, organizing]);
  useEffect(() => {
    const started = gesture.current?.images;
    if (
      started &&
      (started.length !== images.length ||
        images.some((image, index) => image.id !== started[index].id))
    )
      cancelSelection();
  }, [images, cancelSelection]);
  const updateSelection = () => {
    const current = gesture.current;
    if (!current?.active) return;
    const element = container.current;
    const rect = element.getBoundingClientRect();
    // Continue selecting across virtual rows while the pointer nears an edge.
    const speed =
      current.clientY < rect.top + 32
        ? -Math.min(24, (rect.top + 32 - current.clientY) / 2)
        : current.clientY > rect.bottom - 32
          ? Math.min(24, (current.clientY - rect.bottom + 32) / 2)
          : 0;
    if (speed) element.scrollTop += speed;
    const x = Math.max(0, Math.min(bounds.width, current.clientX - rect.left));
    const y = Math.max(
      0,
      Math.min(
        total,
        Math.max(0, Math.min(rect.height, current.clientY - rect.top)) +
          element.scrollTop,
      ),
    );
    const box = {
      x: Math.min(current.x, x),
      y: Math.min(current.y, y),
      width: Math.abs(x - current.x),
      height: Math.abs(y - current.y),
    };
    setMarquee((previous) =>
      previous &&
      previous.x === box.x &&
      previous.y === box.y &&
      previous.width === box.width &&
      previous.height === box.height
        ? previous
        : box,
    );
    const next = new Set(current.base);
    const hit = gridSelection(layout, images.length, box);
    for (const index of hit) next.add(images[index].id);
    const key = hit.join(",");
    if (key !== current.hitKey) {
      current.hitKey = key;
      onSelection(next);
    }
    dragFrame.current = requestAnimationFrame(updateSelection);
  };
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
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (!organizing || event.button !== 0) return;
          suppressClick.current = false;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX >= rect.left + event.currentTarget.clientWidth)
            return;
          gesture.current = {
            images,
            pointerId: event.pointerId,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top + event.currentTarget.scrollTop,
            clientX: event.clientX,
            clientY: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            base:
              event.ctrlKey || event.metaKey || event.shiftKey
                ? new Set(selected)
                : new Set(),
            active: false,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || event.pointerId !== current.pointerId) return;
          current.clientX = event.clientX;
          current.clientY = event.clientY;
          if (
            !current.active &&
            Math.hypot(
              event.clientX - current.startX,
              event.clientY - current.startY,
            ) > 5
          ) {
            current.active = true;
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateSelection();
          }
        }}
        onPointerUp={(event) => {
          if (gesture.current?.active) {
            event.preventDefault();
          }
          cancelSelection();
        }}
        onPointerCancel={cancelSelection}
        onLostPointerCapture={cancelSelection}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          } else if (organizing && !event.target.closest(".photo"))
            onSelection(new Set());
        }}
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
                  contextMenu={onContextMenu}
                  edge={edge}
                />
              ))}
          </div>
          {marquee && (
            <div
              className="selection-marquee"
              aria-hidden="true"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
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
