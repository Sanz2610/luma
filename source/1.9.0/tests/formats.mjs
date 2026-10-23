import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
const base = path.resolve("test-results/formats-v12"),
  root = path.join(base, "library"),
  folder = path.join(root, "Formats"),
  profile = path.join(base, "profile");
await fs.mkdir(folder, { recursive: true });
await fs.mkdir(profile, { recursive: true });
for (const format of ["jpeg", "png", "webp", "gif", "avif"])
  await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#bf7b5d" },
  })
    .toFormat(format)
    .toFile(path.join(folder, `sample.${format === "jpeg" ? "jpg" : format}`));
await sharp({
  create: { width: 640, height: 480, channels: 3, background: "#a18cbb" },
})
  .withMetadata({ density: 300 })
  .tiff()
  .toFile(path.join(folder, "sample.tiff"));
const heicFile = path.resolve("test-results/image-fixtures/example.heic");
if (!(await fs.stat(heicFile).catch(() => null))) {
  const response = await fetch(
    "https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic",
  );
  if (!response.ok)
    throw new Error("Cannot obtain upstream HEIC test fixture.");
  await fs.mkdir(path.dirname(heicFile), { recursive: true });
  await fs.writeFile(heicFile, Buffer.from(await response.arrayBuffer()));
}
await fs.copyFile(heicFile, path.join(folder, "sample.heic"));
// Small synthetic DNG/TIFF container with an ordinary embedded JPEG thumbnail.
const jpeg = await sharp({
  create: { width: 400, height: 300, channels: 3, background: "#8199ba" },
})
  .jpeg()
  .toBuffer();
const header = Buffer.alloc(8 + 2 + 4 * 12 + 4 + 2 + 6 * 12 + 4);
header.write("II");
header.writeUInt16LE(42, 2);
header.writeUInt32LE(8, 4);
function ifd(offset, entries, next = 0) {
  header.writeUInt16LE(entries.length, offset);
  entries.forEach(([tag, type, count, value], i) => {
    const at = offset + 2 + i * 12;
    header.writeUInt16LE(tag, at);
    header.writeUInt16LE(type, at + 2);
    header.writeUInt32LE(count, at + 4);
    header.writeUInt32LE(value, at + 8);
  });
  header.writeUInt32LE(next, offset + 2 + entries.length * 12);
}
const second = 8 + 2 + 4 * 12 + 4;
ifd(
  8,
  [
    [254, 4, 1, 0],
    [256, 4, 1, 4000],
    [257, 4, 1, 3000],
    [50706, 1, 4, 0x401],
  ],
  second,
);
ifd(second, [
  [254, 4, 1, 1],
  [256, 4, 1, 400],
  [257, 4, 1, 300],
  [259, 3, 1, 6],
  [513, 4, 1, header.length],
  [514, 4, 1, jpeg.length],
]);
await fs.writeFile(
  path.join(folder, "sample.dng"),
  Buffer.concat([header, jpeg]),
);
await fs.writeFile(path.join(folder, "bad.heic"), "not an image");
const bmp = Buffer.alloc(78);
bmp.write("BM");
bmp.writeUInt32LE(78, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(4, 18);
bmp.writeInt32LE(2, 22);
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
for (let i = 54; i < 78; i += 3) {
  bmp[i] = 20;
  bmp[i + 1] = 70;
  bmp[i + 2] = 200;
}
await fs.writeFile(path.join(folder, "sample.bmp"), bmp);
const oversized = Buffer.from(bmp.subarray(0, 54));
oversized.writeInt32LE(100000, 18);
oversized.writeInt32LE(100000, 22);
await fs.writeFile(path.join(folder, "oversized.bmp"), oversized);
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root }),
);
const env = {
  ...process.env,
  LUMA_TEST_PROFILE: profile,
  LUMA_TEST_HEADLESS: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  ...(process.env.LUMA_PACKAGED_EXE
    ? {
        executablePath: path.resolve(process.env.LUMA_PACKAGED_EXE),
        args: [`--user-data-dir=${profile}`],
      }
    : { args: ["."] }),
  env,
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(async () => {
    const d = await window.luma.getLibrary();
    return !d.scanning && d.images.length === 11;
  });
  const snapshot = await page.evaluate(() => window.luma.getLibrary());
  const outcomes = [];
  for (const image of snapshot.images) {
    const result = await page.evaluate(
      async (id) =>
        await window.luma.loadThumbnail(id, crypto.randomUUID(), 512),
      image.id,
    );
    if (["oversized.bmp", "bad.heic"].includes(image.name)) {
      assert.ok(result.error);
      outcomes.push({ name: image.name, safelyRejected: true });
    } else {
      assert.ok(result.data?.length > 0, image.name + ": " + result.error);
      const meta = await sharp(result.data).metadata();
      assert.ok(meta.width > 0 && meta.height > 0);
      outcomes.push({
        name: image.name,
        width: meta.width,
        height: meta.height,
      });
      if (["sample.tiff", "sample.heic", "sample.dng"].includes(image.name)) {
        const opening = app.waitForEvent("window");
        await page.evaluate(({ id, ids }) => window.luma.openViewer(id, ids), {
          id: image.id,
          ids: [image.id],
        });
        const viewer = await opening;
        await viewer.waitForFunction(
          () => document.querySelector(".viewer-original")?.naturalWidth > 0,
          {},
          { timeout: 30000 },
        );
        const details = await viewer.evaluate(
          (id) => window.luma.imageInfo(id),
          image.id,
        );
        assert.ok(details.width > 0 && details.height > 0);
        assert.ok(details.filePath.endsWith(image.name));
        if (image.name === "sample.dng")
          assert.equal(details.previewOnly, true);
        await viewer
          .evaluate(() => window.luma.windowAction("close"))
          .catch(() => {});
      }
    }
  }
  const sharpInMain = await app.evaluate(() =>
    global.__lumaDiagnostics.nativeImageLoadedInMain(),
  );
  assert.equal(sharpInMain, false);
  console.log(JSON.stringify({ passed: true, sharpInMain, outcomes }, null, 2));
  await fs.mkdir(
    path.resolve(process.env.LUMA_TEST_EVIDENCE || "test-results/evidence"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(
      path.resolve(process.env.LUMA_TEST_EVIDENCE || "test-results/evidence"),
      "formats.json",
    ),
    JSON.stringify({ passed: true, sharpInMain, outcomes }, null, 2),
  );
} finally {
  await app.close();
}
