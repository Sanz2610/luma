import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortedFolders,
  moveFolder,
  gridGeometry,
  gridSelection,
  fitGeometry,
  clampPan,
  tabLayout,
  offsetIndex,
} from "../src/layout.mjs";

test("marquee hits virtual rows, ignores gaps and clamps partial last rows", () => {
  const layout = gridGeometry(409, 4, 3, "1:1");
  assert.deepEqual(
    gridSelection(layout, 10, { x: 10, y: 10, width: 150, height: 150 }),
    [0, 1, 4, 5],
  );
  assert.deepEqual(
    gridSelection(layout, 10, { x: 160, y: 160, width: -150, height: -150 }),
    [0, 1, 4, 5],
  );
  assert.deepEqual(
    gridSelection(layout, 10, { x: 100.5, y: 0, width: 2, height: 100 }),
    [],
  );
  assert.deepEqual(
    gridSelection(layout, 10, { x: -30, y: 205, width: 500, height: 300 }),
    [8, 9],
  );
  assert.deepEqual(
    gridSelection(layout, 4800, { x: 0, y: 10300, width: 409, height: 100 }),
    [400, 401, 402, 403],
  );
});
test("selected column count fills the full grid width in both ratios", () => {
  for (const width of [390, 1280, 1920])
    for (let count = 1; count <= 12; count++) {
      const square = gridGeometry(width, count, 3, "1:1"),
        portrait = gridGeometry(width, count, 3, "4:5");
      assert.equal(square.columns, count);
      assert.ok(Math.abs(square.contentWidth - width) < 0.001);
      assert.equal(portrait.height, portrait.cell * 1.25);
      if (count < 12)
        assert.ok(gridGeometry(width, count + 1, 3, "1:1").cell < square.cell);
    }
});
test("Fit stays within both viewport dimensions for portrait, landscape, large and small images", () => {
  for (const [w, h] of [
    [4200, 1400],
    [1400, 4200],
    [2500, 1786],
    [120, 80],
  ])
    for (const [vw, vh] of [
      [1920, 1080],
      [960, 600],
      [390, 844],
    ]) {
      const result = fitGeometry(vw, vh, w, h);
      assert.ok(result.width <= vw + 0.001 && result.height <= vh + 0.001);
      assert.ok(
        Math.abs(result.width - vw) < 0.001 ||
          Math.abs(result.height - vh) < 0.001,
      );
      assert.ok(Math.abs(result.width / result.height - w / h) < 0.0001);
      const pan = clampPan({ x: 1000, y: -1000 }, result, {
        width: vw,
        height: vh,
      });
      assert.ok(Math.abs(pan.x) < 0.001 && Math.abs(pan.y) < 0.001);
    }
});
test("folder sorting supports natural names, creation times, directions and manual IDs", () => {
  const folders = [
    { id: "a", name: "Folder 2", created: 30 },
    { id: "b", name: "Folder 10", created: 10 },
    { id: "c", name: "Folder 1", created: 20 },
  ];
  const ids = (settings) =>
    sortedFolders(folders, { root: "root", ...settings }).map((f) => f.id);
  assert.deepEqual(ids({ tabSort: "name", tabDirection: "asc" }), [
    "c",
    "a",
    "b",
  ]);
  assert.deepEqual(ids({ tabSort: "name", tabDirection: "desc" }), [
    "b",
    "a",
    "c",
  ]);
  assert.deepEqual(ids({ tabSort: "created", tabDirection: "asc" }), [
    "b",
    "c",
    "a",
  ]);
  assert.deepEqual(ids({ tabSort: "created", tabDirection: "desc" }), [
    "a",
    "c",
    "b",
  ]);
  assert.deepEqual(
    ids({ tabSort: "manual", tabOrders: { root: ["b", "a"] } }),
    ["b", "a", "c"],
  );
  assert.deepEqual(moveFolder(folders, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveFolder(folders, "a", "b", true), ["b", "a", "c"]);
});
test("virtual tab offsets find the last of 240 folders", () => {
  const offsets = tabLayout(
    Array.from({ length: 240 }, (_, i) => ({ name: `Folder ${i + 1}` })),
  );
  assert.equal(offsetIndex(offsets, 0), 0);
  assert.equal(offsetIndex(offsets, offsets[239]), 239);
  assert.ok(offsets.at(-1) > 20000);
});
