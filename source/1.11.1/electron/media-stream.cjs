const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { Readable } = require("node:stream");
const path = require("node:path");
async function mediaStream(request, item) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405 });
  const { size } = await fsp.stat(item.filePath);
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  const headers = {
    "Content-Type":
      types[path.extname(item.filePath).toLowerCase()] ||
      "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  headers["Access-Control-Allow-Origin"] = "*";
  let start = 0,
    end = size - 1,
    status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    )
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(Math.max(0, end - start + 1));
  if (request.method === "HEAD" || !size)
    return new Response(null, { status, headers });
  const stream = fs.createReadStream(item.filePath, {
    start,
    end,
    highWaterMark: 256 * 1024,
  });
  const abort = () => stream.destroy();
  request.signal.addEventListener("abort", abort, { once: true });
  stream.on("close", () => request.signal.removeEventListener("abort", abort));
  if (request.signal.aborted) stream.destroy();
  return new Response(Readable.toWeb(stream), { status, headers });
}
module.exports = { mediaStream };
