# AIIR CLI 使用文档

`aiir` 是 AIIR 项目的极简识图命令行工具（JS 版，替代原 `vision_cli.py`）。它对接任意 OpenAI 兼容的视觉模型（OpenAI、Ollama、LM Studio、vLLM、智谱 GLM-4V、Moonshot 等），上传图片后只返回一句话的极简描述。

设计目标：

- **可被人直接在终端使用** —— 默认输出 `路径>>结果` 格式，简洁直观。
- **可被其他 agent 通过 subprocess / child_process 调用** —— 加 `--json` 切换为结构化 JSON。
- **极简** —— 默认 prompt + 系统提示词强制输出 5–10 字中文描述。
- **零运行时依赖** —— 仅需 Node.js >= 18（内置 `fetch` / `AbortController`），无任何 npm 依赖。

> 桌面应用版本（Electron 打包的 `AIIR Setup.exe`）与本文档的 CLI 共用同一份识别核心 [src/vision.js](../src/vision.js)，配置完全一致。

---

## 目录

1. [安装](#1-安装)
2. [配置环境变量](#2-配置环境变量)
3. [命令总览](#3-命令总览)
4. [`single` —— 单张图片识别](#4-single--单张图片识别)
5. [`batch` —— 文件夹批量识别](#5-batch--文件夹批量识别)
6. [全局选项](#6-全局选项)
7. [输出格式](#7-输出格式)
8. [退出码](#8-退出码)
9. [输入图片的四种形式](#9-输入图片的四种形式)
10. [Prompt 与系统提示词](#10-prompt-与系统提示词)
11. [对接不同模型厂商](#11-对接不同模型厂商)
12. [被其他 Agent 调用](#12-被其他-agent-调用)
13. [常见问题](#13-常见问题)

---

## 1. 安装

AIIR CLI 提供三种使用方式，按推荐程度排序：

### 方式 A：安装桌面版（推荐，零环境依赖）

运行 [release/AIIR Setup 1.0.0.exe](../release/) 安装桌面应用。安装包已内嵌 `aiir.exe`（基于 Node SEA 单文件可执行，无需本机预装 Node.js）。

**首次使用前，请先启动一次桌面应用**（双击桌面/开始菜单的 AIIR 图标）。桌面应用启动时会自动把 `bin\aiir.exe` 所在目录写入用户 PATH（幂等，重复启动不会产生重复条目）。

之后打开**新的**终端窗口（已打开的终端需重开才能感知 PATH 变更），即可在任意目录直接使用：

```bash
aiir --version
aiir single img.jpg
```

> **原理**：
> - 安装包由 electron-builder 打包，NSIS 脚本（[installer/add-cli.nsh](../installer/add-cli.nsh)）在安装时把 `aiir.exe` 从 `resources\` 复制到 `bin\`。
> - 桌面应用首次启动时，[src/main.js](../src/main.js) 的 `ensureCliInPath()` 检测到 `bin\aiir.exe` 存在，自动把安装目录的 `bin\` 追加到 `HKCU\Environment\PATH` 并广播 `WM_SETTINGCHANGE`。
> - `aiir.exe` 由 [scripts/build-sea.js](../scripts/build-sea.js) 通过 Node SEA（Single Executable Application）生成：esbuild 打包 `cli.js + vision.js + package.json` 为单文件 → 注入 `node.exe` → 产出 ~87MB 的独立可执行文件。

### 方式 B：全局 npm 安装（开发机用）

在项目根目录执行：

```bash
npm install -g .
```

安装完成后，`aiir` 命令会出现在系统 PATH 中，可在任意目录直接调用：

```bash
aiir --version
aiir single img.jpg
```

> 全局安装会在 npm 全局 bin 目录下创建一个名为 `aiir` 的可执行入口（Windows 上是 `aiir.cmd`），它指向 [src/cli.js](../src/cli.js)。

### 方式 C：免安装直接运行

无需全局安装，用 `node` 直接运行入口文件：

```bash
node src/cli.js single img.jpg
```

也可通过 npm 脚本：

```bash
npm run cli -- single img.jpg
```

### 前置要求

| 方式 | 需要 Node.js | 说明 |
|---|---|---|
| A. 桌面版安装包 | ❌ 不需要 | `aiir.exe` 已内嵌 Node 运行时（SEA） |
| B. 全局 npm 安装 | ✅ Node.js >= 20 | `aiir.cmd` 调用本机 `node` 运行 `cli.js` |
| C. 免安装直接运行 | ✅ Node.js >= 20 | 直接 `node src/cli.js` |

确认 Node 版本（仅方式 B/C 需要）：

```bash
node --version   # 应输出 v20.x 或更高
```

### 三种方式的区别

| 维度 | A. 桌面版 | B. npm 全局 | C. 免安装 |
|---|---|---|---|
| 命令名 | `aiir` | `aiir` | `node src/cli.js` |
| 需要 Node.js | 否 | 是 | 是 |
| 需要先启动桌面应用 | 是（一次性，注册 PATH） | 否 | 否 |
| 自动随桌面版升级 | 是 | 否（需手动 `npm update -g`） | 否 |
| 适合普通用户 | ✅ | ❌ | ❌ |
| 适合开发者 | ✅ | ✅ | ✅ |

---

## 2. 配置环境变量

CLI 通过三个环境变量读取模型配置，与桌面应用（Electron 版）共用同一套：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `VISION_API_BASE` | `http://localhost:11434/v1` | OpenAI 兼容 API 的根地址 |
| `VISION_API_KEY`  | `ollama`                    | Bearer Token，本地模型可填任意值 |
| `VISION_MODEL`    | `llava`                     | 模型名，必须是对应服务里真实存在的视觉模型 |

临时指定（PowerShell）：

```powershell
$env:VISION_API_BASE='https://api.openai.com/v1'
$env:VISION_API_KEY='sk-xxx'
$env:VISION_MODEL='gpt-4o-mini'
aiir single img.jpg
```

临时指定（bash / zsh）：

```bash
VISION_API_BASE=https://api.openai.com/v1 \
VISION_API_KEY=sk-xxx \
VISION_MODEL=gpt-4o-mini \
aiir single img.jpg
```

长期生效建议写入系统环境变量或 shell 配置文件（`~/.bashrc` / `~/.zshrc` / Windows 系统属性 → 环境变量）。

---

## 3. 命令总览

```
aiir [--json] {single,batch} ...
```

两个子命令：

| 子命令 | 作用 |
|---|---|
| `single` | 识别一张图片（路径 / URL / base64 / data URL） |
| `batch`  | 递归扫描文件夹里所有图片，批量识别 |

查看帮助：

```bash
aiir --help
aiir -h
```

查看版本：

```bash
aiir --version
aiir -V
```

---

## 4. `single` —— 单张图片识别

### 语法

```
aiir [--json] single <image> [--prompt <text>]
```

### 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `image`   | ✅ | 图片引用，支持四种形式（见 [§9](#9-输入图片的四种形式)） |
| `--prompt` | ❌ | 自定义 user prompt，留空使用默认 |
| `--json`  | ❌ | 全局选项，输出 JSON 格式 |

### 示例

```bash
# 1) 本地文件
aiir single /photos/cat.jpg

# 2) 网络图片
aiir single "https://example.com/cat.png"

# 3) 纯 base64 字符串
aiir single "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# 4) data URL
aiir single "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# 5) 自定义 prompt
aiir single cat.jpg --prompt "这是什么动物？"

# 6) JSON 输出
aiir --json single cat.jpg
```

### 默认输出

```
/photos/cat.jpg>>一只橘猫
```

### JSON 输出（`--json`）

```json
{
  "image": "/photos/cat.jpg",
  "result": "一只橘猫"
}
```

---

## 5. `batch` —— 文件夹批量识别

### 语法

```
aiir [--json] batch <folder> [--concurrency <n>] [--prompt <text>]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `folder`              | —    | 要扫描的文件夹路径（**必填**） |
| `--concurrency`       | `3`  | 并发请求数，建议本地模型调高、限流云 API 调低 |
| `--prompt`            | 默认 | 自定义 user prompt |
| `--json`              | 关   | 全局选项，输出 JSON 格式（默认是文本） |

### 扫描规则

- **递归**：会进入所有子文件夹。
- **仅识别图片**：按扩展名过滤，支持的类型：
  - `.jpg` / `.jpeg`
  - `.png`
  - `.gif`
  - `.bmp`
  - `.webp`
  - `.tiff` / `.tif`
- **排序**：结果按文件路径字典序排序，保证多次运行输出稳定。

### 示例

```bash
# 1) 递归识别一个文件夹
aiir batch /photos

# 2) 高并发（本地 Ollama 不会触发限流）
aiir batch /photos --concurrency 8

# 3) 低并发（OpenAI 等限流 API）
aiir batch /photos --concurrency 1

# 4) 自定义 prompt
aiir batch /photos --prompt "用一句话描述这张图"

# 5) JSON 输出（agent 调用推荐）
aiir --json batch /photos

# 6) 把结果保存到文件
aiir batch /photos > results.txt
```

### 进度提示

默认会在 **stderr** 打印一行进度：

```
found 12 images, concurrency=3
```

stdout 仍是纯净的 `路径>>结果` 文本，互不干扰，可放心管道处理。加 `--json` 后进度提示仍走 stderr，不会污染 JSON 输出。

### 默认输出（每行一条）

```
/photos/a.jpg>>一只橘猫
/photos/b.png>>城市夜景
/photos/c.gif>>ERROR: 404 Not Found
```

### JSON 输出（`--json`）

```json
[
  {
    "image": "/photos/a.jpg",
    "name": "a.jpg",
    "result": "一只橘猫"
  },
  {
    "image": "/photos/b.png",
    "name": "b.png",
    "result": "城市夜景"
  },
  {
    "image": "/photos/c.gif",
    "name": "c.gif",
    "error": "404 Not Found"
  }
]
```

> batch 模式下，每条结果会额外带一个 `name` 字段（文件名），方便日志展示；single 模式不带。

单条失败不影响其他条目，失败项在文本模式下显示为 `ERROR: <信息>`，在 JSON 模式下返回 `error` 字段而非 `result` 字段。

---

## 6. 全局选项

| 选项 | 作用 |
|---|---|
| `--json` | 切换为 JSON 输出（默认是 `路径>>结果` 文本格式） |
| `-h`, `--help` | 查看帮助 |
| `-V`, `--version` | 查看版本号 |

`--json` 必须放在子命令之前：

```bash
aiir --json single img.jpg     # ✅
aiir single img.jpg --json     # ❌ 会被当作 single 的未知参数报错（退出码 2）
```

---

## 7. 输出格式

### 默认文本格式（无 `--json`）

**single**：一行
```
<图片路径>>>识别结果
```

**batch**：每行一张，按文件路径排序
```
<路径1>>>结果1
<路径2>>>结果2
<路径3>>>ERROR: 错误信息
```

`>>` 是分隔符，左右无空格。失败时右侧是 `ERROR: <原因>`。

### JSON 格式（加 `--json`）

**single**：JSON 对象
```json
{"image": "<原始输入>", "result": "<5-10字描述>"}
```
失败时：
```json
{"image": "<原始输入>", "error": "<错误信息>"}
```

**batch**：JSON 数组，元素顺序与扫描到的文件顺序一致
```json
[
  {"image": "/photos/a.jpg", "name": "a.jpg", "result": "..."},
  {"image": "/photos/b.png", "name": "b.png", "error": "..."}
]
```

`JSON.stringify` 默认保留 Unicode 中文原样输出，不会是 `\uXXXX` 转义。

### 何时用哪种

| 场景 | 推荐格式 |
|---|---|
| 人在终端看 | 默认文本 |
| 重定向到文件 / `grep` / `awk` 处理 | 默认文本 |
| 被 agent / 程序解析字段 | `--json` |
| 需要区分 `result` 与 `error` 字段 | `--json` |

---

## 8. 退出码

| 退出码 | 含义 |
|---|---|
| `0` | 调用成功（注意：batch 中部分条目可能失败，但整体调用流程成功） |
| `1` | 调用失败 / 文件夹无图片 / single 识别失败 |
| `2` | 参数错误（未知参数 / 缺少必填参数 / `--concurrency` 非正整数） |

判断单张是否真正识别成功，**不要只看退出码**：

- 文本模式：看该行右侧是否是 `ERROR:` 开头
- JSON 模式：看 JSON 里是否有 `result` 字段

```bash
# 文本模式 + grep 检查失败项
aiir batch /photos | grep ">>ERROR:" || echo "全部成功"
```

---

## 9. 输入图片的四种形式

`single` 命令的 `image` 参数会自动判断：

| 形式 | 判断依据 | 示例 |
|---|---|---|
| **URL**        | 以 `http://` 或 `https://` 开头 | `https://example.com/a.png` |
| **data URL**   | 以 `data:` 开头 | `data:image/png;base64,iVBOR...` |
| **本地文件路径** | 文件可读 | `/photos/cat.jpg`、`./img.png` |
| **base64 字符串** | 其他情况，会被当作纯 base64 | `iVBORw0KG...` |

URL 和文件路径都会被自动转为 `data:` URL 发给模型，纯 base64 字符串会自动补上 `data:image/jpeg;base64,` 前缀。

> **顺序提示**：判断时会先看是否 URL，再看是否 data URL，再尝试作为本地文件读取，最后才当作 base64。如果文件不存在但内容恰好是合法 base64，会被当作 base64 处理；若 base64 解析失败，模型端会报错。

---

## 10. Prompt 与系统提示词

### 系统提示词（System Prompt）

代码内固定为：

```
分析这张图片，用5-10字描述图中内容
```

不可通过命令行参数修改。如需修改，直接编辑 [src/vision.js](../src/vision.js) 顶部的 `SYSTEM_PROMPT` 常量。

### User Prompt（默认）

```
Identify the main subject of this image. Reply with one short phrase only, no extra text.
```

可通过 `--prompt` 覆盖。

### 配合使用建议

- 想要极简结果（默认）：留空 `--prompt`。
- 想要更具体的问题：例如 `--prompt "这是什么品种的狗？"`，系统提示词的 5–10 字约束仍然生效。

---

## 11. 对接不同模型厂商

只需修改三个环境变量即可切换厂商：

### 本地 Ollama（默认配置）

```bash
ollama pull llava
aiir single img.jpg
```

### 本地 LM Studio / vLLM

```bash
VISION_API_BASE=http://localhost:1234/v1 \
VISION_API_KEY=lm-studio \
VISION_MODEL=your-model-name \
aiir single img.jpg
```

### OpenAI

```bash
VISION_API_BASE=https://api.openai.com/v1 \
VISION_API_KEY=sk-xxx \
VISION_MODEL=gpt-4o-mini \
aiir single img.jpg
```

### 智谱 GLM-4V

```bash
VISION_API_BASE=https://open.bigmodel.cn/api/paas/v4 \
VISION_API_KEY=xxx \
VISION_MODEL=glm-4v \
aiir single img.jpg
```

### Moonshot

```bash
VISION_API_BASE=https://api.moonshot.cn/v1 \
VISION_API_KEY=xxx \
VISION_MODEL=moonshot-v1-8k-vision-preview \
aiir single img.jpg
```

> 任何兼容 OpenAI `/v1/chat/completions` 接口的服务都可以用。

---

## 12. 被其他 Agent 调用

CLI 的设计就是为了让上层 agent 通过子进程调用。

### 调用模板（Node.js，文本格式）

```javascript
const { execFileSync } = require('child_process');

const out = execFileSync('aiir', ['batch', '/photos'], {
  encoding: 'utf-8',
  env: { ...process.env, VISION_MODEL: 'llava' }
});
// out 是多行 "路径>>结果" 文本
out.trim().split('\n').forEach(line => {
  const [path, result] = line.split('>>');
  console.log(path, '->', result);
});
```

### 调用模板（Node.js，JSON 格式，推荐 agent 用）

```javascript
const { execFileSync } = require('child_process');

const out = execFileSync('aiir', ['--json', 'batch', '/photos'], {
  encoding: 'utf-8',
  env: { ...process.env, VISION_MODEL: 'llava' }
});
const data = JSON.parse(out);
for (const item of data) {
  if (item.result !== undefined) {
    console.log(item.image, '->', item.result);
  } else {
    console.log(item.image, 'FAILED:', item.error);
  }
}
```

### 调用模板（Python，JSON 格式）

```python
import subprocess, json, os

env = {**os.environ, "VISION_MODEL": "llava"}
result = subprocess.run(
    ["aiir", "--json", "batch", "/photos"],
    capture_output=True, text=True, env=env
)
if result.returncode == 0:
    data = json.loads(result.stdout)
    for item in data:
        if "result" in item:
            print(item["image"], "->", item["result"])
        else:
            print(item["image"], "FAILED:", item["error"])
else:
    print("调用失败：", result.stderr)
```

### Shell + awk（文本格式解析）

```bash
# 提取所有识别成功的 (路径, 结果)
aiir batch /photos | awk -F'>>' '$2 !~ /^ERROR:/ {print $1"\t"$2}'

# 只看失败的
aiir batch /photos | grep ">>ERROR:"
```

### 调用建议

- **批量调用且需要结构化字段时**：用 `--json`，避免自己解析 `>>` 分隔符。
- **超时控制**：CLI 内部 `fetch` 超时是 90 秒（单次请求）；外层 subprocess 建议再加一层 timeout（如 Node.js 的 `execFileSync` 的 `timeout: 120000`，或 Python 的 `timeout=120`）。
- **失败容错**：单条失败返回 `ERROR:` 前缀（文本）或 `error` 字段（JSON），而非抛异常，方便上层 agent 继续处理其余结果。
- **进度提示走 stderr**：`found N images, concurrency=K` 这行只在 stderr 出现，不会污染 stdout 的结果数据。

---

## 13. 常见问题

### Q1：报错 `fetch failed` / `connect ECONNREFUSED`

模型服务没起。检查：
- `VISION_API_BASE` 是否正确
- 本地 Ollama 是否在跑：`curl http://localhost:11434/api/tags`
- 模型名是否拼对：`ollama list`

### Q2：报错 `401 Unauthorized` / `403 Forbidden`

API Key 错误或权限不足。检查 `VISION_API_KEY`。

### Q3：返回 `>>ERROR: 404 Not Found`

通常是 `VISION_MODEL` 写错了，模型在服务端不存在。

### Q4：返回的描述全是英文

模型本身可能更偏向英文输出。可以加 `--prompt "请用中文回答"` 来强制。

### Q5：batch 命令找不到图片

- 确认文件夹路径存在
- 检查图片扩展名是否在支持列表（见 [§5](#5-batch--文件夹批量识别)）
- 扫描是递归的，子文件夹里的图片也会被扫到

### Q6：性能调优

| 场景 | 建议 `--concurrency` |
|---|---|
| 本地 Ollama / LM Studio | `4–8` |
| 本地 vLLM（GPU） | `8–16` |
| OpenAI 等限流 API | `1–3` |
| 不确定 | 默认 `3` |

### Q7：返回的 JSON 中文是 `\uXXXX` 转义吗？

不是。`JSON.stringify` 默认保留中文原样输出。

### Q8：怎么在输出里区分成功和失败？

- **文本模式**：失败行右侧是 `>>ERROR: <原因>`，可 `grep ">>ERROR:"` 筛出。
- **JSON 模式**：失败项没有 `result` 字段，只有 `error` 字段。

### Q9：报错 `single 需要 <image> 参数` 或 `batch 需要 <folder> 参数`

必填位置参数缺失，退出码 2。检查命令是否完整。

### Q10：报错 `single 未知参数: xxx` 或 `batch 未知参数: xxx`

子命令收到了无法识别的参数，退出码 2。常见原因：
- `--json` 写在了子命令之后（应写在 `single` / `batch` 之前）
- 选项拼写错误（如把 `--prompt` 写成 `-prompt`）

### Q11：安装了桌面版，但 `aiir` 命令提示"不是内部或外部命令"？

检查清单：
1. **是否启动过桌面应用？** CLI 的 PATH 注册由桌面应用首次启动时完成（[src/main.js](../src/main.js) 的 `ensureCliInPath`）。请先双击 AIIR 图标启动一次。
2. **终端是否在启动桌面应用之前打开的？** PATH 变更需要新开终端窗口才能感知。请关闭当前终端，重新打开一个。
3. **`bin\aiir.exe` 是否存在？** 检查安装目录（默认 `C:\Users\<用户名>\AppData\Local\Programs\AIIR\bin\aiir.exe`）。如果不存在，可能是安装时 NSIS 复制失败，请重新安装。
4. **手动检查 PATH**：在 PowerShell 运行 `[Environment]::GetEnvironmentVariable("PATH", "User")`，看是否包含安装目录的 `bin\`。
5. **手动注册**：如果上述都不行，可手动把安装目录的 `bin\` 加入用户 PATH：
   ```powershell
   $binDir = "$env:LOCALAPPDATA\Programs\AIIR\bin"
   $current = [Environment]::GetEnvironmentVariable("PATH", "User")
   if ($current -notlike "*$binDir*") {
     [Environment]::SetEnvironmentVariable("PATH", "$current;$binDir", "User")
   }
   ```
   然后重开终端。

### Q12：CLI 和桌面应用共享什么？

- 同一份识别核心代码：[src/vision.js](../src/vision.js)（桌面版在 `app.asar` 内，CLI 的 `aiir.exe` 内嵌同一份）
- 同一套环境变量：`VISION_API_BASE` / `VISION_API_KEY` / `VISION_MODEL`
- 同一个系统提示词与默认 user prompt
- 同一个版本号（来自 [package.json](../package.json)）

桌面应用额外通过 `safeStorage`（Windows DPAPI）加密保存 API Key，CLI 则只从环境变量读取（不落盘）。

### Q13：桌面版的 `aiir.exe` 和 `npm install -g` 的 `aiir` 命令有什么区别？

| 维度 | 桌面版 `aiir.exe` | npm 全局 `aiir` |
|---|---|---|
| 实现 | Node SEA 单文件可执行（内嵌 Node 运行时） | `aiir.cmd` → 本机 `node` 运行 `cli.js` |
| 体积 | ~87 MB（含 Node 运行时） | < 1 MB（仅 JS 源码） |
| 依赖本机 Node | 否 | 是（>= 20） |
| 启动速度 | 略慢（SEA 有 V8 字节码预编译，冷启动 ~200ms） | 快（node 直接跑 JS） |
| 功能 | 完全一致 | 完全一致 |

---

## 附录：参数速查表

```
aiir [--json] single <image>    [--prompt <text>]
aiir [--json] batch  <folder>  [--concurrency <n>] [--prompt <text>]
aiir --help
aiir --version
```

| 选项 | 适用 | 默认 | 说明 |
|---|---|---|---|
| `--json`             | 全局 | 关   | 切换为 JSON 输出（默认是 `路径>>结果` 文本） |
| `-h`, `--help`       | 全局 | —    | 显示帮助 |
| `-V`, `--version`    | 全局 | —    | 显示版本号 |
| `image`              | single | — | 图片路径 / URL / base64 / data URL |
| `--prompt`           | 两者 | 见 [§10](#10-prompt-与系统提示词) | 自定义 user prompt |
| `folder`             | batch  | — | 文件夹路径 |
| `--concurrency`      | batch  | `3` | 并发数 |

环境变量：`VISION_API_BASE` / `VISION_API_KEY` / `VISION_MODEL`

输出格式：

```
默认: <路径>>>识别结果>       (失败: <路径>>>ERROR: 原因>)
JSON:  {"image": "...", "result": "..."}
```

退出码：`0` 成功 / `1` 调用失败或无图片 / `2` 参数错误
