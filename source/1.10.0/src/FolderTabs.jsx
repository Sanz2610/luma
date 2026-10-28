import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownWideNarrow,
  ChevronUp,
  ChevronDown,
  X,
  RotateCcw,
  GripVertical,
  Settings2,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  Grid2X2,
  ListFilter,
  Search,
  Pencil,
} from "lucide-react";
import { IconButton, Modal, number } from "./ui";
import { moveFolder, offsetIndex, tabLayout } from "./layout.mjs";

export default function FolderTabs({
  folders,
  active,
  onSelect,
  onOrder,
  onBrowse,
  onSort,
  onHide,
  onHome,
  onRename,
  hasLibrary,
  busy = false,
}) {
  const strip = useRef(null),
    dragging = useRef(null),
    focusRequested = useRef(false);
  const [view, setView] = useState({ width: 900, left: 0 });
  const [drop, setDrop] = useState(null);
  const offsets = useMemo(() => tabLayout(folders), [folders]);
  const first = Math.max(0, offsetIndex(offsets, view.left) - 1),
    last = Math.min(
      folders.length,
      offsetIndex(offsets, view.left + view.width) + 2,
    );
  useLayoutEffect(() => {
    const element = strip.current;
    const observer = new ResizeObserver(([entry]) =>
      setView({ left: element.scrollLeft, width: entry.contentRect.width }),
    );
    observer.observe(element);
    const wheel = (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        element.scrollLeft += event.deltaY;
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, []);
  useLayoutEffect(() => {
    const index = folders.findIndex((folder) => folder.id === active),
      el = strip.current;
    if (index < 0) return;
    if (offsets[index] < el.scrollLeft) el.scrollLeft = offsets[index];
    else if (offsets[index + 1] > el.scrollLeft + el.clientWidth)
      el.scrollLeft = offsets[index + 1] - el.clientWidth;
    setView((previous) => ({ ...previous, left: el.scrollLeft }));
    if (focusRequested.current) {
      focusRequested.current = false;
      requestAnimationFrame(() =>
        el
          .querySelector('[aria-selected="true"]')
          ?.focus({ preventScroll: true }),
      );
    }
  }, [active, folders, offsets]);
  const total = offsets.at(-1) || 0;
  const navigate = (id, delta) => {
    focusRequested.current = true;
    const index = folders.findIndex((folder) => folder.id === id);
    const next = index + delta;
    if (next < 0) {
      onSelect("all");
      focusRequested.current = false;
      strip.current.closest(".tablist").querySelector(".all-tab").focus();
      return;
    }
    if (next < folders.length) onSelect(folders[next].id);
  };
  return (
    <nav
      className="folder-nav"
      aria-label="Folder navigation"
      inert={busy ? true : undefined}
      aria-busy={busy}
    >
      <div role="tablist" className="tablist" aria-label="Photo folders">
        <div className={`all-tab-item ${active === "all" ? "active" : ""}`}>
          <button
            role="tab"
            aria-selected={active === "all"}
            aria-controls="photo-panel"
            className={`all-tab ${active === "all" ? "active" : ""}`}
            onClick={() => onSelect("all")}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && folders[0]) {
                event.preventDefault();
                focusRequested.current = true;
                onSelect(folders[0].id);
              }
            }}
          >
            <Grid2X2 size={15} />
            <span>All photos</span>
          </button>
          {hasLibrary && (
            <IconButton
              className="all-tab-close"
              label="Close library and return Home"
              onClick={onHome}
            >
              <X size={12} />
            </IconButton>
          )}
        </div>
        <div
          className="tabs-scroll"
          ref={strip}
          onScroll={(event) => {
            const left = event.currentTarget.scrollLeft;
            setView((previous) => ({ ...previous, left }));
          }}
          onDragOver={(event) => {
            if (!dragging.current) return;
            event.preventDefault();
            const bounds = strip.current.getBoundingClientRect();
            if (event.clientX < bounds.left + 45)
              strip.current.scrollLeft -= 24;
            else if (event.clientX > bounds.right - 45)
              strip.current.scrollLeft += 24;
          }}
        >
          <div className="tabs-track" style={{ width: total }}>
            {folders.slice(first, last).map((folder, visibleIndex) => {
              const index = first + visibleIndex;
              return (
                <div
                  className={`folder-tab-item ${active === folder.id ? "active" : ""}`}
                  key={folder.id}
                  style={{
                    left: offsets[index],
                    width: offsets[index + 1] - offsets[index],
                  }}
                >
                  <button
                    role="tab"
                    key={folder.id}
                    draggable
                    aria-selected={active === folder.id}
                    aria-controls="photo-panel"
                    tabIndex={active === folder.id ? 0 : -1}
                    className={`folder-tab ${active === folder.id ? "active" : ""} ${drop?.id === folder.id ? (drop.after ? "drop-after" : "drop-before") : ""}`}
                    style={{
                      left: 0,
                      width: "100%",
                    }}
                    title={folder.name}
                    data-folder-id={folder.id}
                    onClick={() => onSelect(folder.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onRename(folder);
                    }}
                    onDoubleClick={() => onRename(folder)}
                    onDragStart={(event) => {
                      dragging.current = folder.id;
                      event.dataTransfer.setData(
                        "application/x-luma-folder",
                        folder.id,
                      );
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      if (!dragging.current) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setDrop({
                        id: folder.id,
                        after: event.clientX > rect.left + rect.width / 2,
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from =
                        dragging.current ||
                        event.dataTransfer.getData("application/x-luma-folder");
                      if (from && from !== folder.id) {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        onOrder(
                          moveFolder(
                            folders,
                            from,
                            folder.id,
                            event.clientX > rect.left + rect.width / 2,
                          ),
                        );
                      }
                      dragging.current = null;
                      setDrop(null);
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDrop(null);
                    }}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight"].includes(event.key))
                        return;
                      event.preventDefault();
                      const delta = event.key === "ArrowRight" ? 1 : -1;
                      if (event.altKey && event.shiftKey) {
                        const target = folders[index + delta];
                        if (target)
                          onOrder(
                            moveFolder(
                              folders,
                              folder.id,
                              target.id,
                              delta > 0,
                            ),
                          );
                      } else navigate(folder.id, delta);
                    }}
                  >
                    <span>{folder.name}</span>
                  </button>
                  <IconButton
                    className="tab-close"
                    label={`Close ${folder.name} tab`}
                    onClick={() => onHide(folder.id)}
                  >
                    <X size={12} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="tab-scroll-controls" aria-label="Scroll folder tabs">
        <IconButton
          className="tab-arrow"
          label="Scroll tabs left"
          disabled={view.left < 2}
          onClick={() => {
            strip.current.scrollLeft -= strip.current.clientWidth * 0.7;
          }}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          className="tab-arrow"
          label="Scroll tabs right"
          disabled={view.left + view.width >= total - 2}
          onClick={() => {
            strip.current.scrollLeft += strip.current.clientWidth * 0.7;
          }}
        >
          <ChevronRight />
        </IconButton>
      </div>
      <div className="tab-tools">
        <IconButton label="Tab order" onClick={onSort}>
          <ArrowDownWideNarrow size={16} />
        </IconButton>
        <button
          className="browse-folders"
          onClick={onBrowse}
          title="Find a folder (Ctrl+K)"
        >
          <ListFilter size={16} />
          <span>Folders</span>
        </button>
      </div>
    </nav>
  );
}

export function FolderPicker({
  folders,
  hiddenFolders = [],
  active,
  onSelect,
  onClose,
  onOrder,
  onHide,
  onRestore,
  columns = 2,
  onColumns,
  onRename,
  initialHidden = false,
}) {
  const [query, setQuery] = useState(""),
    [top, setTop] = useState(0),
    [highlighted, setHighlighted] = useState(0),
    [showHidden, setShowHidden] = useState(initialHidden),
    [manage, setManage] = useState(false),
    [height, setHeight] = useState(500),
    [drop, setDrop] = useState(null);
  const container = useRef(null),
    dragged = useRef(null);
  const all = showHidden ? hiddenFolders : folders;
  const filtered = useMemo(
    () =>
      all.filter((folder) =>
        folder.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [all, query],
  );
  const rowHeight = 44,
    rows = Math.ceil(filtered.length / columns),
    firstRow = Math.max(0, Math.floor(top / rowHeight) - 1),
    lastRow = Math.min(rows, Math.ceil((top + height) / rowHeight) + 1),
    first = firstRow * columns,
    last = lastRow * columns;
  const choose = (id) => {
    onSelect(id);
    onClose();
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setTop(0);
    setHighlighted(0);
    if (container.current) container.current.scrollTop = 0;
  }, [query, showHidden, columns]);
  useEffect(
    () =>
      setHighlighted((previous) =>
        Math.min(previous, Math.max(0, filtered.length - 1)),
      ),
    [filtered.length],
  );
  const keyboard = (event) => {
    if (event.target.tagName === "SELECT") return;
    if (
      [
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const delta = {
        ArrowDown: columns,
        ArrowUp: -columns,
        ArrowLeft: -1,
        ArrowRight: 1,
      }[event.key];
      const next = Math.max(
        0,
        Math.min(
          filtered.length - 1,
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? filtered.length - 1
              : highlighted + delta,
        ),
      );
      setHighlighted(next);
      const row = Math.floor(next / columns);
      if (row * rowHeight < container.current.scrollTop)
        container.current.scrollTop = row * rowHeight;
      else if (
        (row + 1) * rowHeight >
        container.current.scrollTop + container.current.clientHeight
      )
        container.current.scrollTop =
          (row + 1) * rowHeight - container.current.clientHeight;
    }
    if (
      event.key === "Enter" &&
      filtered[highlighted] &&
      !event.target.closest("[data-folder-action]")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (showHidden) onRestore(filtered[highlighted].id);
      else choose(filtered[highlighted].id);
    }
  };
  const reorderDrop = (event, folder) => {
    event.preventDefault();
    if (!dragged.current || dragged.current === folder.id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onOrder(
      moveFolder(
        folders,
        dragged.current,
        folder.id,
        event.clientX > rect.left + rect.width / 2,
      ),
    );
    dragged.current = null;
    setDrop(null);
  };
  return (
    <Modal
      title="Find a folder"
      className="folder-picker-scrim"
      onClose={onClose}
      onKeyDown={keyboard}
    >
      <label className="picker-search">
        <Search size={17} />
        <input
          data-initial-focus
          autoFocus
          aria-label="Search folders"
          placeholder="Search folders…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="picker-toolbar" data-folder-action>
        <div className="picker-mode">
          <button
            className={!showHidden ? "active" : ""}
            onClick={() => setShowHidden(false)}
          >
            Library
          </button>
          <button
            className={showHidden ? "active" : ""}
            onClick={() => setShowHidden(true)}
          >
            Hidden ({hiddenFolders.length})
          </button>
        </div>
        <label className="folder-columns-label">
          View
          <select
            aria-label="Folder columns"
            value={columns}
            onChange={(event) => onColumns(Number(event.target.value))}
          >
            {[1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? "column" : "columns"}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`manage-folders ${manage ? "active" : ""}`}
          aria-label="Manage folders"
          aria-pressed={manage}
          onClick={() => setManage((value) => !value)}
        >
          <Settings2 size={16} />
          <span>Manage</span>
        </button>
      </div>
      {!showHidden && (
        <button
          data-folder-action
          className={`picker-all ${active === "all" ? "active" : ""}`}
          onClick={() => choose("all")}
        >
          All photos
        </button>
      )}
      <div
        ref={container}
        className="folder-picker-list"
        role="listbox"
        aria-label="Folders"
        aria-activedescendant={
          filtered[highlighted]
            ? `folder-option-${filtered[highlighted].id}`
            : undefined
        }
        tabIndex={0}
        onScroll={(event) => setTop(event.currentTarget.scrollTop)}
        onDragOver={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          const rect = container.current.getBoundingClientRect();
          if (event.clientY < rect.top + 45) container.current.scrollTop -= 22;
          else if (event.clientY > rect.bottom - 45)
            container.current.scrollTop += 22;
        }}
      >
        {filtered.length ? (
          <div
            className="folder-grid-track"
            style={{ height: rows * rowHeight }}
          >
            {filtered.slice(first, last).map((folder, i) => {
              const index = first + i,
                row = Math.floor(index / columns),
                col = index % columns;
              return (
                <div
                  role="option"
                  aria-selected={folder.id === active}
                  id={`folder-option-${folder.id}`}
                  key={folder.id}
                  className={`folder-option ${folder.id === active ? "current" : ""} ${index === highlighted ? "highlighted" : ""} ${drop === folder.id ? "folder-drop" : ""}`}
                  style={{
                    top: row * rowHeight,
                    left: `${(col * 100) / columns}%`,
                    width: `${100 / columns}%`,
                    height: rowHeight,
                  }}
                  onMouseMove={() => setHighlighted(index)}
                  onDragOver={(event) => {
                    if (dragged.current) {
                      event.preventDefault();
                      setDrop(folder.id);
                    }
                  }}
                  onDrop={(event) => reorderDrop(event, folder)}
                >
                  {manage && !showHidden && (
                    <button
                      data-folder-action
                      draggable
                      className="folder-drag"
                      aria-label={`Drag ${folder.name}`}
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        dragged.current = folder.id;
                        event.dataTransfer.setData(
                          "application/x-luma-folder",
                          folder.id,
                        );
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                        setDrop(null);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.altKey &&
                          ["ArrowUp", "ArrowDown"].includes(event.key)
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          const source = folders.findIndex(
                              (item) => item.id === folder.id,
                            ),
                            delta = event.key === "ArrowDown" ? 1 : -1,
                            target = folders[source + delta];
                          if (target)
                            onOrder(
                              moveFolder(
                                folders,
                                folder.id,
                                target.id,
                                delta > 0,
                              ),
                            );
                        }
                      }}
                    >
                      <GripVertical size={16} />
                    </button>
                  )}
                  <button
                    className="folder-open"
                    title={folder.name}
                    onFocus={() => setHighlighted(index)}
                    onClick={() =>
                      showHidden ? onRestore(folder.id) : choose(folder.id)
                    }
                  >
                    <span>{folder.name}</span>
                  </button>
                  {showHidden ? (
                    <IconButton
                      data-folder-action
                      label={`Restore ${folder.name}`}
                      onClick={() => onRestore(folder.id)}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  ) : (
                    manage && (
                      <>
                        <IconButton
                          data-folder-action
                          label={`Rename ${folder.name} tab`}
                          onClick={() => onRename(folder)}
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          data-folder-action
                          className="remove-folder"
                          label={`Remove ${folder.name} from library`}
                          onClick={() => onHide(folder.id)}
                        >
                          <X size={14} />
                        </IconButton>
                      </>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="picker-empty">
            {showHidden ? "No hidden folders" : "No matching folders"}
          </p>
        )}
      </div>
      {manage && (
        <p className="picker-safety">
          Drag handles to reorder. Remove hides a folder; files stay on disk.
        </p>
      )}
      <footer className="picker-foot">
        <span>{number(filtered.length)} folders</span>
        <span>
          Arrow keys navigate · Enter {showHidden ? "restore" : "open"}
        </span>
      </footer>
    </Modal>
  );
}
