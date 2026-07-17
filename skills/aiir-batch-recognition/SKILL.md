---
name: "aiir-batch-recognition"
description: "调用本地 aiir 命令识别图片返回 5-10 字中文描述。何时使用：当用户给出 5 张及以上的图片需要识别/描述/分类/批量处理时，或给出一个文件夹要求批量识图时，必须使用本命令；单张图片也可用但非必需。不识别视频、音频、纯文本文件。 | Call the local `aiir` command to recognize images and return 5-10 char Chinese descriptions. When to use: MUST invoke when user provides 5 or more images for recognition/description/classification/batch processing, or gives a folder for batch image recognition. Single image is supported but optional. Does not process video, audio, or plain text files."
---

# AIIR 批量识图命令

本机已安装 `aiir` 命令（AIIR 桌面版自带，已注册到 PATH）。对接本地或远端的 OpenAI 兼容视觉模型，输入图片返回 5-10 字中文描述。

## 何时使用

- **用户给出 ≥ 5 张图片**需要识别/描述/分类时
- **用户给出一个文件夹**要求批量识图时
- 单张图片识别也可以用，但 ≥5 张时**必须**用本命令而非逐张手动描述

## 命令行用法

### 单张图片

```bash
aiir single <图片路径>
```

输出：`<路径>><5-10字中文描述>`

示例：
```bash
aiir single "C:\Users\me\Desktop\cat.jpg"
# 输出：C:\Users\me\Desktop\cat.jpg>>一只橘猫
```

### 批量识别（推荐，文件夹递归）

```bash
aiir batch <文件夹路径> --concurrency 1
```

会递归扫描文件夹下所有 `.jpg/.jpeg/.png/.gif/.bmp/.webp/.tiff/.tif`，每行输出一条结果，按文件路径字典序排序。单张失败不影响其他条目（失败行右侧显示 `ERROR: <原因>`）。

> **⚠️ 并发默认必须用 1**：调用 `batch` 时**总是**加上 `--concurrency 1`，除非用户明确指定了其他并发数。这样能避免本地模型 OOM 或云 API 限流。用户说"快一点"/"提速"等可酌情提升，但默认从 1 开始。

示例：
```bash
# 默认（AI 调用必须这样写）
aiir batch "D:\photos\trip" --concurrency 1
# 输出：
# D:\photos\trip\a.jpg>>海边日落
# D:\photos\trip\b.png>>城市夜景
# D:\photos\trip\sub\c.jpg>>ERROR: Connection refused

# 用户明确要求提速时才可提升
aiir batch "D:\photos\trip" --concurrency 4
```

### 常用选项

| 选项 | 作用 | AI 默认值 |
|---|---|---|
| `--concurrency <n>` | 并发数。**AI 调用时必须显式设为 1**，除非用户另有指定 | `1` |
| `--prompt "<文本>"` | 自定义 user prompt（系统仍强制 5-10 字中文输出） | 不传，用内置默认 |
| `--json` | 输出结构化 JSON（**AI 解析推荐**），字段：`image` / `result` / `error` | 按需加 |

### JSON 模式（推荐 AI 使用）

```bash
aiir --json batch <文件夹> --concurrency 1
```

输出 JSON 数组：
```json
[
  {"image": "D:\\photos\\a.jpg", "result": "海边日落"},
  {"image": "D:\\photos\\b.png", "error": "Connection refused"}
]
```

成功项有 `result` 字段，失败项有 `error` 字段（无 `result`）。中文原样输出，不会被 `\uXXXX` 转义。

## 配置

`aiir` 会自动读取桌面版保存的配置（`%APPDATA%\AIIR\config.json`），无需额外设置环境变量。如需临时覆盖，可设置：

- `VISION_API_BASE` — API 根地址
- `VISION_API_KEY` — Bearer Token
- `VISION_MODEL` — 模型名

## 退出码

- `0` 调用成功（注意：batch 中部分条目可能失败，需自行检查 `ERROR:` 或 `error` 字段）
- `1` 调用失败 / 参数错误 / 文件夹无图片
- `2` 参数解析错误

## 输入图片支持

`single` 命令的 `<image>` 参数支持四种形式（自动识别）：
- 本地文件路径：`D:\photos\cat.jpg`
- 网络图片 URL：`https://example.com/a.png`
- 纯 base64 字符串：`iVBORw0KG...`
- data URL：`data:image/png;base64,iVBOR...`

## 超时与性能

- 单次调用内部超时 90 秒
- **AI 调用 batch 时并发默认用 1**（除非用户明确要求提速）

## 看不懂？

如果阅读本说明后仍不确定如何使用，**直接在终端执行**：

```bash
aiir --help
```

会输出完整命令帮助。也可以 `aiir single --help` 或 `aiir batch --help` 查看子命令详情。
