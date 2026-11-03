import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Scan, Shapes, Search, ChevronDown } from "lucide-react";
import { Modal } from "./ui";
import { requestThumbnail } from "./thumbnail-client";
import { emptyFilters, matchesMedia, toggleType } from "./media-filters.mjs";

export function useMediaFilters(items, settings, save, keyword) {
  const [filter, setFilter] = useState(emptyFilters);
  const initialized = useRef(false);
  const cache = useRef(new Map());
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!initialized.current && settings.filters) {
      initialized.current = true;
      setFilter({ ...emptyFilters, ...settings.filters });
    }
  }, [settings.filters]);
  const update = (patch) => {
    const next = { ...filter, keyword, ...patch };
    setFilter(next);
    save({
      filters: {
        ...next,
        minWidth: next.rememberSize ? next.minWidth : 0,
        minHeight: next.rememberSize ? next.minHeight : 0,
        types: next.rememberTypes ? next.types : [],
        keyword: next.rememberKeyword ? next.keyword : "",
      },
    });
  };
  const types = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      const type = item.type || item.format;
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  // A type absent from the new folder is not a hidden restriction on it.
  const effectiveTypes = useMemo(
    () => filter.types.filter((type) => types.some(([name]) => name === type)),
    [filter.types, types],
  );
  const candidates = useMemo(
    () =>
      items.filter((item) =>
        matchesMedia(item, {
          ...filter,
          keyword,
          types: effectiveTypes,
          minWidth: 0,
          minHeight: 0,
        }),
      ),
    [items, filter, effectiveTypes, keyword],
  );
  useEffect(() => {
    if (!filter.minWidth && !filter.minHeight) {
      setReading(false);
      return;
    }
    let live = true,
      cursor = 0;
    const requests = new Set();
    const missing = candidates.filter(
      (item) => !cache.current.has(item.thumbnail),
    );
    setReading(!!missing.length);
    const work = async () => {
      while (live && cursor < missing.length) {
        const item = missing[cursor++];
        const request = requestThumbnail(item.id, "dimensions");
        requests.add(request);
        try {
          const result = await request.promise;
          if (live && !result.cancelled) {
            const size = result.error
              ? {}
              : JSON.parse(new TextDecoder().decode(result.data));
            cache.current.set(item.thumbnail, size);
            if (cache.current.size > 12000)
              cache.current.delete(cache.current.keys().next().value);
            if (cursor % 8 === 0 || cursor >= missing.length)
              setRevision((value) => value + 1);
          }
        } catch {
          if (live) cache.current.set(item.thumbnail, {});
        } finally {
          requests.delete(request);
        }
      }
    };
    Promise.all([work(), work()]).finally(() => {
      if (live) {
        setReading(false);
        setRevision((value) => value + 1);
      }
    });
    return () => {
      live = false;
      for (const request of requests) request.cancel();
    };
  }, [candidates, filter.minWidth, filter.minHeight]);
  const visible = useMemo(
    () =>
      candidates.filter((item) =>
        matchesMedia(
          item,
          { ...filter, keyword, types: effectiveTypes },
          cache.current,
        ),
      ),
    [candidates, filter, effectiveTypes, revision, keyword],
  );
  return {
    filter: { ...filter, keyword, types: effectiveTypes },
    update,
    types,
    visible,
    reading,
  };
}

export default function MediaFilters({
  state,
  total,
  keyword,
  onKeyword,
  disabled,
}) {
  const [open, setOpen] = useState("");
  const close = useCallback(() => setOpen(""), []);
  const [size, setSize] = useState({ minWidth: 0, minHeight: 0 });
  const { filter, update, types, reading } = state;
  return (
    <>
      <div className="media-filters" aria-label="Media filters">
        <button
          aria-haspopup="dialog"
          aria-expanded={open === "Size"}
          disabled={disabled}
          className={filter.minWidth || filter.minHeight ? "active" : ""}
          onClick={() => {
            setSize({ minWidth: filter.minWidth, minHeight: filter.minHeight });
            setOpen("Size");
          }}
        >
          <Scan size={14} aria-hidden="true" />
          Size
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          aria-haspopup="dialog"
          aria-expanded={open === "Type"}
          disabled={disabled}
          className={filter.types.length ? "active" : ""}
          onClick={() => setOpen("Type")}
        >
          <Shapes size={14} aria-hidden="true" />
          Type{filter.types.length ? ` (${filter.types.length})` : ""}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          aria-haspopup="dialog"
          aria-expanded={open === "Keyword"}
          disabled={disabled}
          className={keyword ? "active" : ""}
          onClick={() => setOpen("Keyword")}
        >
          <Search size={14} aria-hidden="true" />
          Keyword
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {reading && (
          <span role="status" className="filter-reading">
            Reading sizes…
          </span>
        )}
      </div>
      {open &&
        createPortal(
          <Modal
            title={`${open} filter`}
            className="filter-scrim"
            onClose={close}
          >
            {open === "Size" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  update(size);
                  setOpen("");
                }}
              >
                <button
                  type="button"
                  className={`filter-all ${!filter.minWidth && !filter.minHeight ? "active" : ""}`}
                  onClick={() => {
                    update({ minWidth: 0, minHeight: 0 });
                    setOpen("");
                  }}
                >
                  All <span>{total}</span>
                </button>
                <div className="filter-size-fields">
                  {["minWidth", "minHeight"].map((key) => (
                    <label key={key}>
                      {key === "minWidth"
                        ? "Minimum width px"
                        : "Minimum height px"}
                      <input
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        value={size[key]}
                        onChange={(event) =>
                          setSize({
                            ...size,
                            [key]: Math.max(
                              0,
                              Math.min(100000, Number(event.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={filter.rememberSize}
                    onChange={(event) =>
                      update({ rememberSize: event.target.checked })
                    }
                  />
                  Remember size filters
                </label>
                <div className="modal-actions">
                  <button className="button primary" type="submit">
                    Apply
                  </button>
                </div>
              </form>
            )}
            {open === "Type" && (
              <>
                <label
                  className={`filter-check filter-all ${!filter.types.length ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={!filter.types.length}
                    onChange={() => update({ types: [] })}
                  />
                  All<span>{total}</span>
                </label>
                <div className="filter-types">
                  {types.map(([type, count]) => (
                    <label className="filter-check" key={type}>
                      <input
                        type="checkbox"
                        checked={filter.types.includes(type)}
                        onChange={() =>
                          update({ types: toggleType(filter.types, type) })
                        }
                      />
                      {type}
                      <span>{count}</span>
                    </label>
                  ))}
                </div>
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={filter.rememberTypes}
                    onChange={(event) =>
                      update({ rememberTypes: event.target.checked })
                    }
                  />
                  Remember type filters
                </label>
              </>
            )}
            {open === "Keyword" && (
              <>
                <label className="input-label" htmlFor="keyword-filter">
                  Filename contains
                </label>
                <input
                  id="keyword-filter"
                  className="text-input"
                  maxLength={256}
                  value={keyword}
                  onChange={(event) => {
                    onKeyword(event.target.value);
                    update({ keyword: event.target.value });
                  }}
                />
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={filter.rememberKeyword}
                    onChange={(event) =>
                      update({ rememberKeyword: event.target.checked, keyword })
                    }
                  />
                  Remember keyword filter
                </label>
                <button
                  className="button"
                  onClick={() => {
                    onKeyword("");
                    update({ keyword: "" });
                  }}
                >
                  Clear keyword
                </button>
              </>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}
