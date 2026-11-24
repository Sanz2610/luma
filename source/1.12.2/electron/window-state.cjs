const fs = require("node:fs");
const path = require("node:path");
const { sendToWindow } = require("./window-message.cjs");

const defaults = {
  library: { width: 1420, height: 940, minWidth: 780, minHeight: 580 },
  viewer: { width: 1180, height: 840, minWidth: 440, minHeight: 320 },
};
function validBounds(bounds) {
  return (
    bounds &&
    ["x", "y", "width", "height"].every(
      (key) => Number.isInteger(bounds[key]) && Math.abs(bounds[key]) < 100000,
    ) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}
function visibleBounds(bounds, area, minimum) {
  const width = Math.min(area.width, Math.max(minimum.minWidth, bounds.width));
  const height = Math.min(
    area.height,
    Math.max(minimum.minHeight, bounds.height),
  );
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}
class WindowStates {
  constructor(dataDir, screen, log = () => {}) {
    this.file = path.join(dataDir, "window-state.json");
    this.screen = screen;
    this.log = log;
    this.states = {};
    try {
      const data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const key of Object.keys(defaults)) {
        const value = data[key];
        if (
          value &&
          typeof value.maximized === "boolean" &&
          typeof value.fullscreen === "boolean"
        )
          this.states[key] = {
            maximized: value.maximized,
            fullscreen: value.fullscreen,
            ...(validBounds(value.bounds) ? { bounds: value.bounds } : {}),
          };
      }
    } catch {}
  }
  options(key) {
    const minimum = defaults[key];
    const saved = this.states[key] || { maximized: true, fullscreen: false };
    const primary = this.screen.getPrimaryDisplay().workArea;
    const bounds = saved.bounds || {
      x:
        primary.x +
        Math.round(
          (primary.width - Math.min(primary.width, minimum.width)) / 2,
        ),
      y:
        primary.y +
        Math.round(
          (primary.height - Math.min(primary.height, minimum.height)) / 2,
        ),
      width: minimum.width,
      height: minimum.height,
    };
    const area = this.screen.getDisplayMatching(bounds).workArea;
    const fitted = visibleBounds(bounds, area, minimum);
    this.states[key] = { ...saved, bounds: fitted };
    return {
      ...fitted,
      minWidth: Math.min(area.width, minimum.minWidth),
      minHeight: Math.min(area.height, minimum.minHeight),
    };
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(
        this.file + ".tmp",
        JSON.stringify(this.states, null, 2),
      );
      fs.renameSync(this.file + ".tmp", this.file);
    } catch (error) {
      this.log("window-state-save-failed", { message: error.message });
    }
  }
  attach(target, key, headless = false) {
    const initial = { ...this.states[key] };
    let ready = false;
    const notify = () => {
      if (!target.isDestroyed())
        sendToWindow(target, "window:changed", {
          maximized: target.isMaximized(),
          fullscreen: target.isFullScreen(),
        });
    };
    const capture = (immediate = false, publish = true) => {
      if (!ready || target.isDestroyed()) return;
      if (!target.isMinimized()) {
        const fullscreen = target.isFullScreen();
        const maximized = fullscreen
          ? this.states[key].maximized
          : target.isMaximized();
        const bounds = target.getNormalBounds();
        this.states[key] = {
          maximized,
          fullscreen,
          bounds: validBounds(bounds) ? bounds : this.states[key].bounds,
        };
      }
      clearTimeout(this.timer);
      if (immediate) this.flush();
      else {
        this.timer = setTimeout(() => this.flush(), 200);
        this.timer.unref();
      }
      if (publish) notify();
    };
    target.once("ready-to-show", () => {
      if (target.isDestroyed()) return;
      // Native frame/DPI setup can adjust constructor dimensions on Windows.
      // Reapply the saved outer bounds after the first paint to avoid growth on reopen.
      target.setBounds(initial.bounds);
      if (initial.maximized) target.maximize();
      if (initial.fullscreen) target.setFullScreen(true);
      ready = true;
      if (headless) target.hide();
      else target.show();
      notify();
    });
    for (const event of [
      "maximize",
      "unmaximize",
      "enter-full-screen",
      "leave-full-screen",
      "restore",
    ])
      target.on(event, () => capture(true));
    for (const event of ["move", "resize"]) target.on(event, () => capture());
    target.on("close", () => capture(true, false));
  }
}
module.exports = { WindowStates, visibleBounds };
