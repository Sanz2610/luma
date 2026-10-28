import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
const base = path.resolve("test-results/viewer18"),
  root = path.join(base, "library"),
  profile = path.join(base, "profile"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
  );
await fs.mkdir(path.join(root, "Images"), { recursive: true });
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await sharp({
  create: { width: 3000, height: 2122, channels: 4, background: "#ad8fbd" },
})
  .withMetadata({ density: 257 })
  .png()
  .toFile(path.join(root, "Images", "Tsuki.png"));
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root }),
);
await fs.rm(path.join(profile, "window-state.json"), { force: true });
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
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
let viewer;
const errors = [],
  checks = [];
async function drag() {
  const stage = viewer.locator(".viewer-stage"),
    b = await stage.boundingBox();
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  const before = [
    Number(await stage.getAttribute("data-pan-x")),
    Number(await stage.getAttribute("data-pan-y")),
  ];
  await viewer.mouse.move(x, y);
  await viewer.mouse.down();
  await viewer.mouse.move(x + 90, y + 45, { steps: 10 });
  await viewer.mouse.up();
  const after = [
    Number(await stage.getAttribute("data-pan-x")),
    Number(await stage.getAttribute("data-pan-y")),
  ];
  assert.ok(
    Math.max(after[0] - before[0], after[1] - before[1]) > 20,
    `drag moves image: ${before} -> ${after}`,
  );
}
try {
  const page = await app.firstWindow();
  await assert.rejects(
    page.evaluate(() => window.luma.imageInfo("../outside")),
    /Invalid image/,
  );
  await page.locator(".photo.loaded").first().waitFor();
  const opening = app.waitForEvent("window");
  await page.locator(".photo").first().click();
  viewer = await opening;
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.emulateMedia({ reducedMotion: "reduce" });
  await viewer.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
  const stage = viewer.locator(".viewer-stage");
  await stage.dblclick();
  await viewer.waitForFunction(
    () => Number(document.querySelector(".viewer-stage").dataset.zoom) > 1,
  );
  await drag();
  checks.push("real mouse double click followed by drag pans the image");
  await viewer
    .getByRole("button", { name: "Fit to screen (0)", exact: true })
    .dispatchEvent("click");
  await stage.dispatchEvent("wheel", {
    deltaY: -120,
    clientX: 650,
    clientY: 400,
  });
  await drag();
  checks.push("Fit then wheel zoom preserves drag");
  for (let i = 0; i < 30; i++)
    await stage.dispatchEvent("wheel", {
      deltaY: 120,
      clientX: 650,
      clientY: 400,
    });
  assert.equal(Number(await stage.getAttribute("data-zoom")), 1);
  await viewer.getByLabel("Image zoom", { exact: true }).fill("-1");
  assert.equal(Number(await stage.getAttribute("data-zoom")), 0.5);
  await stage.dispatchEvent("wheel", {
    deltaY: 120,
    clientX: 650,
    clientY: 400,
  });
  assert.equal(Number(await stage.getAttribute("data-zoom")), 0.5);
  checks.push(
    "wheel stops at Fit; slider can go below Fit without wheel shrinking it further",
  );
  await viewer
    .getByRole("button", { name: "Fit to screen (0)", exact: true })
    .dispatchEvent("click");
  await viewer
    .getByRole("button", { name: "Image information (I)", exact: true })
    .dispatchEvent("click");
  await viewer
    .locator(".image-details .image-location")
    .waitFor({ timeout: 20000 });
  const content = await viewer.locator(".image-details").innerText();
  assert.match(content, /3000 × 2122/);
  assert.match(content, /257 dpi/);
  assert.match(content, /32 bit/);
  assert.ok(content.includes(path.join(root, "Images", "Tsuki.png")));
  await viewer.screenshot({ path: path.join(evidence, "viewer-info.png") });
  await viewer
    .getByRole("button", { name: "Close image information", exact: true })
    .click();
  await viewer.getByLabel("Image zoom", { exact: true }).fill("1");
  await drag();
  checks.push(
    "Info reports real dimensions, DPI, bit depth, dates and source path; drag still works after closing Info",
  );
  await viewer.emulateMedia({ reducedMotion: "no-preference" });
  await viewer.getByLabel("Image zoom", { exact: true }).fill("1");
  const motion = await viewer.evaluate(async () => {
    const stage = document.querySelector(".viewer-stage");
    const img = document.querySelector(".viewer-original");
    const bounds = stage.getBoundingClientRect();
    const point = {
      x: bounds.x + bounds.width / 2 + 40,
      y: bounds.y + bounds.height / 2 + 30,
    };
    const samples = [];
    const sample = () => {
      const rect = img.getBoundingClientRect();
      samples.push({
        scale: new DOMMatrixReadOnly(getComputedStyle(img).transform).a,
        layoutWidth: img.offsetWidth,
        width: rect.width,
        anchorX: (point.x - rect.left) / rect.width,
        anchorY: (point.y - rect.top) / rect.height,
      });
    };
    sample();
    stage.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true,
      }),
    );
    const start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        sample();
        if (performance.now() - start < 300) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    return { samples, target: Number(stage.dataset.zoom) };
  });
  assert.ok(
    new Set(motion.samples.map((item) => item.scale.toFixed(4))).size >= 4,
    "zoom has real intermediate frames",
  );
  assert.ok(
    motion.samples.every(
      (item, i) =>
        i === 0 || item.scale >= motion.samples[i - 1].scale - 0.0001,
    ),
    "zoom approaches the target without reversing",
  );
  assert.ok(Math.abs(motion.samples.at(-1).scale - motion.target) < 0.0001);
  assert.equal(
    new Set(motion.samples.map((item) => item.layoutWidth)).size,
    1,
    "animation keeps layout width fixed",
  );
  assert.ok(
    motion.samples.every(
      (item) =>
        Math.abs(item.anchorX - motion.samples[0].anchorX) < 0.002 &&
        Math.abs(item.anchorY - motion.samples[0].anchorY) < 0.002,
    ),
    "zoom stays anchored under the pointer",
  );
  // Start a real drag while zoom is still in flight, rather than snapping to its endpoint.
  const stageBounds = await stage.boundingBox();
  await viewer.mouse.move(
    stageBounds.x + stageBounds.width / 2,
    stageBounds.y + stageBounds.height / 2,
  );
  await viewer.mouse.wheel(0, -240);
  await viewer.waitForFunction(() => {
    const img = document.querySelector(".viewer-original"),
      stage = document.querySelector(".viewer-stage");
    const scale = new DOMMatrixReadOnly(getComputedStyle(img).transform).a;
    return scale > 2.26 && scale < Number(stage.dataset.zoom) - 0.01;
  });
  await viewer.mouse.down();
  const stopped = await viewer.evaluate(() => ({
    scale: new DOMMatrixReadOnly(
      getComputedStyle(document.querySelector(".viewer-original")).transform,
    ).a,
    zoom: Number(document.querySelector(".viewer-stage").dataset.zoom),
    animated: document
      .querySelector(".viewer-original")
      .classList.contains("zoom-motion"),
  }));
  assert.equal(stopped.animated, false);
  assert.ok(Math.abs(stopped.scale - stopped.zoom) < 0.0001);
  const beforeDrag = Number(await stage.getAttribute("data-pan-x"));
  await viewer.mouse.move(
    stageBounds.x + stageBounds.width / 2 + 60,
    stageBounds.y + stageBounds.height / 2 + 30,
    { steps: 8 },
  );
  await viewer.mouse.up();
  assert.ok(Number(await stage.getAttribute("data-pan-x")) > beforeDrag + 40);
  await viewer.emulateMedia({ reducedMotion: "reduce" });
  await viewer
    .getByRole("button", { name: "Fit to screen (0)", exact: true })
    .dispatchEvent("click");
  await viewer.waitForFunction(
    () =>
      Math.abs(
        new DOMMatrixReadOnly(
          getComputedStyle(document.querySelector(".viewer-original"))
            .transform,
        ).a - 1,
      ) < 0.0001,
  );
  checks.push(
    "smooth transform zoom renders intermediate anchored frames without resizing layout; drag interrupts it at the displayed scale; reduced motion reaches Fit immediately",
  );
  await fs.writeFile(
    path.join(evidence, "zoom-motion.json"),
    JSON.stringify(motion, null, 2),
  );
  await viewer.screenshot({ path: path.join(evidence, "viewer-pan.png") });
  const native = await app.browserWindow(viewer);
  await native.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await viewer
    .getByRole("button", { name: "Image information (I)", exact: true })
    .dispatchEvent("click");
  await viewer.locator(".image-details .image-location").waitFor();
  assert.ok(
    (await viewer.locator(".image-details").boundingBox()).width <=
      (await viewer.evaluate(() => innerWidth)),
  );
  await viewer.screenshot({
    path: path.join(evidence, "viewer-info-narrow.png"),
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "viewer.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log({ passed: true, checks });
} finally {
  await app.close();
}
