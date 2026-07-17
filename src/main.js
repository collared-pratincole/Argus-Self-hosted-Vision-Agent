// src/main.js — Electron 主进程：窗口、IPC 处理、配置持久化（明文存 config.json）
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execSync } = require('child_process');
const vision = require('./vision');

const DEFAULTS = {
  api_base: process.env.VISION_API_BASE || 'http://localhost:11434/v1',
  api_key: process.env.VISION_API_KEY || 'ollama',
  model: process.env.VISION_MODEL || 'llava',
};

// ── CLI 注册：把 bin\aiir.exe 所在目录加入用户 PATH（仅 Windows，幂等）──────
// 设计说明：
// - NSIS 安装包已把 aiir.exe 放到 $INSTDIR\bin\，但 NSIS 写 PATH 在 electron-builder
//   模板里位置敏感易编译失败，所以改由应用首次启动时用 JS 写注册表
// - 读 HKCU\Environment\PATH，若不含本安装目录的 bin\ 则追加并广播 WM_SETTINGCHANGE
// - 已包含则跳过，保证幂等（重复启动不会产生重复条目）
function ensureCliInPath() {
  if (process.platform !== 'win32') return;
  // app.getAppPath() 在打包后指向 resources/app.asar，其上一层是 resources/
  // aiir.exe 在 $INSTDIR\bin\aiir.exe，即 resources\..\bin\aiir.exe
  // 更稳妥：用 process.execPath 反推安装目录
  // AIIR.exe 在 $INSTDIR\AIIR.exe，bin\aiir.exe 在 $INSTDIR\bin\aiir.exe
  const installDir = path.dirname(process.execPath);
  const binDir = path.join(installDir, 'bin');
  const aiirExe = path.join(binDir, 'aiir.exe');

  // 如果 bin\aiir.exe 不存在（开发模式或未正确安装），跳过
  if (!fsSync.existsSync(aiirExe)) return;

  try {
    // 读取当前用户 PATH（REG_EXPAND_SZ）
    let currentPath = '';
    try {
      const out = execSync(
        `reg query "HKCU\\Environment" /v PATH`,
        { encoding: 'utf8', windowsHide: true }
      );
      const m = out.match(/PATH\s+REG_EXPAND_SZ\s+(.*)/);
      if (m) currentPath = m[1].trim();
      else {
        const m2 = out.match(/PATH\s+REG_SZ\s+(.*)/);
        if (m2) currentPath = m2[1].trim();
      }
    } catch (_) {
      // PATH 不存在（全新用户），currentPath 保持空
    }

    // 检查是否已包含 binDir（大小写不敏感比较，按分号分割）
    const sep = ';';
    const parts = currentPath ? currentPath.split(sep).map(s => s.trim().toLowerCase()) : [];
    if (parts.includes(binDir.toLowerCase())) {
      // 已包含，无需操作
      return;
    }

    // 追加并写回（用 REG_EXPAND_SZ 类型，保留 %XXX% 变量引用）
    const newPath = currentPath
      ? `${currentPath}${currentPath.endsWith(sep) ? '' : sep}${binDir}`
      : binDir;
    execSync(
      `reg add "HKCU\\Environment" /v PATH /t REG_EXPAND_SZ /d "${newPath.replace(/"/g, '\\"')}" /f`,
      { encoding: 'utf8', windowsHide: true }
    );

    // 广播 WM_SETTINGCHANGE，让其他进程感知环境变量变更
    // 用 PowerShell 调用 Win32 API 广播（已打开的终端需重开才能生效）
    execSync(
      `powershell -NoProfile -Command "Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport(\\"user32.dll\\", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);'; $HWND_BROADCAST = [IntPtr]0xffff; $WM_SETTINGCHANGE = 0x1A; $result = [IntPtr]::Zero; [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [IntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null"`,
      { encoding: 'utf8', windowsHide: true }
    );

    console.log(`[AIIR] Added ${binDir} to user PATH. New terminals will have 'aiir' command.`);
  } catch (err) {
    console.warn(`[AIIR] Failed to add ${binDir} to PATH:`, err && err.message ? err.message : err);
  }
}

// 运行期配置（明文存 config.json，与 CLI 共用）
let config = { ...DEFAULTS };

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    config.api_base = raw.api_base || DEFAULTS.api_base;
    config.model = raw.model || DEFAULTS.model;
    if (raw.api_key) config.api_key = raw.api_key;
  } catch (_) { /* 首次运行，使用默认配置 */ }
}

async function saveConfig() {
  // 明文存储，与 CLI 共用同一份配置文件
  const toStore = {
    api_base: config.api_base,
    model: config.model,
    api_key: config.api_key,
  };
  await fs.writeFile(configPath(), JSON.stringify(toStore, null, 2), 'utf8');
}

// 回传给渲染进程的配置视图：密钥用布尔位表示，避免 UI 上误显示明文
function maskedConfig() {
  return {
    api_base: config.api_base,
    model: config.model,
    has_api_key: Boolean(config.api_key),
  };
}

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#0e1117',
    title: '识图智能体',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await loadConfig();
  ensureCliInPath();   // 首次启动时把 bin\aiir.exe 加入用户 PATH（幂等）
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: 配置 ─────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => maskedConfig());

ipcMain.handle('config:set', async (_event, cfg) => {
  if (cfg && cfg.api_base) config.api_base = cfg.api_base;
  if (cfg && cfg.api_key) config.api_key = cfg.api_key;   // 仅当用户输入了新值
  if (cfg && cfg.model) config.model = cfg.model;
  await saveConfig();
  return maskedConfig();
});

// ── IPC: 单图识别 ─────────────────────────────────────────────────────────
ipcMain.handle('recognize:single', async (_event, payload) => {
  const prompt = (payload && payload.prompt) || vision.DEFAULT_PROMPT;
  const image = (payload && (payload.filePath || payload.imageUrl)) || '';
  if (!image) return { error: '未提供图片' };
  const r = await vision.recognizeOne(config, image, prompt);
  return 'result' in r ? { result: r.result } : { error: r.error };
});

// ── IPC: 批量识别（带实时进度事件）─────────────────────────────────────────
ipcMain.handle('recognize:batch', async (_event, payload) => {
  const filePaths = (payload && payload.filePaths) || [];
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { error: '未选择图片' };
  }
  const prompt = (payload && payload.prompt) || vision.DEFAULT_PROMPT;
  const concurrency = (payload && payload.concurrency) || 3;
  const results = await vision.recognizeBatch(config, filePaths, prompt, concurrency, (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('batch:progress', info);
    }
  });
  return { results };
});
