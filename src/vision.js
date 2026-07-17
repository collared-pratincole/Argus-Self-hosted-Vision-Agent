// src/vision.js — 视觉识别核心逻辑（替代 vision_cli.py / web_server.py 中的识别部分）
// 供 Electron 主进程与潜在 CLI 复用。对接任意 OpenAI 兼容的视觉模型。

const fs = require('fs').promises;
const path = require('path');

const SYSTEM_PROMPT = '分析这张图片，用5-10字描述图中内容';
const DEFAULT_PROMPT = '识别图中的主要内容，只用一句简短的中文短语回答，不要输出任何额外文字。';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif']);

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.webp': 'image/webp',
  '.tiff': 'image/tiff', '.tif': 'image/tiff',
};

function guessMime(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'image/jpeg';
}

function bufferToDataUrl(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// 路径 / URL / base64 / data URL -> data URL
async function loadImageAsDataUrl(image) {
  if (image.startsWith('http://') || image.startsWith('https://')) {
    const resp = await fetch(image, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
    if (!resp.ok) throw new Error(`fetch ${image}: ${resp.status} ${resp.statusText}`);
    const mime = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buf = Buffer.from(await resp.arrayBuffer());
    return bufferToDataUrl(buf, mime);
  }
  if (image.startsWith('data:')) return image;

  // 本地文件路径
  try {
    const buf = await fs.readFile(image);
    return bufferToDataUrl(buf, guessMime(image));
  } catch {
    // 既不是可读文件，也不是 data/url —— 当作纯 base64
    return `data:image/jpeg;base64,${image}`;
  }
}

// 从模型返回中提取最终答案：
// 1) 优先用 message.content；若为空再退到 message.reasoning_content（部分厂商如 LM Studio qwen3 把答案放这里）
// 2) 剥离 <think>...</think> 思考块（reasoning 没关掉时的兜底）
// 3) 去掉常见的前缀如 "答案：" "结果：" 等
// 4) 若 reasoning_content 被截断（content 为空且 reasoning 未以句号收尾），
//    取 reasoning 末尾的描述性片段作为答案（总比返回空好）
function extractAnswer(message, finishReason) {
  if (!message) return '';
  let content = '';
  let reasoning = '';
  if (typeof message.content === 'string') content = message.content;
  if (typeof message.reasoning_content === 'string') reasoning = message.reasoning_content;

  // 剥离 <think>...</think>（兼容未闭合或多个块的情况）
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 兜底：若 <think> 没闭合（被 max_tokens 截断），删除从 <think> 到末尾
  content = content.replace(/<think>[\s\S]*$/gi, '');
  // 去掉常见前缀
  content = content.replace(/^(答案|结果|描述|识别结果)\s*[:：]\s*/i, '');
  content = content.trim();

  if (content) return content;

  // content 为空：reasoning 模型被截断的兜底
  if (!reasoning) return '';

  // 去掉 reasoning 里的分析性标号（1. 2. 3. 等）
  const cleaned = reasoning
    .replace(/^\s*\d+\.\s*\*{0,2}[^：:]*[:：]\s*/gm, '')   // "1. **分析图像**："
    .replace(/^\s*[-*]\s*/gm, '')                          // "- xxx" / "* xxx"
    .trim();

  // 取最后一段有意义的文字（按换行分割，取最后非空行）
  const lines = cleaned.split(/\n+/).map(s => s.trim()).filter(Boolean);
  let last = lines.length > 0 ? lines[lines.length - 1] : cleaned;

  // 去掉前缀
  last = last.replace(/^(答案|结果|描述|识别结果)\s*[:：]\s*/i, '').trim();

  // 若被截断（末尾无标点），补省略号表明不完整
  if (finishReason === 'length' && !/[。.！!？?；;]$/.test(last)) {
    last = last + '…';
  }
  return last;
}

async function callVision(config, dataUrl, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const resp = await fetch(`${config.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] },
        ],
        // max_tokens 必须足够大：reasoning 模型即使关掉 reasoning 也可能先输出思考过程
        // LM Studio 等本地服务默认 max_tokens 仅 60，会把思考截断在中间，
        // 导致 content 为空、reasoning_content 半截，看不到结果。
        // 1500 token 足够覆盖思考过程 + 5-10 字答案。
        max_tokens: 1500,
        temperature: 0,
        // 关闭推理（Reason）模式，避免模型输出冗长的 <think>...</think> 过程
        // 不同 OpenAI 兼容厂商字段不同，全部覆盖以保证通用：
        reasoning_effort: 'none',                              // OpenAI o 系列专用
        enable_reasoning: false,                               // 部分国产 API
        chat_template_kwargs: { enable_thinking: false },      // Qwen / vLLM 等
        thinking: { type: 'disabled' },                        // Anthropic 风格（部分代理）
      }),
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`${resp.status} ${resp.statusText} ${txt}`.trim());
    }
    const data = await resp.json();
    const choice = data && data.choices && data.choices[0];
    const message = choice && choice.message;
    const finishReason = choice && choice.finish_reason;
    const answer = extractAnswer(message, finishReason);
    if (!answer) {
      // 调试信息：把原始 message 序列化出来便于排查
      const dump = JSON.stringify(message).slice(0, 500);
      throw new Error(`模型返回为空或无法解析：${dump}`);
    }
    return answer;
  } finally {
    clearTimeout(timer);
  }
}

// 识别单张：成功返回 { image, result }，失败返回 { image, error }
async function recognizeOne(config, image, prompt) {
  try {
    const dataUrl = await loadImageAsDataUrl(image);
    const result = await callVision(config, dataUrl, prompt || DEFAULT_PROMPT);
    return { image, result };
  } catch (err) {
    return { image, error: String(err && err.message ? err.message : err) };
  }
}

// 批量识别：限制并发数，每完成一项回调 onProgress（按完成顺序，不按索引顺序）
async function recognizeBatch(config, images, prompt, concurrency, onProgress) {
  const results = new Array(images.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= images.length) break;
      const img = images[idx];
      const r = await recognizeOne(config, img, prompt);
      results[idx] = { name: path.basename(img), image: img, ...r };
      done++;
      if (onProgress) onProgress({ index: idx, done, total: images.length, name: results[idx].name, result: r.result, error: r.error });
    }
  }

  const n = Math.max(1, Math.min(concurrency || 3, images.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

// 递归收集文件夹中的图片，按路径字典序排序
async function collectImagesFromFolder(folder) {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  await walk(folder);
  out.sort();
  return out;
}

module.exports = {
  SYSTEM_PROMPT,
  DEFAULT_PROMPT,
  IMAGE_EXTS,
  loadImageAsDataUrl,
  callVision,
  recognizeOne,
  recognizeBatch,
  collectImagesFromFolder,
};
