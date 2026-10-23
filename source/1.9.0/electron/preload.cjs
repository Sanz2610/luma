const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel, callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("luma", {
  imageInfo: (id) => ipcRenderer.invoke("image:info", id),
  copyDonationAccount: (key) =>
    ipcRenderer.invoke("project:copy-donation", key),
  openProjectLink: (key) => ipcRenderer.invoke("project:open", key),
  updateState: () => ipcRenderer.invoke("updates:get"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  setAutomaticUpdates: (value) =>
    ipcRenderer.invoke("updates:automatic", value),
  openReleases: () => ipcRenderer.invoke("updates:open"),
  onUpdates: (callback) => subscribe("updates:changed", callback),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  closeLibrary: () => ipcRenderer.invoke("library:close"),
  renameTab: (id, name) => ipcRenderer.invoke("folder:rename", id, name),
  loadThumbnail: (id, token, edge) =>
    ipcRenderer.invoke("thumbnail:load", id, token, edge),
  cancelThumbnail: (token) => ipcRenderer.send("thumbnail:cancel", token),
  chooseFolder: () => ipcRenderer.invoke("library:choose"),
  refresh: () => ipcRenderer.invoke("library:refresh"),
  setPreferences: (value) => ipcRenderer.invoke("settings:save", value),
  setTabOrder: (ids) => ipcRenderer.invoke("tabs:order", ids),
  hideFolder: (id, hidden) => ipcRenderer.invoke("folder:hidden", id, hidden),
  openViewer: (id, ids) => ipcRenderer.invoke("viewer:open", id, ids),
  viewerState: () => ipcRenderer.invoke("viewer:get"),
  viewerNavigate: (delta) => ipcRenderer.invoke("viewer:navigate", delta),
  searchLens: (id) => ipcRenderer.invoke("viewer:lens", id),
  onViewer: (callback) => subscribe("viewer:changed", callback),
  onPreferences: (callback) => subscribe("preferences:changed", callback),
  setLink: (id, url) => ipcRenderer.invoke("folder:link", id, url),
  openLink: (id) => ipcRenderer.invoke("folder:open", id),
  reveal: (id) => ipcRenderer.invoke("image:reveal", id),
  trash: (ids) => ipcRenderer.invoke("images:trash", ids),
  cacheInfo: () => ipcRenderer.invoke("cache:info"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),
  windowAction: (action, value) =>
    ipcRenderer.invoke("window:action", action, value),
  windowState: () => ipcRenderer.invoke("window:state"),
  onWindowState: (callback) => subscribe("window:changed", callback),
  onLibrary: (callback) => subscribe("library:changed", callback),
  onProgress: (callback) => subscribe("delete:progress", callback),
  isDesktop: true,
});
