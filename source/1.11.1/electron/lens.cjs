const http = require("node:http");
const crypto = require("node:crypto");
class LensSearch {
  constructor(openExternal) {
    this.openExternal = openExternal;
    this.server = null;
    this.timer = null;
  }
  close() {
    clearTimeout(this.timer);
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
  }
  async open(preview) {
    this.close();
    if (!preview?.length || preview.length > 12 * 1024 * 1024)
      throw new Error("This image could not be prepared for Google Lens.");
    const token = crypto.randomBytes(24).toString("hex"),
      nonce = crypto.randomBytes(18).toString("base64");
    const payload = preview.toString("base64");
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Opening Google Lens</title><style>body{background:#15161a;color:#ededf3;font:15px system-ui;padding:48px}button{padding:10px 16px}</style><h1>Opening Google Lens…</h1><p>Sending the selected image preview to Google.</p><form method="post" enctype="multipart/form-data" action="https://lens.google.com/v3/upload?ep=gsbubb&amp;hl=en"><input type="file" name="encoded_image" hidden><button type="submit">Continue to Google Lens</button></form><script nonce="${nonce}">const data=Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([data],'luma-image.webp',{type:'image/webp'}));document.querySelector('input').files=transfer.files;document.querySelector('form').submit();</script></html>`;
    const server = http.createServer((request, response) => {
      if (request.method !== "GET" || request.url !== `/${token}`) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action https://lens.google.com https://www.google.com; base-uri 'none'; frame-ancestors 'none'`,
      });
      response.end(html);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        server.closeAllConnections();
        server.close();
        if (this.server === server) this.server = null;
      }, 3000);
      this.timer.unref();
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    this.server = server;
    this.timer = setTimeout(() => this.close(), 90000);
    this.timer.unref();
    const url = `http://127.0.0.1:${server.address().port}/${token}`;
    try {
      await this.openExternal(url);
    } catch (error) {
      this.close();
      throw error;
    }
  }
}
module.exports = { LensSearch };
