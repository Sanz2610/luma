const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { EventEmitter } = require("node:events");
const { ThumbnailService } = require("../electron/thumbnail-service.cjs");
async function setup(t) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-thumbnails-"));
  const workers = [];
  const service = new ThumbnailService({
    cacheDir,
    resolveFile: async () => {},
    spawnWorker() {
      const child = new EventEmitter();
      child.pid = workers.length + 1;
      child.alive = true;
      child.postMessage = (job) => {
        assert.equal(child.busy, undefined, "Only one decode may run");
        child.busy = job;
        child.timer = setTimeout(async () => {
          if (!child.alive) return;
          await fs.writeFile(job.destination, "webp-fixture");
          child.busy = undefined;
          child.emit("message", {
            kind: "result",
            id: job.id,
            ok: true,
            rss: 40 * 1024 * 1024,
          });
        }, 15);
      };
      child.kill = () => {
        child.alive = false;
        clearTimeout(child.timer);
        setImmediate(() => child.emit("exit", 0));
        return true;
      };
      workers.push(child);
      setImmediate(() => child.emit("message", { kind: "ready" }));
      return child;
    },
  });
  t.after(async () => {
    service.dispose();
    await fs.rm(cacheDir, { recursive: true, force: true });
  });
  return { service, workers };
}
const item = (n) => ({
  id: String(n),
  version: String(n).padStart(64, "0"),
  filePath: `input-${n}.jpg`,
});
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Condition timed out");
}
test("rapid cancellation drops obsolete work without retaining pending tokens", async (t) => {
  const { service } = await setup(t);
  const promises = [];
  for (let i = 0; i < 24; i++) {
    const token = `request-${i}`;
    const promise = service.request(item(i), token, 320);
    promises.push(assert.rejects(promise, /cancelled/));
    service.cancel(token);
  }
  await Promise.all(promises);
  await waitFor(() => service.snapshot().pendingTokens === 0);
  const result = await service.request(item(25), "current", 320);
  assert.equal(result.data.toString(), "webp-fixture");
  assert.equal(service.snapshot().pendingTokens, 0);
  assert.ok(service.snapshot().active <= 1);
});
test("a decoder exit rejects only its image, starts another worker and keeps service alive", async (t) => {
  const { service, workers } = await setup(t);
  const first = service.request(item(1), "first", 320),
    rejection = assert.rejects(first, /decoder stopped/);
  await waitFor(() => workers[0]?.busy);
  workers[0].alive = false;
  clearTimeout(workers[0].timer);
  workers[0].emit("exit", 99);
  await rejection;
  const result = await service.request(item(2), "second", 320);
  assert.equal(result.data.toString(), "webp-fixture");
  assert.equal(service.snapshot().crashes, 1);
  assert.equal(workers.length, 2);
  assert.equal(service.snapshot().pendingTokens, 0);
  await assert.rejects(service.request(item(1), "retry-bad", 320), /skipped/);
});
test("cancel before registration and shared subscribers keep needed previews alive", async (t) => {
  const { service } = await setup(t);
  service.cancel("early");
  await assert.rejects(service.request(item(1), "early", 320), /cancelled/);
  const a = service.request(item(2), "a", 320),
    b = service.request(item(2), "b", 320),
    rejection = assert.rejects(a, /cancelled/);
  service.cancel("a");
  await rejection;
  assert.equal((await b).data.toString(), "webp-fixture");
  assert.equal(service.snapshot().pendingTokens, 0);
});
