import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Search,
  ArrowUp,
} from "lucide-react";
import { Modal, IconButton, number } from "./ui";
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function useDirectoryIndex(directories, folders) {
  return useMemo(() => {
    const labels = new Map(folders.map((folder) => [folder.id, folder.name]));
    const byId = new Map(),
      children = new Map();
    for (const original of directories || []) {
      const node = {
        ...original,
        name:
          original.id === original.topId
            ? labels.get(original.id) || original.name
            : original.name,
      };
      byId.set(node.id, node);
      const parent = node.parentId || "all";
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node);
    }
    for (const list of children.values())
      list.sort((a, b) => collator.compare(a.name, b.name));
    return { byId, children };
  }, [directories, folders]);
}
export function DirectoryButton({ current, rootName, onClick }) {
  return (
    <button
      className="directory-button"
      onClick={onClick}
      title={current?.relativePath || rootName}
      aria-label="Browse subfolders"
      aria-haspopup="dialog"
    >
      <Folder size={13} />
      <span>{current?.relativePath || rootName}</span>
      <ChevronDown size={12} />
    </button>
  );
}
export default function Subfolders({
  index,
  initial,
  rootName,
  onSelect,
  onClose,
}) {
  const [cursor, setCursor] = useState(initial || "all"),
    [query, setQuery] = useState(""),
    [top, setTop] = useState(0),
    [height, setHeight] = useState(300),
    [highlight, setHighlight] = useState(0);
  const list = useRef(null),
    current = index.byId.get(cursor);
  const chain = useMemo(() => {
    const result = [];
    let node = current;
    while (node) {
      result.unshift(node);
      node = index.byId.get(node.parentId);
    }
    return result;
  }, [index, current]);
  const rows = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    if (!text) return index.children.get(cursor) || [];
    const prefix = current?.relativePath ? current.relativePath + "/" : "";
    return [...index.byId.values()]
      .filter(
        (node) =>
          node.id !== cursor &&
          (!prefix || node.relativePath.startsWith(prefix)) &&
          (node.name + " " + node.relativePath)
            .toLocaleLowerCase()
            .includes(text),
      )
      .sort((a, b) => collator.compare(a.relativePath, b.relativePath));
  }, [index, cursor, query, current]);
  useEffect(() => {
    setTop(0);
    setHighlight(0);
    if (list.current) list.current.scrollTop = 0;
  }, [cursor, query]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(list.current);
    return () => observer.disconnect();
  }, []);
  const choose = (node) => {
    onSelect(
      node?.topId || "all",
      node && node.id !== node.topId ? node.id : "",
    );
    onClose();
  };
  const open = (id) => {
    setCursor(id);
    setQuery("");
  };
  const rowHeight = 38,
    first = Math.max(0, Math.floor(top / rowHeight) - 1),
    last = Math.min(rows.length, Math.ceil((top + height) / rowHeight) + 1);
  const keys = (event) => {
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      open(current?.parentId || "all");
    }
    if (["ArrowUp", "ArrowDown"].includes(event.key) && !event.altKey) {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(
          rows.length - 1,
          highlight + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      setHighlight(next);
      if (list.current) {
        if (next * rowHeight < list.current.scrollTop)
          list.current.scrollTop = next * rowHeight;
        else if ((next + 1) * rowHeight > list.current.scrollTop + height)
          list.current.scrollTop = (next + 1) * rowHeight - height;
      }
    }
    if (
      event.key === "Enter" &&
      rows[highlight] &&
      event.target.tagName === "INPUT"
    ) {
      event.preventDefault();
      choose(rows[highlight]);
    }
    if (
      event.key === "ArrowRight" &&
      rows[highlight] &&
      event.target.tagName === "INPUT" &&
      index.children.has(rows[highlight].id)
    ) {
      event.preventDefault();
      open(rows[highlight].id);
    }
  };
  return (
    <Modal
      title="Subfolders"
      className="subfolder-scrim"
      onClose={onClose}
      onKeyDown={keys}
    >
      <nav className="directory-breadcrumbs" aria-label="Folder path">
        <button onClick={() => open("all")} title={rootName}>
          {rootName}
        </button>
        {chain.map((node) => (
          <React.Fragment key={node.id}>
            <ChevronRight size={11} />
            <button title={node.relativePath} onClick={() => open(node.id)}>
              {node.name}
            </button>
          </React.Fragment>
        ))}
      </nav>
      <label className="subfolder-search">
        <Search size={14} />
        <input
          data-initial-focus
          aria-label="Search subfolders"
          placeholder="Search subfolders…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="directory-current">
        <IconButton
          label="Parent folder"
          disabled={cursor === "all"}
          onClick={() => open(current?.parentId || "all")}
        >
          <ArrowUp size={14} />
        </IconButton>
        <button className="directory-show-all" onClick={() => choose(current)}>
          Show all photos in {current?.name || rootName}
        </button>
      </div>
      <div
        className="subfolder-list"
        style={{ height: Math.min(310, Math.max(75, rows.length * rowHeight)) }}
        ref={list}
        onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: rows.length * rowHeight, position: "relative" }}>
          {rows.slice(first, last).map((node, offset) => (
            <div
              className={`subfolder-row ${highlight === first + offset ? "highlighted" : ""}`}
              key={node.id}
              style={{
                position: "absolute",
                top: (first + offset) * rowHeight,
                height: rowHeight,
                left: 0,
                right: 0,
              }}
            >
              <button
                className="subfolder-open"
                title={node.relativePath}
                onClick={() => choose(node)}
              >
                <Folder size={14} />
                <span>{query ? node.relativePath : node.name}</span>
                <small>{number(node.count)}</small>
              </button>
              {index.children.has(node.id) && (
                <IconButton
                  label={`Browse ${node.name} subfolders`}
                  onClick={() => open(node.id)}
                >
                  <ChevronRight size={15} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        {!rows.length && (
          <p className="directory-empty">
            {query ? "No matching subfolders." : "No subfolders here."}
          </p>
        )}
      </div>
      <div className="subfolder-foot">
        Click a folder to view · → explore · Alt ↑ parent
      </div>
    </Modal>
  );
}
