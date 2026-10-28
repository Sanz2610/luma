import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Aperture,
  ArrowDownWideNarrow,
  Check,
  CheckSquare,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Image,
  Images,
  Info,
  Link,
  LoaderCircle,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./api";
import PhotoGrid from "./PhotoGrid";
import FolderTabs, { FolderPicker } from "./FolderTabs";
import { sortedFolders } from "./layout.mjs";
import { basename, bytes, errorText, IconButton, Modal, number } from "./ui";
import WindowMaximize, { useWindowState } from "./WindowMaximize";
import Updates, { useUpdates } from "./Updates";
import { version } from "../package.json";
import About from "./About";
import ViewerWheelSetting from "./ViewerWheelSetting";
import ImageInfo from "./ImageInfo";
import PhotoMenu from "./PhotoMenu";
import PhotoDeletion, { usePhotoDeletion } from "./PhotoDeletion";
import Subfolders, { DirectoryButton, useDirectoryIndex } from "./Subfolders";

const initialSettings = {
  root: "",
  thumbnailSize: 220,
  folderColumns: 2,
  columns: 6,
  ratio: "1:1",
  fit: "cover",
  sort: "newest",
  showNames: false,
  confirmDelete: true,
  viewerWheel: "zoom",
  gap: "compact",
  tabSort: "name",
  tabDirection: "asc",
  tabOrders: {},
};
const initial = {
  settings: initialSettings,
  images: [],
  folders: [],
  error: "",
  warnings: [],
  scanning: false,
};
const sortNames = {
  newest: "Date modified ↓",
  oldest: "Date modified ↑",
  "created-desc": "Date created ↓",
  created: "Date created ↑",
  name: "Name A–Z",
  "name-desc": "Name Z–A",
};
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export default function App() {
  const windowState = useWindowState();
  const updateState = useUpdates();
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [active, setActive] = useState("all"),
    [directoryId, setDirectoryId] = useState(""),
    [query, setQuery] = useState(""),
    [organizing, setOrganizing] = useState(false),
    [selected, setSelected] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false),
    [subfoldersOpen, setSubfoldersOpen] = useState(false),
    [pickerHidden, setPickerHidden] = useState(false),
    [pickerOpen, setPickerOpen] = useState(false),
    [orderOpen, setOrderOpen] = useState(false);
  const [linkFolder, setLinkFolder] = useState(null),
    [linkValue, setLinkValue] = useState(""),
    [linkError, setLinkError] = useState(""),
    [linkBusy, setLinkBusy] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(null);
  const [properties, setProperties] = useState(null);
  const closePhotoMenu = useCallback(() => setPhotoMenu(null), []);
  const closeProperties = useCallback(() => setProperties(null), []);
  const [notice, setNotice] = useState(null),
    [cacheBytes, setCacheBytes] = useState(0),
    [warningsOpen, setWarningsOpen] = useState(false);
  const [renameFolder, setRenameFolder] = useState(null),
    [renameValue, setRenameValue] = useState(""),
    [renameError, setRenameError] = useState("");
  const closeRename = useCallback(() => setRenameFolder(null), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeSubfolders = useCallback(() => setSubfoldersOpen(false), []);
  const openRename = useCallback((folder) => {
    setRenameFolder(folder);
    setRenameValue(folder.name);
    setRenameError("");
  }, []);
  const search = useRef(null),
    lastSelected = useRef(null),
    localPreferences = useRef({});
  const deferredQuery = useDeferredValue(query);
  const settings = data.settings,
    hasRoot = !!settings.root;
  const showNotice = useCallback(
    (text, error = false) => setNotice({ text, error, key: Date.now() }),
    [],
  );
  const run = useCallback(
    async (task, success) => {
      try {
        const value = await task();
        if (success) showNotice(success);
        return value;
      } catch (error) {
        showNotice(errorText(error), true);
        return null;
      }
    },
    [showNotice],
  );
  const applyData = useCallback((value) => {
    if (!value) return;
    setData({
      ...value,
      settings: {
        ...initialSettings,
        ...value.settings,
        ...localPreferences.current,
      },
    });
    setSelected((previous) => {
      if (!previous.size) return previous;
      const available = new Set(value.images.map((image) => image.id));
      return new Set([...previous].filter((id) => available.has(id)));
    });
  }, []);
  useEffect(() => {
    let live = true;
    api
      .getLibrary()
      .then((value) => {
        if (live) applyData(value);
      })
      .catch((error) => showNotice(errorText(error), true))
      .finally(() => {
        if (live) setLoading(false);
      });
    const unsubscribe = api.onLibrary(applyData);
    const offPreferences = api.onPreferences((patch) => {
      localPreferences.current = { ...localPreferences.current, ...patch };
      setData((previous) => ({
        ...previous,
        settings: { ...previous.settings, ...patch },
      }));
    });
    return () => {
      live = false;
      unsubscribe();
      offPreferences();
    };
  }, [applyData, showNotice]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (
      active !== "all" &&
      !data.scanning &&
      !data.folders.some((folder) => folder.id === active)
    ) {
      setActive("all");
      setDirectoryId("");
      setSubfoldersOpen(false);
    }
  }, [active, data.folders, data.scanning]);
  useEffect(() => {
    setSelected(new Set());
    lastSelected.current = null;
  }, [active, directoryId, deferredQuery]);
  useEffect(() => {
    lastSelected.current = null;
  }, [settings.sort]);
  useEffect(() => {
    if (settingsOpen)
      api
        .cacheInfo()
        .then(setCacheBytes)
        .catch(() => {});
  }, [settingsOpen]);
  const changePreferences = useCallback(
    (patch) => {
      localPreferences.current = { ...localPreferences.current, ...patch };
      setData((previous) => ({
        ...previous,
        settings: { ...previous.settings, ...patch },
      }));
      api
        .setPreferences(patch)
        .catch((error) =>
          showNotice(`Could not save settings: ${errorText(error)}`, true),
        );
    },
    [showNotice],
  );
  const folders = useMemo(
    () =>
      sortedFolders(data.folders, {
        root: settings.root,
        tabSort: settings.tabSort,
        tabDirection: settings.tabDirection,
        tabOrders: settings.tabOrders,
      }),
    [
      data.folders,
      settings.root,
      settings.tabSort,
      settings.tabDirection,
      settings.tabOrders,
    ],
  );
  const currentFolder = useMemo(
    () => data.folders.find((folder) => folder.id === active),
    [data.folders, active],
  );
  const groupedImages = useMemo(() => {
    const groups = new Map();
    for (const image of data.images) {
      if (!groups.has(image.folderId)) groups.set(image.folderId, []);
      groups.get(image.folderId).push(image);
    }
    return groups;
  }, [data.images]);
  const directoryIndex = useDirectoryIndex(data.directories, data.folders);
  const currentDirectory = directoryIndex.byId.get(directoryId || active);
  const selectTab = useCallback((id) => {
    setActive(id);
    setDirectoryId("");
  }, []);
  useEffect(() => {
    if (directoryId && !data.scanning && !directoryIndex.byId.has(directoryId))
      setDirectoryId("");
  }, [directoryId, directoryIndex, data.scanning]);
  const images = useMemo(() => {
    let base = active === "all" ? data.images : groupedImages.get(active) || [];
    if (directoryId && currentDirectory) {
      const prefix = currentDirectory.relativePath + "/";
      base = base.filter((image) =>
        image.relativePath.split(/[\\/]/).join("/").startsWith(prefix),
      );
    }
    const text = deferredQuery.trim().toLocaleLowerCase();
    const list = text
      ? base.filter((image) => image.name.toLocaleLowerCase().includes(text))
      : [...base];
    return list.sort((a, b) => {
      if (settings.sort === "newest")
        return b.modified - a.modified || collator.compare(a.name, b.name);
      if (settings.sort === "oldest")
        return a.modified - b.modified || collator.compare(a.name, b.name);
      if (settings.sort === "created")
        return (
          (a.created || 0) - (b.created || 0) ||
          collator.compare(a.name, b.name)
        );
      if (settings.sort === "created-desc")
        return (
          (b.created || 0) - (a.created || 0) ||
          collator.compare(a.name, b.name)
        );
      return (
        (settings.sort === "name-desc" ? -1 : 1) *
        collator.compare(a.name, b.name)
      );
    });
  }, [
    data.images,
    groupedImages,
    active,
    directoryId,
    currentDirectory,
    deferredQuery,
    settings.sort,
  ]);
  const setOrder = useCallback(
    (ids) => {
      const tabOrders = { ...settings.tabOrders, [settings.root]: ids };
      localPreferences.current = {
        ...localPreferences.current,
        tabOrders,
        tabSort: "manual",
      };
      setData((previous) => ({
        ...previous,
        settings: { ...previous.settings, tabOrders, tabSort: "manual" },
      }));
      api
        .setTabOrder(ids)
        .catch((error) =>
          showNotice(`Could not save tab order: ${errorText(error)}`, true),
        );
    },
    [settings.root, settings.tabOrders, showNotice],
  );
  const changeFolder = useCallback(async () => {
    setBusy(true);
    const result = await run(() => api.chooseFolder());
    if (result) {
      applyData(result);
      setActive("all");
      setDirectoryId("");
      setSubfoldersOpen(false);
      setQuery("");
      setOrganizing(false);
      setSelected(new Set());
    }
    setBusy(false);
  }, [run, applyData]);
  const goHome = useCallback(async () => {
    const result = await run(() => api.closeLibrary());
    if (!result) return;
    applyData(result);
    setActive("all");
    setDirectoryId("");
    setQuery("");
    setSelected(new Set());
    setOrganizing(false);
    setPickerOpen(false);
    setSettingsOpen(false);
  }, [run, applyData]);
  const refresh = useCallback(async () => {
    setBusy(true);
    const value = await run(() => api.refresh());
    if (value) applyData(value);
    setBusy(false);
  }, [run, applyData]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []),
    closePicker = useCallback(() => setPickerOpen(false), []),
    closeOrder = useCallback(() => setOrderOpen(false), []),
    closeLink = useCallback(() => {
      if (!linkBusy) setLinkFolder(null);
    }, [linkBusy]);
  const closeWarnings = useCallback(() => setWarningsOpen(false), []);
  const openLink = () => {
    if (!currentFolder) return;
    setLinkFolder(currentFolder);
    setLinkValue(currentFolder.url || "");
    setLinkError("");
  };
  const toggleOrganize = useCallback(() => {
    setOrganizing((value) => !value);
    setSelected(new Set());
    lastSelected.current = null;
  }, []);
  const selectAll = useCallback(
    () => setSelected(new Set(images.map((image) => image.id))),
    [images],
  );
  const onPhoto = useCallback(
    (image, index, event) => {
      if (!organizing) {
        run(() =>
          api.openViewer(
            image.id,
            images.map((item) => item.id),
          ),
        );
        return;
      }
      const anchor = lastSelected.current
        ? images.findIndex((item) => item.id === lastSelected.current)
        : -1;
      setSelected((previous) => {
        const next = new Set(previous);
        if (event.shiftKey && anchor >= 0)
          for (
            let i = Math.min(anchor, index);
            i <= Math.max(anchor, index);
            i++
          )
            next.add(images[i].id);
        else if (next.has(image.id)) next.delete(image.id);
        else next.add(image.id);
        return next;
      });
      lastSelected.current = image.id;
    },
    [images, organizing, run],
  );
  const onDeleteResult = useCallback(
    (result) => {
      applyData(result.library);
      setSelected(new Set(result.failed.map((item) => item.id)));
      if (result.deleted.length)
        showNotice(
          `Moved ${number(result.deleted.length)} ${result.deleted.length === 1 ? "photo" : "photos"} to Recycle Bin.`,
        );
    },
    [applyData, showNotice],
  );
  const deletion = usePhotoDeletion({
    confirmDelete: settings.confirmDelete,
    onResult: onDeleteResult,
  });
  const deleteBusy = deletion.busy;
  const onSelection = useCallback((ids) => {
    setSelected(ids);
    lastSelected.current = null;
  }, []);
  const openPhotoMenu = useCallback((image, event) => {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setPhotoMenu({
      image,
      x: event.clientX || box.left + 10,
      y: event.clientY || box.top + 10,
    });
  }, []);
  const photoAction = (action, image) => {
    setPhotoMenu(null);
    if (action === "open")
      run(() =>
        api.openViewer(
          image.id,
          images.map((item) => item.id),
        ),
      );
    if (action === "reveal") run(() => api.reveal(image.id));
    if (action === "lens") run(() => api.searchLens(image.id));
    if (action === "properties") setProperties(image);
    if (action === "delete") deletion.request([image.id]);
  };
  const overlay =
    subfoldersOpen ||
    aboutOpen ||
    !!renameFolder ||
    settingsOpen ||
    pickerOpen ||
    orderOpen ||
    !!linkFolder ||
    deletion.open ||
    !!properties ||
    warningsOpen;
  useEffect(() => {
    const handler = (event) => {
      if (overlay || photoMenu || deleteBusy) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        search.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPickerHidden(false);
        setPickerOpen(true);
      }
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      if (event.key === "Escape" && organizing) {
        setOrganizing(false);
        setSelected(new Set());
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a" &&
        organizing
      ) {
        event.preventDefault();
        selectAll();
      }
      if (event.key === "Delete" && organizing && selected.size)
        deletion.request([...selected]);
      if (event.key === "F5") {
        event.preventDefault();
        refresh();
      }
      if (event.key === "F11") {
        event.preventDefault();
        api.windowAction("fullscreen");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    overlay,
    photoMenu,
    deleteBusy,
    deletion.request,
    organizing,
    selected,
    selectAll,
    refresh,
  ]);

  return (
    <div className="app-shell">
      <div className="workspace" inert={overlay ? true : undefined}>
        <header className="titlebar">
          <div className="titlebar-brand">
            <Aperture size={14} />
            <strong>LUMA</strong>
            {hasRoot && (
              <span className="titlebar-folder" title={settings.root}>
                {basename(settings.root)}
              </span>
            )}
          </div>
          <div className="window-controls">
            <IconButton
              label="Minimize"
              onClick={() => api.windowAction("minimize")}
            >
              <Minus />
            </IconButton>
            <WindowMaximize state={windowState} />
            <IconButton
              className="window-close"
              label="Close application"
              onClick={() => api.windowAction("close")}
            >
              <X />
            </IconButton>
          </div>
        </header>
        <aside className="rail" aria-label="Navigation">
          <IconButton
            label="All photos"
            className="active"
            onClick={() => {
              selectTab("all");
              setQuery("");
            }}
          >
            <Images />
          </IconButton>
          <IconButton
            label="Choose photo folder"
            disabled={busy || deleteBusy}
            onClick={changeFolder}
          >
            <FolderOpen />
          </IconButton>
          <div className="rail-bottom">
            <IconButton label="About Luma" onClick={() => setAboutOpen(true)}>
              <Info />
            </IconButton>
            {(updateState.status === "ready" ||
              (updateState.mode === "portable" &&
                updateState.status === "available")) && (
              <IconButton
                label="Update available"
                className="active"
                onClick={() => setSettingsOpen(true)}
              >
                <RefreshCw />
              </IconButton>
            )}
            <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </IconButton>
          </div>
        </aside>
        <main>
          <FolderTabs
            busy={busy}
            key={settings.root}
            hasLibrary={hasRoot}
            onHome={goHome}
            onRename={openRename}
            folders={folders}
            active={active}
            onSelect={selectTab}
            onOrder={setOrder}
            onBrowse={() => {
              setPickerHidden(false);
              setPickerOpen(true);
            }}
            onSort={() => setOrderOpen(true)}
            onHide={(id) =>
              run(async () => {
                const value = await api.hideFolder(id, true);
                applyData(value);
              })
            }
          />
          <section
            id="photo-panel"
            className="photo-panel"
            role="tabpanel"
            aria-label={currentFolder?.name || "All photos"}
          >
            {data.error && (
              <div className="library-warning" role="alert">
                <Info size={16} />
                <span>{data.error}</span>
                <button onClick={changeFolder}>Choose folder</button>
              </div>
            )}
            {loading || (data.scanning && !data.images.length) ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={28} />
                <h2>Indexing your library…</h2>
                <p>
                  {data.scanProgress?.total
                    ? `${number(data.scanProgress.done)} / ${number(data.scanProgress.total)} folders`
                    : "Your photos will appear as they are ready."}
                </p>
              </div>
            ) : !hasRoot ? (
              <div className="empty-state welcome-state">
                <div className="welcome-mark">
                  <Images size={38} />
                </div>
                <span className="eyebrow">YOUR PHOTOS, IN FOCUS</span>
                <h1>
                  A little less interface.
                  <br />A lot more photography.
                </h1>
                <p>
                  Choose your photo folder.
                  <br />
                  Every subfolder becomes a tab, just where it belongs.
                </p>
                <button
                  className="button primary large"
                  onClick={changeFolder}
                  disabled={busy}
                >
                  <FolderOpen size={17} />
                  Choose photo folder
                </button>
                <span className="local-note">
                  <HardDrive size={13} />
                  Local files. Your space.
                </span>
              </div>
            ) : !images.length ? (
              <div className="empty-state">
                <Search size={28} />
                <h2>
                  {deferredQuery
                    ? "No matching photos"
                    : data.hiddenFolders?.length && !data.folders.length
                      ? "Your folders are hidden"
                      : data.error
                        ? "Folder unavailable"
                        : data.scanning
                          ? "Reading this folder…"
                          : "No photos in this folder"}
                </h2>
                <p>
                  {deferredQuery
                    ? "Try another filename or clear your search."
                    : data.hiddenFolders?.length && !data.folders.length
                      ? "Restore a folder to see its photos. Files are still on disk."
                      : "JPG, PNG, WebP, GIF, AVIF and BMP are supported."}
                </p>
                <button
                  className="button"
                  onClick={deferredQuery ? () => setQuery("") : refresh}
                >
                  {deferredQuery ? "Clear search" : "Refresh library"}
                </button>
                {!!data.hiddenFolders?.length && (
                  <button
                    className="button"
                    onClick={() => {
                      setPickerHidden(true);
                      setPickerOpen(true);
                    }}
                  >
                    Hidden folders ({data.hiddenFolders.length})
                  </button>
                )}
              </div>
            ) : (
              <PhotoGrid
                images={images}
                columns={settings.columns}
                ratio={settings.ratio}
                gap={settings.gap}
                fit={settings.fit}
                showNames={settings.showNames}
                selected={selected}
                organizing={organizing && !deleteBusy}
                onSelection={onSelection}
                onContextMenu={openPhotoMenu}
                onPhoto={onPhoto}
                scrollKey={`${active}|${directoryId}|${deferredQuery}|${settings.sort}`}
              />
            )}
            {organizing && (
              <div className="selection-bar">
                <strong>{number(selected.size)} selected</strong>
                <button
                  onClick={selectAll}
                  disabled={selected.size === images.length}
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  disabled={!selected.size}
                >
                  Clear
                </button>
                <span />
                <button
                  className="button danger-quiet"
                  disabled={!selected.size}
                  onClick={() => deletion.request([...selected])}
                >
                  <Trash2 size={15} />
                  Delete{selected.size ? ` ${number(selected.size)}` : ""}
                </button>
                <IconButton label="Exit organize" onClick={toggleOrganize}>
                  <X size={16} />
                </IconButton>
              </div>
            )}
          </section>
          <footer className="library-footer">
            <div className="footer-left">
              <span
                className="photo-count"
                title={`${currentFolder?.name || basename(settings.root) || "Library"} · ${number(data.images.length)} photos in library`}
              >
                {data.scanning || busy ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <span className="status-dot" />
                )}
                {number(images.length)} photos
              </span>
              {hasRoot && (
                <DirectoryButton
                  current={currentDirectory}
                  rootName={basename(settings.root)}
                  onClick={() => setSubfoldersOpen(true)}
                />
              )}
              {currentFolder && (
                <div className="folder-link-controls">
                  <button
                    className={`folder-url ${currentFolder.url ? "has-link" : ""}`}
                    onClick={() =>
                      currentFolder.url
                        ? run(() => api.openLink(currentFolder.id))
                        : openLink()
                    }
                    title={
                      currentFolder.url || `Add a link to ${currentFolder.name}`
                    }
                  >
                    {currentFolder.url ? (
                      <ExternalLink size={13} />
                    ) : (
                      <Plus size={13} />
                    )}
                    <span>{currentFolder.url ? "Open link" : "Add link"}</span>
                  </button>
                  {currentFolder.url && (
                    <IconButton
                      label="Edit folder link"
                      className="edit-link"
                      onClick={openLink}
                    >
                      <Pencil size={13} />
                    </IconButton>
                  )}
                </div>
              )}
              <label className="search-box">
                <Search size={14} />
                <input
                  ref={search}
                  aria-label="Search photos"
                  placeholder="Search photos…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={!hasRoot}
                />
                {query ? (
                  <IconButton label="Clear search" onClick={() => setQuery("")}>
                    <X size={13} />
                  </IconButton>
                ) : (
                  <kbd>Ctrl F</kbd>
                )}
              </label>
              <IconButton
                label="Refresh library (F5)"
                onClick={refresh}
                disabled={!hasRoot || busy || deleteBusy}
              >
                <RefreshCw size={15} />
              </IconButton>
              <IconButton
                className="mobile-about"
                label="About Luma"
                onClick={() => setAboutOpen(true)}
              >
                <Info size={15} />
              </IconButton>
              {data.warnings.length > 0 && (
                <IconButton
                  label="Library warnings"
                  onClick={() => setWarningsOpen(true)}
                >
                  <Info size={15} />
                </IconButton>
              )}
            </div>
            <div className="footer-right">
              <label className="sort-control">
                <ArrowDownWideNarrow size={14} />
                <select
                  aria-label="Sort photos"
                  value={settings.sort}
                  onChange={(event) =>
                    changePreferences({ sort: event.target.value })
                  }
                >
                  {Object.entries(sortNames).map(([value, text]) => (
                    <option value={value} key={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <select
                className="ratio-select"
                aria-label="Thumbnail ratio"
                title="Thumbnail aspect ratio"
                value={settings.ratio}
                onChange={(event) =>
                  changePreferences({ ratio: event.target.value })
                }
              >
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
              </select>
              <span className="control-divider" />
              <div className="size-control">
                <IconButton
                  label="Smaller thumbnails"
                  disabled={settings.columns >= 12}
                  onClick={() =>
                    changePreferences({
                      columns: Math.min(12, settings.columns + 1),
                    })
                  }
                >
                  <Minus size={14} />
                </IconButton>
                <input
                  aria-label="Thumbnail size"
                  aria-valuetext={`${settings.columns} columns`}
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={13 - settings.columns}
                  onChange={(event) =>
                    changePreferences({
                      columns: 13 - Number(event.target.value),
                    })
                  }
                />
                <IconButton
                  label="Larger thumbnails"
                  disabled={settings.columns <= 1}
                  onClick={() =>
                    changePreferences({
                      columns: Math.max(1, settings.columns - 1),
                    })
                  }
                >
                  <Plus size={14} />
                </IconButton>
              </div>
              {!organizing && (
                <button
                  className={`button organize-button ${organizing ? "is-active" : ""}`}
                  aria-pressed={organizing}
                  disabled={!data.images.length || data.scanning}
                  onClick={toggleOrganize}
                >
                  <CheckSquare size={15} />
                  Organize
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
      {aboutOpen && <About onClose={closeAbout} />}
      {subfoldersOpen && (
        <Subfolders
          index={directoryIndex}
          initial={directoryId || active}
          rootName={basename(settings.root)}
          onClose={closeSubfolders}
          onSelect={(top, id) => {
            setActive(top);
            setDirectoryId(id);
          }}
        />
      )}
      {settingsOpen && (
        <Modal
          title="Settings"
          className="settings-scrim"
          onClose={closeSettings}
        >
          <div className="settings-content">
            <section className="settings-section">
              <h3>
                <FolderOpen size={17} />
                Photo folder
              </h3>
              <p>Subfolders appear as tabs. Originals stay in place.</p>
              <div className="folder-path">
                <FolderOpen size={18} />
                <span>{settings.root || "No folder selected"}</span>
              </div>
              <button
                className="button full-width"
                onClick={changeFolder}
                disabled={busy}
              >
                {busy
                  ? "Reading folder…"
                  : hasRoot
                    ? "Change folder"
                    : "Choose photo folder"}
              </button>
            </section>
            <section className="settings-section">
              <h3>
                <Grid2X2 size={17} />
                Thumbnails
              </h3>
              <div className="setting-row">
                <label htmlFor="fit-option">Image fit</label>
                <select
                  id="fit-option"
                  value={settings.fit}
                  onChange={(event) =>
                    changePreferences({ fit: event.target.value })
                  }
                >
                  <option value="cover">Crop to fill</option>
                  <option value="contain">Fit entire image</option>
                </select>
              </div>
              <div className="setting-row">
                <label htmlFor="gap-option">Grid spacing</label>
                <select
                  id="gap-option"
                  value={settings.gap}
                  onChange={(event) =>
                    changePreferences({ gap: event.target.value })
                  }
                >
                  <option value="compact">Compact · 3 px</option>
                  <option value="comfortable">Comfortable · 9 px</option>
                </select>
              </div>
              <div className="setting-row">
                <label htmlFor="name-toggle">Show filenames</label>
                <button
                  id="name-toggle"
                  role="switch"
                  aria-checked={settings.showNames}
                  className={`switch ${settings.showNames ? "on" : ""}`}
                  onClick={() =>
                    changePreferences({ showNames: !settings.showNames })
                  }
                >
                  <span />
                </button>
              </div>
            </section>
            <section className="settings-section">
              <h3>
                <Image size={17} />
                Viewer
              </h3>
              <ViewerWheelSetting
                value={settings.viewerWheel}
                onChange={(viewerWheel) => changePreferences({ viewerWheel })}
              />
            </section>
            <section className="settings-section">
              <h3>
                <Trash2 size={17} />
                Deleting photos
              </h3>
              <div className="setting-row">
                <label htmlFor="delete-confirm-toggle">
                  Confirm before deleting
                </label>
                <button
                  id="delete-confirm-toggle"
                  role="switch"
                  aria-checked={settings.confirmDelete}
                  className={`switch ${settings.confirmDelete ? "on" : ""}`}
                  onClick={() =>
                    changePreferences({
                      confirmDelete: !settings.confirmDelete,
                    })
                  }
                >
                  <span />
                </button>
              </div>
              <p>Deleted photos go to Windows Recycle Bin.</p>
            </section>
            <section className="settings-section cache-section">
              <div>
                <h3>Thumbnail cache</h3>
                <p>{bytes(cacheBytes)} · Around 1 GB maximum</p>
              </div>
              <button
                className="button"
                onClick={async () => {
                  const value = await run(
                    () => api.clearCache(),
                    "Thumbnail cache cleared.",
                  );
                  if (value !== null) setCacheBytes(value);
                }}
              >
                Clear cache
              </button>
            </section>
            <section className="settings-section">
              <h3>Keyboard shortcuts</h3>
              <div className="shortcut-list">
                <span>Search photos</span>
                <kbd>Ctrl F</kbd>
                <span>Find a folder</span>
                <kbd>Ctrl K</kbd>
                <span>Move tab left / right</span>
                <kbd>Alt Shift ← / →</kbd>
                <span>Fullscreen</span>
                <kbd>F11</kbd>
              </div>
            </section>
            <Updates state={updateState} />
            <div className="settings-foot">
              <Aperture size={21} />
              <div>
                <strong>
                  Luma <span>{version}</span>
                </strong>
                <p>Your photos, in focus.</p>
              </div>
            </div>
          </div>
          <footer className="settings-bottom">
            <CircleCheck size={14} />
            <span>Saved automatically</span>
            <button className="button" onClick={closeSettings}>
              Done
            </button>
          </footer>
        </Modal>
      )}
      {pickerOpen && (
        <FolderPicker
          initialHidden={pickerHidden}
          onRename={(folder) => {
            setPickerOpen(false);
            openRename(folder);
          }}
          folders={folders}
          columns={settings.folderColumns || 2}
          onColumns={(folderColumns) => changePreferences({ folderColumns })}
          hiddenFolders={data.hiddenFolders || []}
          active={active}
          onSelect={selectTab}
          onOrder={setOrder}
          onHide={(id) =>
            run(async () => {
              const value = await api.hideFolder(id, true);
              applyData(value);
              showNotice("Folder removed from library. Files kept on disk.");
            })
          }
          onRestore={(id) =>
            run(async () => {
              const value = await api.hideFolder(id, false);
              applyData(value);
              showNotice("Folder restored to library.");
            })
          }
          onClose={closePicker}
        />
      )}
      {orderOpen && (
        <Modal title="Tab order" className="order-scrim" onClose={closeOrder}>
          <p className="modal-description">
            Choose how folders appear in the tab strip and folder browser.
          </p>
          <div className="setting-row">
            <label htmlFor="tab-sort">Sort by</label>
            <select
              id="tab-sort"
              value={settings.tabSort}
              onChange={(event) =>
                changePreferences({ tabSort: event.target.value })
              }
            >
              <option value="manual">Manual order</option>
              <option value="name">Name</option>
              <option value="created">Date created</option>
            </select>
          </div>
          <div className="setting-row">
            <label htmlFor="tab-direction">Order</label>
            <select
              id="tab-direction"
              value={settings.tabDirection}
              disabled={settings.tabSort === "manual"}
              onChange={(event) =>
                changePreferences({ tabDirection: event.target.value })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          <p className="field-hint">
            Drag tabs to arrange them. Dragging switches to Manual order. You
            can also focus a tab and press Alt+Shift+Left / Right.
          </p>
          <div className="modal-actions">
            <button className="button primary" onClick={closeOrder}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {linkFolder && (
        <Modal title={`Folder link · ${linkFolder.name}`} onClose={closeLink}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setLinkBusy(true);
              setLinkError("");
              try {
                const result = await api.setLink(linkFolder.id, linkValue);
                setData((previous) => ({
                  ...previous,
                  folders: previous.folders.map((folder) =>
                    folder.id === result.id
                      ? { ...folder, url: result.url }
                      : folder,
                  ),
                }));
                setLinkFolder(null);
                showNotice(
                  result.url ? "Folder link saved." : "Folder link removed.",
                );
              } catch (error) {
                setLinkError(errorText(error));
              } finally {
                setLinkBusy(false);
              }
            }}
          >
            <p className="modal-description">
              This link is only shown inside this folder's tab.
            </p>
            <label className="input-label" htmlFor="folder-url-input">
              URL
            </label>
            <input
              autoFocus
              id="folder-url-input"
              className={`text-input ${linkError ? "invalid" : ""}`}
              placeholder="example.com or search keywords"
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              aria-invalid={!!linkError}
              aria-describedby={linkError ? "url-error" : "url-hint"}
            />
            {linkError ? (
              <p className="field-error" id="url-error">
                {linkError}
              </p>
            ) : (
              <p className="field-hint" id="url-hint">
                Enter a web address or search keywords. Leave empty to remove.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={closeLink}
                disabled={linkBusy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={linkBusy}
              >
                <Check size={15} />
                {linkBusy ? "Saving…" : "Save link"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <PhotoDeletion state={deletion} />
      {photoMenu && !overlay && (
        <PhotoMenu
          {...photoMenu}
          onClose={closePhotoMenu}
          onAction={photoAction}
        />
      )}
      {properties && (
        <Modal
          title="Properties"
          className="properties-scrim"
          onClose={closeProperties}
        >
          <ImageInfo
            image={properties}
            onReveal={(id) => run(() => api.reveal(id))}
            onClose={closeProperties}
            embedded
          />
        </Modal>
      )}
      {warningsOpen && (
        <Modal title="Library warnings" onClose={closeWarnings}>
          <ul className="failure-list">
            {data.warnings.slice(0, 100).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="button" onClick={closeWarnings}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {renameFolder && (
        <Modal title="Rename tab" onClose={closeRename}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                const result = await api.renameTab(
                  renameFolder.id,
                  renameValue,
                );
                applyData(result);
                setRenameFolder(null);
                showNotice("Tab name saved.");
              } catch (error) {
                setRenameError(errorText(error));
              }
            }}
          >
            <p className="modal-description">
              Folder:{" "}
              <strong>{renameFolder.sourceName || renameFolder.name}</strong>.
              This only changes its name in Luma.
            </p>
            <label className="input-label" htmlFor="tab-name-input">
              Tab name
            </label>
            <input
              id="tab-name-input"
              className="text-input"
              data-initial-focus
              maxLength={120}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
            <p className="field-hint">
              Leave empty to use the original folder name.
            </p>
            {renameError && (
              <p className="field-error" role="alert">
                {renameError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button" onClick={closeRename}>
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
          key={notice.key}
        >
          {notice.error ? <Info size={17} /> : <CircleCheck size={17} />}
          <span>{notice.text}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
