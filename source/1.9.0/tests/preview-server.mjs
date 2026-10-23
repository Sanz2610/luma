// Read-only browser QA adapter. This is never included in the Windows app.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Library } = require("../electron/library.cjs");
const { createFixtures } = await import("./fixtures.mjs");
if (!process.env.LUMA_TEST_LIBRARY)
  await createFixtures(path.resolve("test-results/library"));
const library = new Library(path.resolve("test-results/preview-profile"));
await library.init();
await library.setRoot(
  path.resolve(process.env.LUMA_TEST_LIBRARY || "test-results/library"),
);
const snapshot = library.snapshot();
snapshot.settings.root = "D:\\My gallery";
snapshot.settings.thumbnailSize = 220;
snapshot.folders[1].url = "https://example.com/my-gallery";
snapshot.settings.links = {};
for (const image of snapshot.images) {
  image.thumbnail = `/photo/${image.id}`;
  image.source = `/photo/${image.id}`;
}
const bridge = `const fixture = ${JSON.stringify(snapshot)};
window.luma = {isDesktop:false,getLibrary:async()=>fixture,chooseFolder:async()=>null,refresh:async()=>fixture,setPreferences:async v=>Object.assign(fixture.settings,v),setLink:async(id,url)=>{fixture.folders.find(f=>f.id===id).url=url;return {id,url}},openLink:async()=>{},reveal:async()=>{},trash:async()=>{throw new Error('Read-only QA preview')},cacheInfo:async()=>0,clearCache:async()=>0,windowAction:async()=>({fullscreen:false}),windowState:async()=>({fullscreen:false}),setTabOrder:async ids=>{fixture.settings.tabOrders[fixture.settings.root]=ids;fixture.settings.tabSort='manual';return fixture.settings},onLibrary:()=>()=>{},onProgress:()=>()=>{}};`;
const dist = path.resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname === "/fixture-bridge.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(bridge);
        return;
      }
      if (url.pathname.startsWith("/photo/")) {
        const image = await library.resolveFile(url.pathname.slice(7));
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(await fs.readFile(image.filePath));
        return;
      }
      const file = path.resolve(
        dist,
        `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
      );
      if (!file.startsWith(dist + path.sep)) throw new Error("Invalid path");
      let content = await fs.readFile(file);
      if (file.endsWith("index.html"))
        content = content
          .toString()
          .replace(
            '<div id="root"></div>',
            '<div id="root"></div><script src="/fixture-bridge.js"></script>',
          );
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4599, "127.0.0.1", () =>
    console.log("QA preview: http://127.0.0.1:4599"),
  );
