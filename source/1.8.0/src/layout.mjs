const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function sortedFolders(folders, settings) {
  const result = [...folders];
  if (settings.tabSort === "manual") {
    const order = settings.tabOrders?.[settings.root] || [];
    const positions = new Map(order.map((id, index) => [id, index]));
    result.sort(
      (a, b) =>
        (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) ||
        collator.compare(a.name, b.name),
    );
  } else {
    const direction = settings.tabDirection === "desc" ? -1 : 1;
    result.sort(
      (a, b) =>
        direction *
        ((settings.tabSort === "created"
          ? (a.created || 0) - (b.created || 0)
          : 0) || collator.compare(a.name, b.name)),
    );
  }
  return result;
}
export function moveFolder(folders, dragged, target, after = false) {
  const order = folders
    .map((folder) => folder.id)
    .filter((id) => id !== dragged);
  const index = order.indexOf(target);
  if (index < 0 || dragged === target)
    return folders.map((folder) => folder.id);
  order.splice(index + (after ? 1 : 0), 0, dragged);
  return order;
}
export function gridGeometry(width, count, gap, ratio) {
  const columns = Math.max(1, Math.min(12, Math.round(count)));
  const cell = Math.max(1, (width - (columns - 1) * gap) / columns);
  const height = cell * (ratio === "4:5" ? 1.25 : 1);
  return {
    columns,
    cell,
    height,
    rowHeight: height + gap,
    contentWidth: columns * cell + (columns - 1) * gap,
  };
}
export function fitGeometry(
  width,
  height,
  naturalWidth,
  naturalHeight,
  zoom = 1,
) {
  if (!naturalWidth || !naturalHeight || !width || !height)
    return { width: 0, height: 0, scale: 1, fit: 1 };
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  return {
    width: naturalWidth * fit * zoom,
    height: naturalHeight * fit * zoom,
    scale: fit * zoom,
    fit,
  };
}
export function clampPan(pan, image, viewport) {
  const x = Math.max(0, (image.width - viewport.width) / 2),
    y = Math.max(0, (image.height - viewport.height) / 2);
  return {
    x: Math.max(-x, Math.min(x, pan.x)),
    y: Math.max(-y, Math.min(y, pan.y)),
  };
}
export function tabLayout(folders) {
  const offsets = [0];
  for (const folder of folders)
    offsets.push(
      offsets.at(-1) +
        Math.max(66, Math.min(190, folder.name.length * 6.5 + 39)),
    );
  return offsets;
}
export function offsetIndex(offsets, value) {
  let low = 0,
    high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= value) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(low, offsets.length - 2));
}
