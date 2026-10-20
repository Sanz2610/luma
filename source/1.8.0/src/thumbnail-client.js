import { api } from "./api";
const queue = [];
let active = 0;
function pump() {
  while (active < 6 && queue.length) {
    const request = queue.shift();
    if (request.cancelled) continue;
    active++;
    request.started = true;
    api
      .loadThumbnail(request.id, request.token, request.edge)
      .then((result) => {
        if (!request.cancelled) request.resolve(result);
      })
      .catch((error) => {
        if (!request.cancelled) request.reject(error);
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}
export function requestThumbnail(id, edge) {
  const request = {
    id,
    edge,
    token: crypto.randomUUID(),
    cancelled: false,
    started: false,
  };
  const promise = new Promise((resolve, reject) => {
    request.resolve = resolve;
    request.reject = reject;
  });
  queue.push(request);
  pump();
  return {
    promise,
    cancel() {
      request.cancelled = true;
      if (request.started) api.cancelThumbnail(request.token);
      else {
        const index = queue.indexOf(request);
        if (index >= 0) queue.splice(index, 1);
      }
    },
  };
}
export const thumbnailEdge = (size, ratio = "1:1") =>
  size * window.devicePixelRatio * (ratio === "4:5" ? 1.25 : 1) <= 192
    ? 192
    : size * window.devicePixelRatio * (ratio === "4:5" ? 1.25 : 1) <= 320
      ? 320
      : size * window.devicePixelRatio * (ratio === "4:5" ? 1.25 : 1) <= 512
        ? 512
        : size * window.devicePixelRatio * (ratio === "4:5" ? 1.25 : 1) <= 1024
          ? 1024
          : 1536;
