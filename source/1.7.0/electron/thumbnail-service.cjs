const fs = require("node:fs/promises");
const path = require("node:path");
const cancelled = () =>
  Object.assign(new Error("Thumbnail request cancelled."), {
    code: "CANCELLED",
  });

class ThumbnailService {
  constructor({ cacheDir, spawnWorker, resolveFile, log = () => {} }) {
    this.cacheDir = cacheDir;
    this.spawnWorker = spawnWorker;
    this.resolveFile = resolveFile;
    this.log = log;
    this.jobs = new Map();
    this.tokens = new Map();
    this.cancelledTokens = new Set();
    this.blocked = new Set();
    this.queue = [];
    this.active = null;
    this.worker = null;
    this.ready = false;
    this.disposed = false;
    this.clearing = false;
    this.workerJobs = 0;
    this.sequence = 0;
    this.idleTimer = null;
    this.watchdog = null;
    this.obsoleteTimer = null;
    this.stats = {
      requested: 0,
      completed: 0,
      cancelled: 0,
      crashes: 0,
      restarts: 0,
      peakQueued: 0,
      peakWorkerRss: 0,
    };
  }
  request(item, token, edge = 320) {
    if (this.disposed || this.clearing) return Promise.reject(cancelled());
    if (this.cancelledTokens.delete(token)) return Promise.reject(cancelled());
    if (this.blocked.has(item.version))
      return Promise.reject(
        new Error(
          "This image preview was skipped after a decoder failure. The original can still be opened.",
        ),
      );
    this.stats.requested++;
    const key = `${item.version}-${edge}`;
    let job = this.jobs.get(key);
    if (!job) {
      job = {
        key,
        item,
        edge,
        state: "checking",
        subscribers: new Map(),
        destination: path.join(this.cacheDir, `${key}.webp`),
      };
      this.jobs.set(key, job);
    }
    const promise = new Promise((resolve, reject) => {
      job.subscribers.set(token, { resolve, reject });
      this.tokens.set(token, job);
    });
    if (!job.checkStarted) {
      job.checkStarted = true;
      this.checkCache(job);
    }
    return promise;
  }
  async checkCache(job) {
    try {
      const data = await fs.readFile(job.destination);
      if (this.jobs.get(job.key) === job) this.finish(job, null, data);
      return;
    } catch {}
    if (this.jobs.get(job.key) !== job) return;
    if (!job.subscribers.size || this.disposed) {
      this.jobs.delete(job.key);
      return;
    }
    if (this.queue.length >= 32) {
      this.finish(job, new Error("Thumbnail queue is busy."));
      return;
    }
    job.state = "queued";
    this.queue.push(job);
    this.stats.peakQueued = Math.max(this.stats.peakQueued, this.queue.length);
    this.pump();
  }
  cancel(token) {
    const job = this.tokens.get(token);
    if (!job) {
      this.cancelledTokens.add(token);
      if (this.cancelledTokens.size > 512)
        this.cancelledTokens.delete(this.cancelledTokens.values().next().value);
      return;
    }
    const subscriber = job.subscribers.get(token);
    job.subscribers.delete(token);
    this.tokens.delete(token);
    subscriber?.reject(cancelled());
    this.stats.cancelled++;
    if (!job.subscribers.size) {
      if (job === this.active) {
        clearTimeout(this.obsoleteTimer);
        this.obsoleteTimer = setTimeout(() => {
          if (this.active === job && !job.subscribers.size)
            this.stopWorker("obsolete");
        }, 180);
      } else {
        this.queue = this.queue.filter((item) => item !== job);
        this.jobs.delete(job.key);
      }
    }
  }
  finish(job, error, data) {
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    for (const [token, subscriber] of job.subscribers) {
      this.tokens.delete(token);
      if (error) subscriber.reject(error);
      else subscriber.resolve({ data, type: "image/webp" });
    }
    job.subscribers.clear();
    if (!error) this.stats.completed++;
  }
  pump() {
    if (this.disposed || this.clearing || this.active) return;
    let job;
    while (this.queue.length) {
      const next = this.queue.shift();
      if (next.subscribers.size) {
        job = next;
        break;
      }
      this.jobs.delete(next.key);
    }
    if (!job) {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.stopWorker("idle"), 12000);
      this.idleTimer.unref?.();
      return;
    }
    clearTimeout(this.idleTimer);
    this.active = job;
    job.state = "active";
    job.id = ++this.sequence;
    this.watchdog = setTimeout(() => this.stopWorker("timeout"), 12000);
    if (!this.worker) this.startWorker();
    else if (this.ready) this.dispatch(job);
  }
  startWorker() {
    let child;
    try {
      child = this.spawnWorker();
    } catch (error) {
      const job = this.active;
      this.active = null;
      clearTimeout(this.watchdog);
      if (job) this.finish(job, error);
      setImmediate(() => this.pump());
      return;
    }
    this.worker = child;
    this.ready = false;
    this.workerJobs = 0;
    this.stats.restarts++;
    child.on("message", (message) => {
      if (this.worker !== child) return;
      if (message.kind === "ready") {
        this.ready = true;
        if (this.active) this.dispatch(this.active);
        return;
      }
      if (message.kind === "memory-limit") {
        this.stopWorker("memory-limit");
        return;
      }
      if (message.kind === "result" && this.active?.id === message.id)
        this.complete(message, child);
    });
    child.on("exit", (code) => {
      if (this.worker !== child) return;
      this.worker = null;
      this.ready = false;
      clearTimeout(this.watchdog);
      clearTimeout(this.obsoleteTimer);
      const job = this.active;
      this.active = null;
      if (job) {
        this.blocked.add(job.item.version);
        this.finish(
          job,
          new Error(
            "Image decoder stopped. This preview was skipped; the library is still available.",
          ),
        );
        this.stats.crashes++;
      }
      this.log("thumbnail-worker-exit", { code, image: job?.item.version });
      setImmediate(() => this.pump());
    });
    child.on("error", () => this.stopWorker("worker-error"));
  }
  async dispatch(job) {
    if (job.dispatched) return;
    job.dispatched = true;
    try {
      await this.resolveFile(job.item.id);
      if (this.active !== job || !this.worker) return;
      if (!job.subscribers.size) {
        this.active = null;
        clearTimeout(this.watchdog);
        this.finish(job, cancelled());
        this.pump();
        return;
      }
      job.temp = `${job.destination}.tmp-${this.worker.pid || "worker"}-${job.id}`;
      this.worker.postMessage({
        kind: "decode",
        id: job.id,
        file: job.item.filePath,
        edge: job.edge,
        destination: job.destination,
        temp: job.temp,
      });
    } catch (error) {
      if (this.active === job) {
        this.active = null;
        clearTimeout(this.watchdog);
        this.finish(job, error);
        this.pump();
      }
    }
  }
  async complete(message, child) {
    const job = this.active;
    clearTimeout(this.watchdog);
    clearTimeout(this.obsoleteTimer);
    this.workerJobs++;
    this.stats.peakWorkerRss = Math.max(
      this.stats.peakWorkerRss,
      message.rss || 0,
    );
    try {
      if (!message.ok)
        throw new Error(message.error || "Image preview unavailable.");
      const data = job.subscribers.size
        ? await fs.readFile(job.destination)
        : null;
      this.finish(job, null, data);
    } catch (error) {
      this.blocked.add(job.item.version);
      this.finish(job, error);
    }
    if (this.active === job) this.active = null;
    if (
      this.worker === child &&
      (this.workerJobs >= 120 || message.rss > 256 * 1024 * 1024)
    )
      this.stopWorker("recycle");
    this.pump();
  }
  stopWorker(reason) {
    clearTimeout(this.watchdog);
    clearTimeout(this.obsoleteTimer);
    clearTimeout(this.idleTimer);
    const child = this.worker,
      job = this.active;
    this.worker = null;
    this.ready = false;
    this.active = null;
    if (job) {
      const expected = ["obsolete", "shutdown", "clear"].includes(reason);
      if (!expected) this.blocked.add(job.item.version);
      this.finish(
        job,
        expected
          ? cancelled()
          : new Error(
              "This image preview was skipped to keep the library responsive.",
            ),
      );
    }
    if (child) {
      child.kill();
      if (
        !["idle", "obsolete", "shutdown", "clear", "recycle"].includes(reason)
      ) {
        this.stats.crashes++;
        this.log("thumbnail-worker-stopped", {
          reason,
          image: job?.item.version,
        });
      }
    }
    if (!this.disposed && !this.clearing) setImmediate(() => this.pump());
  }
  async clear() {
    this.clearing = true;
    this.stopWorker("clear");
    for (const job of this.jobs.values()) this.finish(job, cancelled());
    this.queue = [];
    this.clearing = false;
  }
  dispose() {
    this.disposed = true;
    this.stopWorker("shutdown");
    for (const job of this.jobs.values()) this.finish(job, cancelled());
    this.queue = [];
  }
  async waitForImage(id) {
    while (this.active?.item.id === id)
      await new Promise((resolve) => setTimeout(resolve, 25));
  }
  snapshot() {
    return {
      ...this.stats,
      queued: this.queue.length,
      active: this.active ? 1 : 0,
      pendingTokens: this.tokens.size,
      workerPid: this.worker?.pid || null,
    };
  }
}
module.exports = { ThumbnailService };
