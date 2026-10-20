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
const app = await _electron.launch({ args: ["."], env });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(async () => {
    const d = await window.luma.getLibrary();
    return !d.scanning && d.images.length === 7;
  });
  const snapshot = await page.evaluate(() => window.luma.getLibrary());
  const outcomes = [];
  for (const image of snapshot.images) {
    const result = await page.evaluate(
      async (id) =>
        await window.luma.loadThumbnail(id, crypto.randomUUID(), 512),
      image.id,
    );
    if (image.name === "oversized.bmp") {
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
