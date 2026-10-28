const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  IMAGE_EXTENSIONS: EXTENSIONS,
  needsConversion,
  isRaw,
} = require("./image-formats.cjs");

const defaults = {
  root: "",
  thumbnailSize: 220,
  columns: 6,
  folderColumns: 2,
  ratio: "1:1",
  fit: "cover",
  sort: "newest",
  showNames: false,
  confirmDelete: true,
  viewerWheel: "zoom",
  gap: "compact",
  links: {},
  tabSort: "name",
  tabDirection: "asc",
  tabOrders: {},
  hiddenFolders: {},
  tabNames: {},
};
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    !!relative &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};
function cleanUrl(value) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Invalid URL.");
  if (!value.trim()) return "";
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(text))
      throw new Error("This link type cannot be opened.");
    if (!/\s/.test(text)) {
      try {
        const candidate = new URL(`https://${text}`);
        if (
          candidate.hostname.includes(".") &&
          !candidate.username &&
          !candidate.password
        )
          return candidate.href;
      } catch {}
    }
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("This web address could not be opened.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an http:// or https:// URL without embedded credentials.",
    );
  return url.href;
}
async function mapLimit(items, count, operation) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(count, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await operation(items[index], index);
      }
    }),
  );
  return results;
}
class Library {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.configPath = path.join(dataDir, "settings.json");
    this.settings = structuredClone(defaults);
    this.files = new Map();
    this.folders = [];
    this.directories = new Map();
    this.hiddenFolders = [];
    this.warnings = [];
    this.error = "";
    this.pendingScan = null;
    this.writeQueue = Promise.resolve();
    this.scanning = false;
    this.scanProgress = { done: 0, total: 0 };
    this.onPartial = null;
    this.queuedFull = false;
    this.queuedChanges = new Set();
    this.lastScan = null;
  }
  async loadSettings() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const value = JSON.parse(await fs.readFile(this.configPath, "utf8"));
      if (typeof value.root === "string") this.settings.root = value.root;
      this.applyPreferences(value);
      if (
        value.tabNames &&
        typeof value.tabNames === "object" &&
        !Array.isArray(value.tabNames)
      ) {
        for (const [root, names] of Object.entries(value.tabNames))
          if (names && typeof names === "object" && !Array.isArray(names)) {
            const valid = {};
            for (const [id, name] of Object.entries(names))
              if (
                /^[a-f0-9]{64}$/.test(id) &&
                typeof name === "string" &&
                name.trim() &&
                name.length <= 120 &&
                !/[\u0000-\u001f\u007f]/.test(name)
              )
                valid[id] = name.trim();
            this.settings.tabNames[root] = valid;
          }
      }
      if (
        value.hiddenFolders &&
        typeof value.hiddenFolders === "object" &&
        !Array.isArray(value.hiddenFolders)
      ) {
        for (const [root, ids] of Object.entries(value.hiddenFolders))
          if (Array.isArray(ids))
            this.settings.hiddenFolders[root] = [
              ...new Set(
                ids.filter(
                  (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id),
                ),
              ),
            ];
      }
      if (
        value.links &&
        typeof value.links === "object" &&
        !Array.isArray(value.links)
      )
        for (const [key, link] of Object.entries(value.links)) {
          try {
            this.settings.links[key] = cleanUrl(link);
          } catch {}
        }
      if (
        value.tabOrders &&
        typeof value.tabOrders === "object" &&
        !Array.isArray(value.tabOrders)
      ) {
        for (const [root, ids] of Object.entries(value.tabOrders))
          if (Array.isArray(ids))
            this.settings.tabOrders[root] = [
              ...new Set(
                ids.filter(
                  (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id),
                ),
              ),
            ];
      }
    } catch (error) {
      if (error.code !== "ENOENT")
        this.warnings = [
          "Saved settings could not be read. Please choose your photo folder again.",
        ];
    }
  }
  async init() {
    await this.loadSettings();
    return this.refresh();
  }
  applyPreferences(value) {
    if (Number.isFinite(value.folderColumns))
      this.settings.folderColumns = Math.max(
        1,
        Math.min(4, Math.round(value.folderColumns)),
      );
    if (Number.isFinite(value.columns))
      this.settings.columns = Math.max(
        1,
        Math.min(12, Math.round(value.columns)),
      );
    if (Number.isFinite(value.thumbnailSize))
      this.settings.thumbnailSize = Math.max(
        120,
        Math.min(420, Math.round(value.thumbnailSize / 10) * 10),
      );
    if (["1:1", "4:5"].includes(value.ratio)) this.settings.ratio = value.ratio;
    if (["cover", "contain"].includes(value.fit)) this.settings.fit = value.fit;
    if (
      [
        "newest",
        "oldest",
        "name",
        "name-desc",
        "created",
        "created-desc",
      ].includes(value.sort)
    )
      this.settings.sort = value.sort;
    if (typeof value.showNames === "boolean")
      this.settings.showNames = value.showNames;
    if (typeof value.confirmDelete === "boolean")
      this.settings.confirmDelete = value.confirmDelete;
    if (["zoom", "navigate"].includes(value.viewerWheel))
      this.settings.viewerWheel = value.viewerWheel;
    if (["compact", "comfortable"].includes(value.gap))
      this.settings.gap = value.gap;
    if (["manual", "name", "created"].includes(value.tabSort))
      this.settings.tabSort = value.tabSort;
    if (["asc", "desc"].includes(value.tabDirection))
      this.settings.tabDirection = value.tabDirection;
  }
  async save() {
    const content = JSON.stringify(this.settings, null, 2);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const temp = `${this.configPath}.tmp`;
        await fs.writeFile(temp, content, "utf8");
        await fs.rename(temp, this.configPath);
      });
    await this.writeQueue;
  }
  async setPreferences(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid settings.");
    this.applyPreferences(value);
    await this.save();
    return structuredClone(this.settings);
  }
  async setTabOrder(ids) {
    if (
      !Array.isArray(ids) ||
      ids.length > 100000 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid tab order.");
    const available = new Set(this.folders.map((folder) => folder.id));
    const order = [...new Set(ids.filter((id) => available.has(id)))];
    const included = new Set(order);
    for (const folder of this.folders)
      if (!included.has(folder.id)) order.push(folder.id);
    this.settings.tabOrders[this.settings.root] = order;
    this.settings.tabSort = "manual";
    await this.save();
    return structuredClone(this.settings);
  }
  async setRoot(folder) {
    if (this.pendingScan) await this.pendingScan;
    const canonical = await fs.realpath(folder);
    if (!(await fs.stat(canonical)).isDirectory())
      throw new Error("Please choose a folder.");
    // A watcher scan can start while realpath/stat are awaiting filesystem I/O.
    // Let that old-root scan settle before replacing the root/index.
    if (this.pendingScan) await this.pendingScan;
    if (canonical !== this.settings.root) {
      this.files = new Map();
      this.folders = [];
      this.directories = new Map();
      this.hiddenFolders = [];
    }
    this.settings.root = canonical;
    await this.save();
    return this.refresh();
  }
  async closeLibrary() {
    if (this.pendingScan) await this.pendingScan;
    this.settings.root = "";
    this.files = new Map();
    this.folders = [];
    this.directories = new Map();
    this.hiddenFolders = [];
    this.error = "";
    this.warnings = [];
    this.scanProgress = { done: 0, total: 0 };
    await this.save();
    return this.snapshot();
  }
  async setTabName(id, value) {
    if (
      typeof value !== "string" ||
      value.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      throw new Error("Use a single-line name of up to 120 characters.");
    if (
      ![...this.folders, ...this.hiddenFolders].some(
        (folder) => folder.id === id,
      )
    )
      throw new Error("This folder is no longer available.");
    const names = { ...this.settings.tabNames[this.settings.root] };
    if (value.trim()) names[id] = value.trim();
    else delete names[id];
    this.settings.tabNames[this.settings.root] = names;
    await this.save();
    return this.snapshot();
  }
  async setLink(folderId, url) {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error("This folder is no longer available.");
    const value = cleanUrl(url);
    if (value) this.settings.links[folder.path] = value;
    else delete this.settings.links[folder.path];
    await this.save();
    return { id: folderId, url: value };
  }
  async setFolderHidden(id, hidden) {
    if (typeof hidden !== "boolean")
      throw new Error("Invalid folder visibility.");
    if (this.pendingScan) await this.pendingScan;
    const folder = [...this.folders, ...this.hiddenFolders].find(
      (item) => item.id === id,
    );
    if (!folder) throw new Error("This folder is no longer available.");
    const excluded = new Set(
      this.settings.hiddenFolders[this.settings.root] || [],
    );
    if (hidden) excluded.add(id);
    else excluded.delete(id);
    this.settings.hiddenFolders[this.settings.root] = [...excluded];
    await this.save();
    return this.refresh([folder.name]);
  }
  snapshot() {
    return {
      settings: structuredClone(this.settings),
      error: this.error,
      warnings: [...this.warnings],
      scanning: this.scanning,
      scanProgress: { ...this.scanProgress },
      directories: [...this.directories.values()],
      folders: this.folders.map(({ path: folderPath, ...rest }) => ({
        ...rest,
        sourceName: rest.name,
        name:
          this.settings.tabNames[this.settings.root]?.[rest.id] || rest.name,
        url: this.settings.links[folderPath] || "",
      })),
      hiddenFolders: this.hiddenFolders.map(
        ({ path: folderPath, ...rest }) => ({
          ...rest,
          sourceName: rest.name,
          name:
            this.settings.tabNames[this.settings.root]?.[rest.id] || rest.name,
        }),
      ),
      images: [...this.files.values()].map(
        ({ filePath, version, ...rest }) => rest,
      ),
    };
  }
  refresh(changes) {
    if (this.pendingScan) {
      if (!changes) this.queuedFull = true;
      else for (const change of changes) this.queuedChanges.add(change);
      return this.pendingScan;
    }
    this.scanning = true;
    this.pendingScan = (async () => {
      let next = changes;
      do {
        this.queuedFull = false;
        this.queuedChanges.clear();
        await this.scan(next);
        next = this.queuedFull ? undefined : [...this.queuedChanges];
      } while (!next || next.length);
      this.scanning = false;
      return this.snapshot();
    })().finally(() => {
      this.scanning = false;
      this.pendingScan = null;
    });
    return this.pendingScan;
  }
  async scan(changes) {
    const started = performance.now();
    let statCalls = 0,
      visitedFolders = 0;
    const root = this.settings.root,
      files = new Map(),
      directories = new Map(),
      folders = [],
      warnings = [];
    const previousFolders = new Set(this.folders.map((folder) => folder.id)),
      previousFiles = new Map();
    const previousDirectories = new Map();
    for (const item of this.directories.values()) {
      if (!previousDirectories.has(item.topId))
        previousDirectories.set(item.topId, []);
      previousDirectories.get(item.topId).push(item);
    }
    for (const item of this.files.values()) {
      if (!previousFiles.has(item.folderId))
        previousFiles.set(item.folderId, []);
      previousFiles.get(item.folderId).push(item);
    }
    const initialScan = this.files.size === 0;
    const dirty = changes
      ? new Set(changes.map((name) => String(name).split(/[\\/]/)[0]))
      : null;
    this.error = "";
    if (!root) {
      this.files = files;
      this.folders = [];
      this.directories = directories;
      this.hiddenFolders = [];
      return;
    }
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries)
        if (entry.isSymbolicLink())
          warnings.push(`Skipped linked path: ${entry.name}`);
      if (
        entries.some(
          (entry) =>
            entry.isFile() &&
            EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
        )
      ) {
        const stat = await fs.stat(root);
        folders.push({
          id: hash(root),
          name: "Root photos",
          path: root,
          created: stat.birthtimeMs,
          count: 0,
        });
      }
      const childEntries = entries
        .filter((e) => e.isDirectory() && !e.isSymbolicLink())
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
      const children = await mapLimit(childEntries, 12, async (entry) => {
        const folderPath = path.join(root, entry.name);
        try {
          const stat = await fs.stat(folderPath);
          return {
            id: hash(folderPath),
            name: entry.name,
            path: folderPath,
            created: stat.birthtimeMs,
            count: 0,
          };
        } catch {
          warnings.push(`Cannot read folder: ${entry.name}`);
          return null;
        }
      });
      folders.push(...children.filter(Boolean));
      const excluded = new Set(this.settings.hiddenFolders[root] || []);
      this.hiddenFolders = folders.filter((folder) => excluded.has(folder.id));
      const visible = folders.filter((folder) => !excluded.has(folder.id));
      folders.splice(0, folders.length, ...visible);
      this.scanProgress = { done: 0, total: folders.length };
      const visit = async (directory, folder, depth = 0, parentId = null) => {
        const directoryId = hash(directory);
        const node = {
          id: directoryId,
          topId: folder.id,
          parentId,
          name: path.basename(directory),
          relativePath: path
            .relative(root, directory)
            .split(path.sep)
            .join("/"),
          count: 0,
          directCount: 0,
        };
        directories.set(directoryId, node);
        let entries;
        try {
          entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
          warnings.push(
            `Cannot read folder: ${path.relative(root, directory) || directory}`,
          );
          return 0;
        }
        const candidates = entries.filter(
          (entry) =>
            entry.isFile() &&
            !entry.isSymbolicLink() &&
            EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
        );
        await mapLimit(candidates, 16, async (entry) => {
          const filePath = path.join(directory, entry.name);
          try {
            statCalls++;
            const stat = await fs.stat(filePath);
            const id = hash(filePath),
              version = hash(`${filePath}|${stat.size}|${stat.mtimeMs}`);
            files.set(id, {
              id,
              filePath,
              version,
              name: entry.name,
              folderId: folder.id,
              directoryId,
              relativePath: path.relative(root, filePath),
              size: stat.size,
              modified: stat.mtimeMs,
              created: stat.birthtimeMs,
              thumbnail: `luma-media://thumb/${id}?v=${version}`,
              source: `luma-media://${needsConversion(filePath) ? "preview" : "full"}/${id}?v=${version}`,
              previewOnly: isRaw(filePath),
              converted: needsConversion(filePath),
              format: path.extname(filePath).slice(1).toUpperCase(),
            });
            folder.count++;
            node.directCount++;
          } catch {
            warnings.push(`Cannot read image: ${entry.name}`);
          }
        });
        node.count = node.directCount;
        if (folder.path !== root)
          for (const entry of entries) {
            if (entry.isSymbolicLink())
              warnings.push(
                `Skipped linked path: ${path.relative(root, path.join(directory, entry.name))}`,
              );
            else if (entry.isDirectory()) {
              if (depth < 64)
                node.count += await visit(
                  path.join(directory, entry.name),
                  folder,
                  depth + 1,
                  directoryId,
                );
              else
                warnings.push(
                  `Folder depth limit reached: ${path.relative(root, path.join(directory, entry.name))}`,
                );
            }
          }
        return node.count;
      };
      let lastPartial = performance.now();
      for (const folder of folders) {
        const needsScan =
          !dirty ||
          !previousFolders.has(folder.id) ||
          dirty.has(folder.name) ||
          (folder.path === root &&
            changes.some((name) => !String(name).match(/[\\/]/)));
        if (needsScan) {
          visitedFolders++;
          await visit(folder.path, folder);
        } else {
          for (const item of previousFiles.get(folder.id) || [])
            files.set(item.id, item);
          folder.count = previousFiles.get(folder.id)?.length || 0;
          for (const node of previousDirectories.get(folder.id) || [])
            directories.set(node.id, node);
        }
        this.scanProgress.done++;
        if (
          initialScan &&
          this.onPartial &&
          performance.now() - lastPartial >= 160
        ) {
          this.files = new Map(files);
          this.folders = folders;
          this.directories = new Map(directories);
          this.warnings = [...warnings];
          this.onPartial(this.snapshot());
          lastPartial = performance.now();
        }
      }
    } catch {
      this.error =
        "Cannot access the photo folder. Check the drive or choose another folder in Settings.";
    }
    this.files = files;
    this.folders = folders;
    this.directories = directories;
    this.warnings = warnings;
    this.lastScan = {
      durationMs: Math.round(performance.now() - started),
      imageStats: statCalls,
      visitedFolders,
      totalFolders: folders.length,
      images: files.size,
      incremental: !!changes,
    };
  }
  async resolveFile(id, checkUnchanged = false) {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
      throw new Error("Invalid image.");
    const item = this.files.get(id);
    if (!item || !inside(this.settings.root, item.filePath))
      throw new Error("This image is not in the current library.");
    const stat = await fs.lstat(item.filePath),
      canonical = await fs.realpath(item.filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      canonical.toLowerCase() !== item.filePath.toLowerCase()
    )
      throw new Error("The image path has changed. Refresh the library.");
    if (
      checkUnchanged &&
      (stat.mtimeMs !== item.modified || stat.size !== item.size)
    )
      throw new Error(
        "This image has changed. Refresh the library before deleting it.",
      );
    return item;
  }
}
module.exports = { Library, EXTENSIONS, inside, cleanUrl, hash, mapLimit };
