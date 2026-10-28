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
  Trash2,
  Settings,
} from "lucide-react";
import { api } from "./api";
import { ThumbnailPreview } from "./Thumbnail";
import { clampPan, fitGeometry } from "./layout.mjs";
import { IconButton, number } from "./ui";
import WindowMaximize, { useWindowState } from "./WindowMaximize";
import ImageInfo from "./ImageInfo";
import { wheelStep } from "./viewer-wheel.mjs";

export default function Viewer({
  images,
  id,
  onClose,
  onReveal,
  onNavigate,
  position,
  count,
  detached = false,
  onDelete,
  deleteBusy = false,
  blocked = false,
  footerHidden = false,
  onFooterHidden,
  wheelMode = "zoom",
  wheelGesture,
  onOptions,
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
  const [zoomMotion, setZoomMotion] = useState(false);
  const motionTimer = useRef(null);
  const original = useRef(null);
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
  const localWheelGesture = useRef({});
  const clickTimer = useRef(null);
  const clickGesture = useRef(false);
  const firstClickFooter = useRef(false);
  useEffect(() => {
    if (!blocked && document.activeElement === document.body)
      root.current?.focus({ preventScroll: true });
  }, [blocked]);
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
  const baseGeometry = fitGeometry(
    bounds.width,
    bounds.height,
    natural.width,
    natural.height,
  );
  const startZoomMotion = useCallback((smooth = true) => {
    clearTimeout(motionTimer.current);
    setZoomMotion(smooth);
    if (smooth)
      motionTimer.current = setTimeout(() => setZoomMotion(false), 180);
  }, []);
  // Interrupt the displayed transform at its current position before panning.
  // Applying the pending target here would make the image jump under the mouse.
  const stopZoomMotion = () => {
    if (!zoomMotion || !original.current) return constrainedPan;
    const transform = new DOMMatrixReadOnly(
      getComputedStyle(original.current).transform,
    );
    const currentZoom = transform.a;
    const currentPan = clampPan(
      {
        x: transform.e + baseGeometry.width / 2,
        y: transform.f + baseGeometry.height / 2,
      },
      fitGeometry(
        bounds.width,
        bounds.height,
        natural.width,
        natural.height,
        currentZoom,
      ),
      bounds,
    );
    startZoomMotion(false);
    zoomRef.current = currentZoom;
    setZoom(currentZoom);
    setPan(currentPan);
    return currentPan;
  };
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
    startZoomMotion();
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [startZoomMotion]);
  const changeZoom = useCallback(
    (value, point, smooth = true) => {
      const next = Math.max(0.02, Math.min(64, value));
      dragging.current = null;
      startZoomMotion(smooth);
      const ratio = next / zoomRef.current;
      const oldZoom = zoomRef.current;
      zoomRef.current = next;
      setPan((previous) => {
        const current = clampPan(
          previous,
          fitGeometry(
            bounds.width,
            bounds.height,
            natural.width,
            natural.height,
            oldZoom,
          ),
          bounds,
        );
        return clampPan(
          {
            x: point
              ? current.x * ratio + point.x * (1 - ratio)
              : current.x * ratio,
            y: point
              ? current.y * ratio + point.y * (1 - ratio)
              : current.y * ratio,
          },
          fitGeometry(
            bounds.width,
            bounds.height,
            natural.width,
            natural.height,
            next,
          ),
          bounds,
        );
      });
      setZoom(next);
      showControls();
    },
    [showControls, startZoomMotion, bounds, natural],
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
      clearTimeout(clickTimer.current);
      clearTimeout(motionTimer.current);
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
      if (
        blocked ||
        !event.deltaY ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return;
      if (wheelMode === "navigate" && !event.ctrlKey) {
        const step = wheelStep(
          (wheelGesture || localWheelGesture).current,
          event.deltaY,
          event.deltaMode,
          performance.now(),
        );
        if (step && (count ?? images.length) > 1) move(step);
        return;
      }
      const rect = element.getBoundingClientRect();
      const currentZoom = zoomRef.current;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 40
          : event.deltaMode === 2
            ? bounds.height
            : 1);
      const factor = Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.001);
      const next =
        event.deltaY < 0
          ? currentZoom * factor
          : Math.max(Math.min(1, currentZoom), currentZoom * factor);
      changeZoom(next, {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [
    changeZoom,
    blocked,
    wheelMode,
    wheelGesture,
    count,
    images.length,
    bounds.height,
    move,
  ]);
  if (!image) return null;
  return (
    <div
      className={`viewer ${visible ? "controls-visible" : ""} ${fullscreen ? "is-fullscreen" : ""} ${infoOpen ? "info-open" : ""} ${footerHidden ? "footer-hidden" : ""}`}
      ref={root}
      inert={blocked ? true : undefined}
      tabIndex={-1}
      role="dialog"
      aria-modal={false}
      aria-label={`View ${image.name}`}
      onPointerMove={showControls}
      onKeyDown={(event) => {
        if (blocked) return;
        if (event.key === "Tab") onFooterHidden?.(false);
        showControls();
        if (event.key === "Delete") {
          event.preventDefault();
          if (!event.repeat && !deleteBusy) onDelete?.();
          return;
        }
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
          clearTimeout(clickTimer.current);
          onFooterHidden?.(firstClickFooter.current);
          zoomRef.current === 1 ? changeZoom(1 / geometry.fit) : fit();
        }}
        onClick={(event) => {
          if (!clickGesture.current || event.target.closest("button")) return;
          if (event.detail === 1) {
            firstClickFooter.current = footerHidden;
            clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => {
              onFooterHidden?.((value) => !value);
              showControls();
            }, 230);
          }
        }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.target.closest("button")) return;
          event.preventDefault();
          root.current.focus({ preventScroll: true });
          const startingPan = stopZoomMotion();
          dragging.current = {
            x: event.clientX,
            y: event.clientY,
            pan: startingPan,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          const start = dragging.current;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)
            start.moved = true;
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
          clickGesture.current = !!dragging.current && !dragging.current.moved;
          dragging.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          clickGesture.current = false;
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
              className={`viewer-original ${zoomMotion ? "zoom-motion" : ""}`}
              ref={original}
              key={image.source}
              src={image.source}
              alt={image.name}
              draggable="false"
              style={{
                width: baseGeometry.width,
                height: baseGeometry.height,
                opacity: natural.width ? 1 : 0,
                transform: `translate(calc(-50% + ${constrainedPan.x}px), calc(-50% + ${constrainedPan.y}px)) scale(${zoom})`,
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
        inert={footerHidden ? true : undefined}
        aria-hidden={footerHidden || undefined}
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
          onChange={(event) =>
            changeZoom(2 ** Number(event.target.value), null, false)
          }
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
          label="Delete photo (Delete)"
          disabled={deleteBusy}
          onClick={onDelete}
        >
          <Trash2 />
        </IconButton>
        <IconButton label="Viewer options" onClick={onOptions}>
          <Settings />
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
