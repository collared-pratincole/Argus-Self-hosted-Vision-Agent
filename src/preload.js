// src/preload.js — 通过 contextBridge 向渲染进程暴露安全的 IPC API
// 渲染进程没有 Node 能力（contextIsolation: true, nodeIntegration: false）。
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('visionAPI', {
  // 配置：返回 { api_base, model, has_api_key }（密钥永不回传渲染进程）
  getConfig: () => ipcRenderer.invoke('config:get'),

  // 保存配置：仅当 api_key 非空时才更新密钥
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  // 单图识别：{ filePath?, imageUrl?, prompt? } -> { result } | { error }
  recognizeSingle: (payload) => ipcRenderer.invoke('recognize:single', payload),

  // 批量识别：{ filePaths, prompt, concurrency }
  // onProgress({ index, done, total, name, result?, error? }) 每完成一项触发一次
  recognizeBatch: (payload, onProgress) => {
    const handler = (event, p) => { if (onProgress) onProgress(p); };
    ipcRenderer.on('batch:progress', handler);
    return ipcRenderer.invoke('recognize:batch', payload)
      .finally(() => ipcRenderer.removeListener('batch:progress', handler));
  },

  // 从渲染进程的 File 对象取磁盘绝对路径（Electron 30+ 用 webUtils，旧版回退 file.path）
  getPathForFile: (file) => {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      try { return webUtils.getPathForFile(file); } catch (_) { /* fallthrough */ }
    }
    return (file && file.path) || '';
  },
});
