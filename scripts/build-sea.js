// scripts/build-sea.js — 把 src/cli.js 打包成单文件可执行 aiir.exe
// 流程：esbuild bundle → node --experimental-sea-config → postject 注入 node.exe
// 前置：Node >= 20（推荐 22+），无需手动安装 postject（脚本会通过 npx 调用）
//
// 产物：dist/aiir.exe（约 90-100MB，包含 Node 运行时 + 业务代码）
//
// 运行：npm run build-sea

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUNDLE = path.join(DIST, 'aiir-bundle.cjs');
const SEA_CONFIG = path.join(DIST, 'sea-config.json');
const SEA_BLOB = path.join(DIST, 'sea-prep.blob');
const AIIR_EXE = path.join(DIST, 'aiir.exe');

// Node 安装目录里的 node.exe（SEA 注入源）
const NODE_EXE = process.execPath;

function log(msg) {
  process.stdout.write(`[build-sea] ${msg}\n`);
}

function ensureDist() {
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }
}

// Step 1: 用 esbuild 把 cli.js + vision.js + package.json 打包成单文件 CJS bundle
// SEA 只能注入一个 blob，所有 require 必须被内联
function buildBundle() {
  log('Step 1: esbuild bundling src/cli.js → dist/aiir-bundle.cjs');
  const esbuild = require('esbuild');

  esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src/cli.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: BUNDLE,
    // 内置模块（fs/path 等）保留 require，不内联
    external: [],
    // package.json 会被内联为 JSON 对象
    loader: { '.json': 'json' },
    // SEA 入口不需要 require.main 检测，但保留无害
    banner: { js: '// AIIR CLI — Single Executable Application bundle' },
    minify: false, // 不压缩，便于排错（如需更小体积可改 true）
    legalComments: 'none',
  });

  const sizeMB = (fs.statSync(BUNDLE).size / 1024 / 1024).toFixed(2);
  log(`  bundle ok (${sizeMB} MB)`);
}

// Step 2: 生成 sea-config.json
function writeSeaConfig() {
  log('Step 2: writing sea-config.json');
  const config = {
    main: BUNDLE.replace(/\\/g, '/'),
    output: SEA_BLOB.replace(/\\/g, '/'),
    disableExperimentalSEAWarning: true,
    useCodeCache: true,   // 预编译 V8 字节码，加速启动
    useSnapshot: false,
  };
  fs.writeFileSync(SEA_CONFIG, JSON.stringify(config, null, 2));
}

// Step 3: 生成 SEA blob
function generateBlob() {
  log('Step 3: generating SEA blob via node --experimental-sea-config');
  const result = spawnSync(process.execPath, ['--experimental-sea-config', SEA_CONFIG], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false, // 直接调用 node.exe，无需 shell
  });
  if (result.status !== 0) {
    throw new Error(`sea-config generation failed with exit code ${result.status}`);
  }
  if (!fs.existsSync(SEA_BLOB)) {
    throw new Error(`blob not generated: ${SEA_BLOB}`);
  }
  const sizeMB = (fs.statSync(SEA_BLOB).size / 1024 / 1024).toFixed(2);
  log(`  blob ok (${sizeMB} MB)`);
}

// Step 4: 复制 node.exe 为 aiir.exe
function copyNodeExe() {
  log(`Step 4: copying ${NODE_EXE} → ${AIIR_EXE}`);
  fs.copyFileSync(NODE_EXE, AIIR_EXE);

  // 删除可能存在的签名（postject 在已签名 exe 上注入会破坏签名）
  // Windows 上 signtool 不可用时，直接覆盖即可；postject 自己会处理
}

// Step 5: 用 postject 注入 blob 到 aiir.exe
function injectBlob() {
  log('Step 5: injecting blob into aiir.exe via postject');
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

  // 直接用 node 调用 postject 的 cli.js 入口，绕过 .cmd 和 shell
  // （项目路径含括号 (js)，cmd shell 会把 ( 当成命令分组符）
  const postjectCli = path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js');
  if (!fs.existsSync(postjectCli)) {
    throw new Error(`postject cli not found: ${postjectCli}`);
  }

  const args = [
    postjectCli,
    AIIR_EXE,
    'NODE_SEA_BLOB',
    SEA_BLOB,
    '--sentinel-fuse',
    sentinelFuse,
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`postject injection failed with exit code ${result.status}`);
  }
}

// Step 6: 验证产物
function verify() {
  log('Step 6: verifying aiir.exe');
  if (!fs.existsSync(AIIR_EXE)) {
    throw new Error(`aiir.exe not found at ${AIIR_EXE}`);
  }
  const sizeMB = (fs.statSync(AIIR_EXE).size / 1024 / 1024).toFixed(2);
  log(`  aiir.exe ok (${sizeMB} MB)`);

  // 快速冒烟测试 --version
  const result = spawnSync(AIIR_EXE, ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    log(`  WARN: aiir --version returned exit code ${result.status}`);
    log(`  stdout: ${result.stdout}`);
    log(`  stderr: ${result.stderr}`);
    return;
  }
  log(`  aiir --version → ${result.stdout.trim()}`);
}

// 清理中间产物（可选，保留便于排错）
function cleanup() {
  // 保留 aiir-bundle.cjs / sea-config.json / sea-prep.blob 便于排错
  // 仅清理 aiir.exe 旧文件（注入前已覆盖）
}

function main() {
  log(`Node: ${process.version}`);
  log(`Root: ${ROOT}`);

  ensureDist();
  buildBundle();
  writeSeaConfig();
  generateBlob();
  copyNodeExe();
  injectBlob();
  verify();
  cleanup();

  log('Done. dist/aiir.exe is ready.');
  log('Next: electron-builder will package it via build.extraResources + nsis.include');
}

main();
