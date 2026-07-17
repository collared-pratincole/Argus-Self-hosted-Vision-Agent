// src/renderer/renderer.js — 前端逻辑（通过 window.visionAPI 调用主进程，无 HTTP）
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── 配置 ─────────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const c = await window.visionAPI.getConfig();
    $('cfgBase').value = c.api_base || '';
    $('cfgModel').value = c.model || '';
    $('cfgKey').value = '';   // 密钥永不回传，输入框始终留空
    $('cfgKey').placeholder = c.has_api_key ? '已设置（留空保持不变）' : 'ollama';
  } catch (e) { console.error('loadConfig', e); }
}

async function saveConfig() {
  const cfg = {};
  const b = $('cfgBase').value.trim();
  const k = $('cfgKey').value;
  const m = $('cfgModel').value.trim();
  if (b) cfg.api_base = b;
  if (k) cfg.api_key = k;        // 仅当用户输入了新值才更新
  if (m) cfg.model = m;
  await window.visionAPI.setConfig(cfg);
  $('cfgKey').value = '';        // 立即清空，避免明文残留
  loadConfig();
}

// ── 标签切换 ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  $('panel-' + name).classList.add('active');
}

// ── 拖拽高亮 ──────────────────────────────────────────────────────────────
['singleDrop', 'batchDrop'].forEach((id) => {
  const el = $(id);
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    const inp = el.querySelector('input');
    inp.files = e.dataTransfer.files;
    inp.dispatchEvent(new Event('change'));
  });
});

function isImage(file) {
  return file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|tiff?)$/i.test(file.name);
}

// ── 单图 ──────────────────────────────────────────────────────────────────
let singleFileObj = null;
function previewSingle() {
  const f = $('singleFile').files[0];
  singleFileObj = f || null;
  const box = $('singlePreview');
  box.innerHTML = '';
  if (f) {
    const url = URL.createObjectURL(f);
    box.innerHTML = `<div class="preview-item"><img src="${escapeHtml(url)}"></div>`;
    $('singleBtn').disabled = false;
  } else {
    $('singleBtn').disabled = true;
  }
}

async function recognizeSingle() {
  const btn = $('singleBtn');
  const res = $('singleResult');
  btn.disabled = true;
  res.innerHTML = '<div class="loading">识别中</div>';

  const payload = {};
  if (singleFileObj) payload.filePath = window.visionAPI.getPathForFile(singleFileObj);
  const url = $('singleUrl').value.trim();
  if (url) payload.imageUrl = url;
  const prompt = $('singlePrompt').value.trim();
  if (prompt) payload.prompt = prompt;

  if (!payload.filePath && !payload.imageUrl) {
    res.innerHTML = `<div class="result-card"><div class="label">错误</div><div class="error">请选择图片或填写 URL</div></div>`;
    btn.disabled = false;
    return;
  }

  try {
    const data = await window.visionAPI.recognizeSingle(payload);
    if (data.error) {
      res.innerHTML = `<div class="result-card"><div class="label">错误</div><div class="error">${escapeHtml(data.error)}</div></div>`;
    } else {
      res.innerHTML = `<div class="result-card"><div class="label">识别结果</div><div class="value">${escapeHtml(data.result)}</div></div>`;
    }
  } catch (e) {
    res.innerHTML = `<div class="result-card"><div class="label">错误</div><div class="error">${escapeHtml(e.message)}</div></div>`;
  }
  btn.disabled = false;
}

// ── 批量（文件夹）─────────────────────────────────────────────────────────
let batchFileList = [];

function renderBatchPreviews() {
  const box = $('batchPreviews');
  box.innerHTML = '';
  $('stats').innerText = `已选 ${batchFileList.length} 张图片`;
  batchFileList.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.innerHTML = `<img src="${escapeHtml(url)}"><button class="remove" data-i="${i}">&times;</button><div class="filename">${escapeHtml(f.name)}</div>`;
    box.appendChild(div);
  });
  box.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      batchFileList.splice(Number(btn.dataset.i), 1);
      renderBatchPreviews();
    });
  });
  $('batchBtn').disabled = batchFileList.length === 0;
}

function previewBatch() {
  const all = $('batchFiles').files;
  batchFileList = Array.from(all).filter(isImage);
  $('stats').innerText = `共 ${all.length} 个文件，其中 ${batchFileList.length} 张图片`;
  renderBatchPreviews();
}

function setProgress(done, total) {
  const bar = $('progressBar');
  const txt = $('progressText');
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  bar.style.width = pct + '%';          // 只增不减
  txt.innerText = `已完成 ${done} / ${total}`;
}

async function recognizeBatch() {
  const btn = $('batchBtn');
  const res = $('batchResults');
  const prog = $('batchProgress');
  btn.disabled = true;

  const total = batchFileList.length;

  // 占位 spinner
  res.innerHTML = batchFileList.map((f, i) => `
    <div class="batch-item" id="bitem-${i}">
      <div class="spinner"></div>
      <span class="name">${escapeHtml(f.name)}</span>
      <span class="value">—</span>
    </div>`).join('');

  prog.style.display = total > 0 ? 'flex' : 'none';
  setProgress(0, total);

  const filePaths = batchFileList.map((f) => window.visionAPI.getPathForFile(f));
  const prompt = $('batchPrompt').value.trim();
  const concurrency = Number($('batchConc').value) || 3;

  try {
    await window.visionAPI.recognizeBatch(
      { filePaths, prompt, concurrency },
      (p) => {
        // 实时刷新对应条目
        const el = $('bitem-' + p.index);
        if (el) {
          if (p.error) {
            el.innerHTML = `<span class="name">${escapeHtml(p.name)}</span><span class="error">${escapeHtml(p.error)}</span>`;
          } else {
            el.innerHTML = `<span class="name">${escapeHtml(p.name)}</span><span class="value">${escapeHtml(p.result)}</span>`;
          }
        }
        setProgress(p.done, p.total);   // 进度只前进
      }
    );
  } catch (e) {
    res.innerHTML = `<div class="batch-item"><span class="error">${escapeHtml(e.message)}</span></div>`;
  } finally {
    btn.disabled = false;
  }
}

// ── 事件绑定 ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('saveBtn').addEventListener('click', saveConfig);
  $('singleBtn').addEventListener('click', recognizeSingle);
  $('batchBtn').addEventListener('click', recognizeBatch);
  $('singleFile').addEventListener('change', previewSingle);
  $('batchFiles').addEventListener('change', previewBatch);
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });
  loadConfig();
});
