'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('desktop', {
  loadData: () => ipcRenderer.invoke('store:load'),
  saveData: (data) => ipcRenderer.invoke('store:save', data),
  appInfo: () => ipcRenderer.invoke('app:info'),
  rendererReady: () => ipcRenderer.send('app:renderer-ready'),
  onNavigate: (callback) => subscribe('app:navigate', callback),
  onHidden: (callback) => subscribe('app:hidden', callback),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  setWindowMaterial: (material) => ipcRenderer.invoke('window:set-material', material),
  quitApp: () => ipcRenderer.send('app:quit'),

  config: {
    exportFile: (data) => ipcRenderer.invoke('config:export', data),
    importFile: () => ipcRenderer.invoke('config:import'),
  },

  widgets: {
    list: () => ipcRenderer.invoke('widgets:list'),
    add: (type) => ipcRenderer.invoke('widgets:add', type),
    remove: (id) => ipcRenderer.invoke('widgets:remove', id),
    importConfigs: (configs) => ipcRenderer.invoke('widgets:import', configs),
    onChange: (callback) => subscribe('widgets:changed', callback),
  },

  reminders: {
    sync: (list) => ipcRenderer.invoke('reminders:sync', list),
    onFire: (callback) => subscribe('reminder:fire', callback),
  },

  holidays: {
    importFile: () => ipcRenderer.invoke('holiday:import'),
  },

  ics: {
    importFile: () => ipcRenderer.invoke('ics:import'),
    exportFile: (payload) => ipcRenderer.invoke('ics:export', payload),
  },

  view: {
    capture: (rect) => ipcRenderer.invoke('view:capture', rect),
  },

  tray: {
    showPreview: () => ipcRenderer.invoke('tray:preview'),
  },

  widget: {
    setPin: (pin) => ipcRenderer.send('widget:set-pin', pin),
    setSize: (width, height) => ipcRenderer.invoke('widget:set-size', { width, height }),
    setAppearance: (appearance) =>
      ipcRenderer.invoke('widget:set-appearance', appearance),
    setLock: (locked) => ipcRenderer.invoke('widget:set-lock', locked),
    close: () => ipcRenderer.send('widget:close'),
    openMain: (payload) => ipcRenderer.send('widget:open-main', payload),
    onStoreChanged: (callback) => subscribe('store:changed', callback),
    onPinChanged: (callback) => subscribe('widget:pin-changed', callback),
    onLockChanged: (callback) => subscribe('widget:lock-changed', callback),
    onAppearanceChanged: (callback) =>
      subscribe('widget:appearance-changed', callback),
  },
});
