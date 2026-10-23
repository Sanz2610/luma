const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WindowStates } = require("../electron/window-state.cjs");
const { sendToWindow } = require("../electron/window-message.cjs");
const { EventEmitter } = require("node:events");
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const screen = {
  getPrimaryDisplay: () => ({ workArea: area }),
  getDisplayMatching: () => ({ workArea: area }),
};
test("Window preferences recover safely from corruption and disconnected displays", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luma-windows-"));
  try {
    const file = path.join(dir, "window-state.json");
    fs.writeFileSync(file, "{broken");
    const fresh = new WindowStates(dir, screen);
    assert.equal(fresh.options("library").width, 1420);
    assert.equal(fresh.states.library.maximized, true);
    fs.writeFileSync(
      file,
      JSON.stringify({
        library: {
          maximized: false,
          fullscreen: false,
          bounds: { x: -5000, y: 4000, width: 2500, height: 1400 },
        },
        viewer: {
          maximized: false,
          fullscreen: true,
          bounds: { x: 12, y: 20, width: -10, height: 600 },
        },
      }),
    );
    const restored = new WindowStates(dir, screen);
    assert.deepEqual(restored.options("library"), {
      ...area,
      minWidth: 780,
      minHeight: 580,
    });
    assert.equal(restored.states.library.maximized, false);
    assert.equal(restored.states.viewer.fullscreen, true);
    assert.equal(restored.options("viewer").width, 1180);
    restored.flush();
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(persisted.viewer.fullscreen, true);
    assert.equal(persisted.library.fullscreen, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("closing with destroyed WebContents saves layout without sending to its renderer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luma-closing-"));
  try {
    const states = new WindowStates(dir, screen);
    const bounds = states.options("library");
    const target = new EventEmitter();
    let destroyed = false,
      sends = 0;
    Object.assign(target, {
      isDestroyed: () => false,
      isMinimized: () => false,
      isMaximized: () => true,
      isFullScreen: () => false,
      getNormalBounds: () => bounds,
      setBounds: () => {},
      maximize: () => {},
      show: () => {},
      webContents: {
        isDestroyed: () => destroyed,
        send: () => {
          if (destroyed) throw new Error("Object has been destroyed");
          sends++;
        },
      },
    });
    states.attach(target, "library");
    target.emit("ready-to-show");
    const before = sends;
    destroyed = true;
    assert.doesNotThrow(() => target.emit("resize"));
    assert.doesNotThrow(() => target.emit("close"));
    assert.equal(sends, before);
    assert.equal(
      JSON.parse(fs.readFileSync(states.file)).library.maximized,
      true,
    );
    assert.equal(sendToWindow(target, "test", {}), false);
    target.webContents.isDestroyed = () => false;
    assert.equal(
      sendToWindow(target, "test", {}),
      false,
      "renderer destroyed during send is also safe",
    );
    states.flush();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
