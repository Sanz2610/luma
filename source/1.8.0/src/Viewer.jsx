import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageOff,
  Maximize,
  Minimize,
  Minus,
  X,
  ZoomIn,
  ZoomOut,
  ScanSearch,
  Info,
} from "lucide-react";
import { api } from "./api";
import { ThumbnailPreview } from "./Thumbnail";
import { clampPan, fitGeometry } from "./layout.mjs";
import { IconButton, number } from "./ui";
import WindowMaximize, { useWindowState } from "./WindowMaximize";
import ImageInfo from "./ImageInfo";

export default function Viewer({
  images,
  id,
  onClose,
  onReveal,
  onNavigate,
  position,
  count,
  detached = false,
}) {
  const windowState = useWindowState();
  const [current, setCurrent] = useState(id),
    [natural, setNatural] = useState({ width: 0, height: 0 });
  const [bounds, setBounds] = useState({
    width: window.innerWidth - 8,
    height: window.innerHeight - 8,
  });
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [infoOpen, setInfoOpen] = useState(false);
  const [failed, setFailed] = useState(false),
    [visible, setVisible] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [lensBusy, setLensBusy] = useState(false),
    [lensError, setLensError] = useState("");
  const root = useRef(null),
    stage = useRef(null),
    toolbar = useRef(null),
    idle = useRef(null),
    dragging = useRef(null),
    hovering = useRef(false),
    fullscreenRef = useRef(false),
    startedFullscreen = useRef(false);
  const zoomRef = useRef(1);
  const positions = useMemo(
    () => new Map(images.map((image, index) => [image.id, index])),
    [images],
  );
  const index = positions.get(current) ?? -1,
    image = images[index];
  const geometry = fitGeometry(
    bounds.width,
    bounds.height,
    natural.width,
    natural.height,
    zoom,
  );
  const constrainedPan = clampPan(pan, geometry, bounds);
  const showControls = useCallback(() => {
    setVisible(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (
        !hovering.current &&
        !toolbar.current?.contains(document.activeElement)
      )
        setVisible(false);
    }, 1800);
  }, []);
  const fit = useCallback(() => {
    dragging.current = null;
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const changeZoom = useCallback(
    (value, point) => {
      const next = Math.max(0.02, Math.min(64, value));
      dragging.current = null;
      const ratio = next / zoomRef.current;
      zoomRef.current = next;
      setPan((previous) => ({
        x: point
          ? previous.x * ratio + point.x * (1 - ratio)
          : previous.x * ratio,
        y: point
          ? previous.y * ratio + point.y * (1 - ratio)
          : previous.y * ratio,
      }));
      setZoom(next);
      showControls();
    },
    [showControls],
  );
  const move = useCallback(
    (delta) => {
      if (onNavigate) {
        onNavigate(delta);
        return;
      }
      if (!images.length) return;
      setCurrent(
        images[(Math.max(index, 0) + delta + images.length) % images.length].id,
      );
      setNatural({ width: 0, height: 0 });
      setFailed(false);
      fit();
      showControls();
    },
    [images, index, fit, showControls, onNavigate],
  );
  const toggleFullscreen = useCallback(() => {
    const next = !fullscreenRef.current;
    fullscreenRef.current = next;
    setFullscreen(next);
    api.windowAction("set-fullscreen", next);
    showControls();
  }, [showControls]);
  useEffect(() => {
    fullscreenRef.current = windowState.fullscreen;
    setFullscreen(windowState.fullscreen);
  }, [windowState.fullscreen]);
  useLayoutEffect(() => {
    const element = stage.current;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    root.current.focus();
    showControls();
    let live = true;
    api
      .windowState()
      .then((state) => {
        if (live) {
          startedFullscreen.current = state.fullscreen;
          fullscreenRef.current = state.fullscreen;
          setFullscreen(state.fullscreen);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      clearTimeout(idle.current);
      if (!detached && !startedFullscreen.current && fullscreenRef.current)
        api.windowAction("set-fullscreen", false).catch(() => {});
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [showControls, detached]);
  useEffect(() => {
    if (!image) onClose();
  }, [image, onClose]);
  useEffect(() => {
    const element = stage.current;
    const wheel = (event) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const currentZoom = zoomRef.current;
      const next =
        event.deltaY < 0
          ? currentZoom * 1.12
          : Math.max(Math.min(1, currentZoom), currentZoom / 1.12);
      changeZoom(next, {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [changeZoom]);
  if (!image) return null;
  return (
    <div
      className={`viewer ${visible ? "controls-visible" : ""} ${fullscreen ? "is-fullscreen" : ""} ${infoOpen ? "info-open" : ""}`}
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal={false}
      aria-label={`View ${image.name}`}
      onPointerMove={showControls}
      onKeyDown={(event) => {
        showControls();
        if (event.key === "Escape" && infoOpen) {
          event.preventDefault();
          event.stopPropagation();
          setInfoOpen(false);
          return;
        }
        if (
          event.target.closest(".image-details") ||
          event.target.matches('input[type="range"]')
        )
          return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (infoOpen) setInfoOpen(false);
          else onClose();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(zoom * 1.25);
        }
        if (event.key === "-") {
          event.preventDefault();
          changeZoom(zoom / 1.25);
        }
        if (event.key === "0") fit();
        if (event.key.toLowerCase() === "i") setInfoOpen((value) => !value);
        if (event.key === "1") changeZoom(1 / geometry.fit);
        if (event.key.toLowerCase() === "f" || event.key === "F11") {
          event.preventDefault();
          toggleFullscreen();
        }
        if (event.key === "Tab") {
          const controls = [
            ...root.current.querySelectorAll("button:not(:disabled)"),
          ];
          if (
            event.shiftKey &&
            (document.activeElement === controls[0] ||
              document.activeElement === root.current)
          ) {
            event.preventDefault();
            controls.at(-1).focus();
          } else if (
            !event.shiftKey &&
            document.activeElement === controls.at(-1)
          ) {
            event.preventDefault();
            controls[0].focus();
          }
        }
      }}
    >
      <div
        className={`viewer-stage ${geometry.width > bounds.width + 1 || geometry.height > bounds.height + 1 ? "can-pan" : ""}`}
        ref={stage}
        data-testid="viewer-stage"
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragging.current = null;
          zoomRef.current === 1 ? changeZoom(1 / geometry.fit) : fit();
        }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0 || failed) return;
          event.preventDefault();
          root.current.focus({ preventScroll: true });
          dragging.current = {
            x: event.clientX,
            y: event.clientY,
            pan: constrainedPan,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          const start = dragging.current;
          setPan(
            clampPan(
              {
                x: start.pan.x + event.clientX - start.x,
                y: start.pan.y + event.clientY - start.y,
              },
              geometry,
              bounds,
            ),
          );
        }}
        onPointerUp={(event) => {
          dragging.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
        }}
        data-pan-x={constrainedPan.x}
        data-pan-y={constrainedPan.y}
        data-zoom={zoom}
      >
        {failed ? (
          <div className="viewer-error">
            <ImageOff size={32} />
            <h2>Image unavailable</h2>
            <p>The file may have moved or cannot be decoded.</p>
            <button className="button" onClick={() => onReveal(image.id)}>
              <FolderOpen size={16} />
              Show in Explorer
            </button>
          </div>
        ) : (
          <>
            {!natural.width && <ThumbnailPreview image={image} />}
            <img
              className="viewer-original"
              key={image.source}
              src={image.source}
              alt={image.name}
              draggable="false"
              style={{
                width: geometry.width,
                height: geometry.height,
                opacity: natural.width ? 1 : 0,
                transform: `translate(calc(-50% + ${constrainedPan.x}px), calc(-50% + ${constrainedPan.y}px))`,
              }}
              onLoad={(event) =>
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
            />
          </>
        )}
      </div>
      <header
        className="viewer-window-bar"
        onDoubleClick={() => api.windowAction("maximize")}
      >
        <strong title={image.name}>{image.name}</strong>
        <div className="viewer-window-actions">
          <IconButton
            label="Minimize viewer"
            onClick={() => api.windowAction("minimize")}
          >
            <Minus />
          </IconButton>
          <WindowMaximize state={windowState} viewer />
          <IconButton
            className="viewer-close"
            label="Close viewer (Esc)"
            onClick={onClose}
          >
            <X />
          </IconButton>
        </div>
      </header>
      <div
        className="viewer-edge-zone left"
        onClick={() => {
          if ((count ?? images.length) > 1) move(-1);
        }}
      >
        <IconButton
          label="Previous image (Left)"
          disabled={(count ?? images.length) < 2}
          onClick={(event) => {
            event.stopPropagation();
            move(-1);
          }}
        >
          <ChevronLeft size={25} />
        </IconButton>
      </div>
      <div
        className="viewer-edge-zone right"
        onClick={() => {
          if ((count ?? images.length) > 1) move(1);
        }}
      >
        <IconButton
          label="Next image (Right)"
          disabled={(count ?? images.length) < 2}
          onClick={(event) => {
            event.stopPropagation();
            move(1);
          }}
        >
          <ChevronRight size={25} />
        </IconButton>
      </div>
      <div
        className="viewer-toolbar"
        ref={toolbar}
        onPointerDown={(event) => {
          if (!event.target.matches('input[type="range"]'))
            event.preventDefault();
        }}
        onPointerEnter={() => {
          hovering.current = true;
          showControls();
        }}
        onPointerLeave={() => {
          hovering.current = false;
          showControls();
        }}
        onFocus={showControls}
      >
        <IconButton
          label="Zoom out (-)"
          onClick={() => changeZoom(Math.max(1, zoom / 1.25))}
          disabled={zoom <= 1}
        >
          <ZoomOut />
        </IconButton>
        <button
          className="zoom-percent"
          title="Actual size (1)"
          onClick={() => changeZoom(1 / geometry.fit)}
        >
          {Math.round(geometry.scale * 100)}%
        </button>
        <input
          className="viewer-zoom-slider"
          aria-label="Image zoom"
          aria-valuetext={`${Math.round(geometry.scale * 100)}%`}
          type="range"
          min="-5"
          max="6"
          step="0.05"
          value={Math.log2(zoom)}
          onChange={(event) => changeZoom(2 ** Number(event.target.value))}
        />
        <IconButton
          label="Zoom in (+)"
          onClick={() => changeZoom(zoom * 1.25)}
          disabled={zoom >= 64}
        >
          <ZoomIn />
        </IconButton>
        <button
          className={`fit-button ${Math.abs(zoom - 1) < 0.001 ? "active" : ""}`}
          aria-label="Fit to screen (0)"
          aria-pressed={Math.abs(zoom - 1) < 0.001}
          onClick={fit}
        >
          Fit
        </button>
        <span className="control-divider" />
        <IconButton
          label="Image information (I)"
          aria-pressed={infoOpen}
          onClick={() => setInfoOpen((value) => !value)}
        >
          <Info />
        </IconButton>
        <IconButton
          label="Search with Google Lens"
          disabled={lensBusy}
          onClick={async () => {
            setLensError("");
            setLensBusy(true);
            try {
              await api.searchLens(image.id);
            } catch (error) {
              setLensError(error.message);
            } finally {
              setLensBusy(false);
            }
          }}
        >
          <ScanSearch />
        </IconButton>
        <IconButton label="Show in Explorer" onClick={() => onReveal(image.id)}>
          <FolderOpen />
        </IconButton>
        <IconButton
          label={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </IconButton>
      </div>
      {infoOpen && (
        <ImageInfo
          image={image}
          onReveal={onReveal}
          onClose={() => setInfoOpen(false)}
        />
      )}
      {lensError && (
        <div className="viewer-lens-error" role="alert">
          <span>{lensError}</span>
          <IconButton
            label="Dismiss Lens error"
            onClick={() => setLensError("")}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
