#!/usr/bin/env node
// src/cli.js — AIIR CLI 入口（替代 vision_cli.py）
// 通过 `npm install -g .` 全局安装后，可直接使用 `aiir` 命令。
// 也可不安装直接运行：`node src/cli.js ...`
// 无任何外部依赖，仅需 Node.js >= 18（内置 fetch / AbortController）。

const fs = require('fs');
const path = require('path');
const os = require('os');
const vision = require('./vision');
const pkg = require('../package.json');

// 桌面版 config.json 路径（与 Electron app.getPath('userData') 一致）
// Windows: %APPDATA%\AIIR\config.json
// macOS:   ~/Library/Application Support/AIIR/config.json
// Linux:   $XDG_CONFIG_HOME/AIIR/config.json 或 ~/.config/AIIR/config.json
function desktopConfigPath() {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'AIIR', 'config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'AIIR', 'config.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'AIIR', 'config.json');
}

// 读取桌面版 config.json（明文存储，与桌面应用共用）
function loadDesktopConfig() {
  try {
    const p = desktopConfigPath();
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const cfg = {};
    if (raw.api_base) cfg.api_base = raw.api_base;
    if (raw.model) cfg.model = raw.model;
    if (raw.api_key) cfg.api_key = raw.api_key;
    return cfg;
  } catch (_) {
    return {};
  }
}

// 配置优先级：环境变量 > 桌面版 config.json > 默认值
function buildConfig() {
  const desktop = loadDesktopConfig();
  return {
    api_base: process.env.VISION_API_BASE || desktop.api_base || 'http://localhost:11434/v1',
    api_key: process.env.VISION_API_KEY || desktop.api_key || 'ollama',
    model: process.env.VISION_MODEL || desktop.model || 'llava',
  };
}

function usage() {
  process.stderr.write(`AIIR — 极简识图 CLI v${pkg.version}

用法:
  aiir [--json] single <image>  [--prompt <text>]
  aiir [--json] batch  <folder> [--concurrency <n>] [--prompt <text>]
  aiir --help
  aiir --version

子命令:
  single   识别单张图片（路径 / URL / base64 / data URL）
  batch    递归识别文件夹里所有图片

全局选项:
  --json          输出 JSON 格式（默认是 "路径>>结果" 文本）
  -h, --help      显示本帮助
  -V, --version   显示版本号

环境变量:
  VISION_API_BASE  默认 http://localhost:11434/v1
  VISION_API_KEY   默认 ollama
  VISION_MODEL     默认 llava

示例:
  aiir single img.jpg
  aiir single "https://example.com/a.png"
  aiir single img.jpg --prompt "这是什么动物？"
  aiir batch /photos --concurrency 5
  aiir --json batch /photos > results.json
`);
}

// 简单参数解析（不引入外部依赖）
function parseArgs(argv) {
  const rest = argv.slice(2);
  const args = { json: false, command: null, image: null, folder: null, concurrency: 3, prompt: null };
  let i = 0;

  // 全局选项必须出现在子命令之前（与原 Python 版一致）
  while (i < rest.length) {
    const a = rest[i];
    if (a === '--json') { args.json = true; i++; continue; }
    if (a === '-h' || a === '--help') return { help: true };
    if (a === '-V' || a === '--version') return { version: true };
    if (a === 'single' || a === 'batch') { args.command = a; i++; break; }
    process.stderr.write(`未知参数: ${a}\n`);
    process.exit(2);
  }

  if (!args.command) return { help: true };

  if (args.command === 'single') {
    if (i >= rest.length) { process.stderr.write('single 需要 <image> 参数\n'); process.exit(2); }
    args.image = rest[i++];
    while (i < rest.length) {
      const a = rest[i];
      if (a === '--prompt') {
        if (i + 1 >= rest.length) { process.stderr.write('--prompt 需要值\n'); process.exit(2); }
        args.prompt = rest[++i]; i++; continue;
      }
      process.stderr.write(`single 未知参数: ${a}\n`);
      process.exit(2);
    }
  } else {
    if (i >= rest.length) { process.stderr.write('batch 需要 <folder> 参数\n'); process.exit(2); }
    args.folder = rest[i++];
    while (i < rest.length) {
      const a = rest[i];
      if (a === '--concurrency') {
        if (i + 1 >= rest.length) { process.stderr.write('--concurrency 需要值\n'); process.exit(2); }
        const n = parseInt(rest[++i], 10);
        if (!Number.isFinite(n) || n < 1) { process.stderr.write('--concurrency 必须是正整数\n'); process.exit(2); }
        args.concurrency = n; i++; continue;
      }
      if (a === '--prompt') {
        if (i + 1 >= rest.length) { process.stderr.write('--prompt 需要值\n'); process.exit(2); }
        args.prompt = rest[++i]; i++; continue;
      }
      process.stderr.write(`batch 未知参数: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function formatLine(item) {
  const img = item.image || '';
  if (item.result !== undefined) return `${img}>>${item.result}`;
  return `${img}>>ERROR: ${item.error || 'unknown'}`;
}

async function cmdSingle(args) {
  const config = buildConfig();
  const r = await vision.recognizeOne(config, args.image, args.prompt || vision.DEFAULT_PROMPT);
  if (args.json) {
    process.stdout.write(JSON.stringify(r) + '\n');
  } else {
    process.stdout.write(formatLine(r) + '\n');
  }
  return r.result !== undefined ? 0 : 1;
}

async function cmdBatch(args) {
  const config = buildConfig();
  const images = await vision.collectImagesFromFolder(args.folder);
  if (images.length === 0) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ error: 'no images found', folder: args.folder }) + '\n');
    } else {
      process.stdout.write(`${args.folder}>>ERROR: no images found\n`);
    }
    return 1;
  }
  if (!args.json) {
    // 进度提示走 stderr，stdout 仍是纯净结果，可放心管道处理
    process.stderr.write(`found ${images.length} images, concurrency=${args.concurrency}\n`);
  }
  const results = await vision.recognizeBatch(
    config, images, args.prompt || vision.DEFAULT_PROMPT, args.concurrency
  );
  if (args.json) {
    process.stdout.write(JSON.stringify(results) + '\n');
  } else {
    for (const item of results) {
      process.stdout.write(formatLine(item) + '\n');
    }
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }
  if (args.version) { process.stdout.write(`aiir ${pkg.version}\n`); process.exit(0); }

  let code;
  try {
    if (args.command === 'single') code = await cmdSingle(args);
    else if (args.command === 'batch') code = await cmdBatch(args);
    else code = 2;
  } catch (err) {
    process.stderr.write(`fatal: ${err && err.message ? err.message : err}\n`);
    code = 1;
  }
  process.exit(code);
}

main();
