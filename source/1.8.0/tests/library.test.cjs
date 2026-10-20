const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Library, inside, cleanUrl } = require("../electron/library.cjs");
const {
  IMAGE_EXTENSIONS,
  needsConversion,
  isRaw,
} = require("../electron/image-formats.cjs");
test("image format registration includes TIFF/HEIC/RAW previews and excludes video", () => {
  for (const extension of [
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".cr2",
    ".nef",
    ".arw",
    ".dng",
  ])
    assert.equal(IMAGE_EXTENSIONS.has(extension), true);
  for (const extension of [".mp4", ".mov", ".webm", ".mkv"])
    assert.equal(IMAGE_EXTENSIONS.has(extension), false);
  assert.equal(needsConversion("IMAGE.TIFF"), true);
  assert.equal(isRaw("IMAGE.NEF"), true);
  assert.equal(needsConversion("image.avif"), false);
});

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "luma-unit-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "Ảnh của tôi");
  await fs.mkdir(root);
  for (const folder of [
    "01 Chân dung",
    "02 Đời thường",
    "03 Du lịch",
    "04 Cảm hứng",
    "05 Yêu thích",
  ])
    await fs.mkdir(path.join(root, folder));
  await fs.writeFile(
    path.join(root, "01 Chân dung", "mùa hè #1 & bạn.JPG"),
    "test-image",
  );
  await fs.writeFile(
    path.join(root, "01 Chân dung", "ignore.txt"),
    "not-image",
  );
  await fs.mkdir(path.join(root, "02 Đời thường", "nested"));
  await fs.writeFile(
    path.join(root, "02 Đời thường", "nested", "photo.webp"),
    "test-image",
  );
  const library = new Library(path.join(base, "profile"));
  await library.init();
  await library.setRoot(root);
  return { base, root, library };
}
test("5 subfolders become tabs, empty folders remain, nested images map to parent tab", async (t) => {
  const { library } = await fixture(t);
  const snapshot = library.snapshot();
  assert.equal(snapshot.folders.length, 5);
  assert.equal(snapshot.images.length, 2);
  assert.deepEqual(
    snapshot.folders.map((f) => f.count),
    [1, 1, 0, 0, 0],
  );
  assert.equal(
    snapshot.images.find((i) => i.name === "photo.webp").folderId,
    snapshot.folders[1].id,
  );
  assert.ok(snapshot.images.every((image) => !image.filePath));
});
test("preferences and independent folder URLs survive restart", async (t) => {
  const { library, base } = await fixture(t);
  const folders = library.snapshot().folders;
  await library.setLink(folders[0].id, "https://example.com/portrait");
  await library.setLink(folders[1].id, "https://example.com/life?q=việt");
  await library.setPreferences({
    thumbnailSize: 310,
    columns: 8,
    folderColumns: 4,
    sort: "name",
    fit: "contain",
    gap: "compact",
    showNames: true,
    root: "not-authorized",
  });
  const restarted = new Library(path.join(base, "profile"));
  await restarted.init();
  assert.equal(restarted.settings.thumbnailSize, 310);
  assert.equal(restarted.settings.columns, 8);
  assert.equal(restarted.settings.folderColumns, 4);
  assert.equal(restarted.settings.fit, "contain");
  assert.equal(restarted.settings.showNames, true);
  assert.notEqual(restarted.settings.root, "not-authorized");
  assert.equal(
    restarted.snapshot().folders[0].url,
    "https://example.com/portrait",
  );
  assert.equal(
    restarted.snapshot().folders[1].url,
    "https://example.com/life?q=vi%E1%BB%87t",
  );
  await restarted.setLink(folders[0].id, "");
  assert.equal(restarted.snapshot().folders[0].url, "");
});
test("nested branches retain paths/counts across incremental scan and root choice; hidden tabs explain empty libraries", async (t) => {
  const { root, library } = await fixture(t);
  const parent = path.join(root, "Only branch"),
    top = path.join(parent, "B");
  await fs.mkdir(path.join(top, "E", "Deep"), { recursive: true });
  await fs.mkdir(path.join(top, "F"), { recursive: true });
  await fs.writeFile(path.join(top, "E", "Deep", "nested.jpg"), "sample");
  await fs.writeFile(path.join(top, "F", "other.png"), "sample");
  await library.setRoot(parent);
  let data = library.snapshot();
  assert.equal(data.folders.length, 1);
  assert.equal(data.images.length, 2);
  const b = data.directories.find((d) => d.relativePath === "B"),
    e = data.directories.find((d) => d.relativePath === "B/E"),
    deep = data.directories.find((d) => d.relativePath === "B/E/Deep");
  assert.equal(b.count, 2);
  assert.equal(b.directCount, 0);
  assert.equal(e.count, 1);
  assert.equal(deep.parentId, e.id);
  assert.equal(e.parentId, b.id);
  assert.equal(
    data.images.find((i) => i.name === "nested.jpg").directoryId,
    deep.id,
  );
  assert.ok(
    data.directories.every((d) => !d.path && !path.isAbsolute(d.relativePath)),
  );
  await fs.writeFile(path.join(top, "E", "Deep", "new.webp"), "sample");
  await library.refresh([path.join("B", "E", "Deep", "new.webp")]);
  data = library.snapshot();
  assert.equal(data.images.length, 3);
  assert.equal(data.directories.find((d) => d.id === b.id).count, 3);
  await library.setFolderHidden(b.id, true);
  data = library.snapshot();
  assert.equal(data.images.length, 0);
  assert.equal(data.directories.length, 0);
  assert.equal(data.hiddenFolders.length, 1);
  await library.setFolderHidden(b.id, false);
  assert.equal(library.snapshot().images.length, 3);
  await library.setRoot(top);
  assert.equal(library.snapshot().images.length, 3);
  assert.equal(library.snapshot().folders.length, 2);
  await library.closeLibrary();
  assert.equal(library.snapshot().directories.length, 0);
});
test("URLs allow only http(s), reject credentials and executable schemes", () => {
  for (const value of [
    "file:///C:/Windows/notepad.exe",
    "javascript:alert(1)",
    "https://u:p@example.com",
    "mailto:hello@example.com",
  ])
    assert.throws(() => cleanUrl(value));
  assert.equal(cleanUrl(" https://example.com "), "https://example.com/");
  assert.equal(cleanUrl("instagram.com"), "https://instagram.com/");
  assert.equal(cleanUrl("www.instagram.com"), "https://www.instagram.com/");
  assert.equal(
    cleanUrl("instagram.com/name?x=1"),
    "https://instagram.com/name?x=1",
  );
  assert.equal(
    cleanUrl("photo inspiration"),
    "https://www.google.com/search?q=photo%20inspiration",
  );
  assert.equal(cleanUrl(""), "");
});
test("file operations reject unknown IDs, path boundaries, stale files and symlinks", async (t) => {
  const { library, base, root } = await fixture(t);
  assert.equal(inside(root, root), false);
  assert.equal(inside(root, `${root}-other${path.sep}file.jpg`), false);
  assert.equal(inside(root, path.join(root, "photo.jpg")), true);
  await assert.rejects(library.resolveFile("../escape"));
  await assert.rejects(library.resolveFile("a".repeat(64)));
  const image = [...library.files.values()][0];
  assert.equal((await library.resolveFile(image.id, true)).id, image.id);
  await fs.writeFile(image.filePath, "changed-image-content");
  await assert.rejects(library.resolveFile(image.id, true), /has changed/);
  const outside = path.join(base, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.jpg"), "outside");
  await fs.symlink(
    outside,
    path.join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await library.refresh();
  assert.equal(
    library.snapshot().images.some((image) => image.name === "secret.jpg"),
    false,
  );
});
test("missing root returns an actionable error; corrupt preferences recover", async (t) => {
  const { library, root, base } = await fixture(t);
  await fs.rename(root, `${root}-moved`);
  const result = await library.refresh();
  assert.match(result.error, /Cannot access/);
  assert.equal(result.images.length, 0);
  await fs.writeFile(
    path.join(base, "profile", "settings.json"),
    "{broken-json",
  );
  const recovered = new Library(path.join(base, "profile"));
  await recovered.init();
  assert.equal(recovered.settings.root, "");
  assert.equal(recovered.snapshot().images.length, 0);
});

test("v1 settings migrate without losing links; manual order and thumbnail ratio survive restart", async (t) => {
  const { library, base } = await fixture(t);
  const original = library.snapshot().folders;
  assert.ok(original.every((folder) => folder.created > 0));
  await library.setLink(original[0].id, "https://example.com/keep-me");
  await library.setPreferences({
    ratio: "4:5",
    thumbnailSize: 240,
    tabSort: "created",
    tabDirection: "desc",
  });
  const order = original.map((f) => f.id).reverse();
  await library.setTabOrder(order);
  const restarted = new Library(path.join(base, "profile"));
  await restarted.init();
  assert.equal(restarted.settings.ratio, "4:5");
  assert.equal(restarted.settings.tabSort, "manual");
  assert.deepEqual(
    restarted.settings.tabOrders[restarted.settings.root],
    order,
  );
  assert.equal(
    restarted.snapshot().folders[0].url,
    "https://example.com/keep-me",
  );
});
test("watcher updates scan only the changed folder and keep unchanged image records", async (t) => {
  const { library, root } = await fixture(t);
  const unchanged = [...library.files.values()].find(
    (image) => image.name === "photo.webp",
  );
  await fs.writeFile(path.join(root, "01 Chân dung", "new.jpg"), "new-image");
  await library.refresh([path.join("01 Chân dung", "new.jpg")]);
  assert.equal(library.lastScan.visitedFolders, 1);
  assert.equal(library.lastScan.imageStats, 2);
  assert.equal(library.files.get(unchanged.id), unchanged);
  assert.equal(library.snapshot().images.length, 3);
});

test("remove from library is persistent, excludes images and restores without touching files", async (t) => {
  const { library, base, root } = await fixture(t);
  const folder = library.snapshot().folders[0],
    original = path.join(root, folder.name, "mùa hè #1 & bạn.JPG");
  await library.setFolderHidden(folder.id, true);
  assert.equal(library.snapshot().folders.length, 4);
  assert.equal(library.snapshot().hiddenFolders[0].id, folder.id);
  assert.equal(library.snapshot().images.length, 1);
  assert.equal(await fs.readFile(original, "utf8"), "test-image");
  const restarted = new Library(path.join(base, "profile"));
  await restarted.init();
  assert.equal(restarted.snapshot().folders.length, 4);
  await restarted.setFolderHidden(folder.id, false);
  assert.equal(restarted.snapshot().folders.length, 5);
  assert.equal(restarted.snapshot().images.length, 2);
  assert.equal((await fs.stat(original)).isFile(), true);
});

test("custom tab names persist per library while source directories and IDs stay unchanged", async (t) => {
  const { library, root, base } = await fixture(t);
  const original = library.snapshot().folders[0];
  await library.setTabName(original.id, "My reference photos");
  let snapshot = library.snapshot();
  assert.equal(snapshot.folders[0].name, "My reference photos");
  assert.equal(snapshot.folders[0].sourceName, original.name);
  assert.equal(snapshot.folders[0].id, original.id);
  assert.ok((await fs.stat(path.join(root, original.name))).isDirectory());
  await assert.rejects(fs.access(path.join(root, "My reference photos")));
  const restarted = new Library(path.join(base, "profile"));
  await restarted.init();
  assert.equal(restarted.snapshot().folders[0].name, "My reference photos");
  await restarted.setFolderHidden(original.id, true);
  assert.equal(
    restarted.snapshot().hiddenFolders[0].name,
    "My reference photos",
  );
  await restarted.setFolderHidden(original.id, false);
  await restarted.setTabName(original.id, "");
  assert.equal(restarted.snapshot().folders[0].name, original.name);
  await assert.rejects(
    restarted.setTabName(original.id, "bad\nname"),
    /single-line/,
  );
});
test("closing a library returns Home, clears indexed images and leaves all originals on disk", async (t) => {
  const { library, root, base } = await fixture(t);
  const folder = library.snapshot().folders[0];
  await library.setTabName(folder.id, "Alias to keep");
  const snapshot = await library.closeLibrary();
  assert.equal(snapshot.settings.root, "");
  assert.equal(snapshot.images.length, 0);
  assert.equal(snapshot.folders.length, 0);
  assert.equal(library.files.size, 0);
  assert.ok((await fs.stat(root)).isDirectory());
  const restarted = new Library(path.join(base, "profile"));
  await restarted.init();
  assert.equal(restarted.settings.root, "");
  await restarted.setRoot(root);
  assert.equal(restarted.snapshot().images.length, 2);
  assert.equal(restarted.snapshot().folders[0].name, "Alias to keep");
});
