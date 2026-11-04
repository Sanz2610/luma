const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("videoDecoder", {
  onJob: (callback) =>
    ipcRenderer.on("video:decode", (_event, job) => callback(job)),
  result: (result) => ipcRenderer.send("video:result", result),
});
