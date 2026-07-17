# Argus · Self-hosted Vision Agent

> *百眼之巨，洞见万象。*
>
> 本次尝试了一下高大上的命名风格 —— 取名 **Argus**，源自希腊神话中身披百眼的守望者 Panoptes，词根本义"明亮、洞察"。CLI 名 `aiir` 即 **A**rgus **I**ntelligent **I**mage **R**ecognition 的缩写，名实相符。

## 📌 项目概述

阿耳戈斯是一款面向桌面与命令行的轻量级视觉智能体，可以让你的主智能体长出一对更强大的双眼，同时看几千张图片。它对接任意 OpenAI 兼容的多模态模型，将图片理解能力下沉到本地运行时，让"看图说话"不再依赖云端服务。

一次配置，双态共用 —— 无论你是在图形界面里拖入一张照片，还是在 Shell 里敲下一行命令，Argus 都以同一份配置、同一颗识别内核、同一种输出契约回应你。

## ✨ 核心特性

- **双态合一** —— Electron 桌面应用与 `aiir` 命令行共用同一份配置与识别内核
- **零运行时依赖** —— CLI 由 Node SEA 编译为单文件 `aiir.exe`（~87MB），无需本机预装 Node.js
- **任意模型接入** —— 兼容任何 OpenAI `/v1/chat/completions` 协议的视觉模型，本地 / 云端皆可
- **极简输出** —— 默认强制 5-10 字中文描述，剥离一切冗余
- **批量并发** —— 递归扫描文件夹，cursor + worker pool 并发调度，单张失败不影响整批
- **Reasoning 兜底** —— 自动关闭推理模式（对支持该字段的厂商），并对推理模型残留的 `reasoning_content` 做末端提取兜底
- **配置持久化** —— 桌面版保存一次，CLI 自动读取，明文 `config.json` 双态共享
- **PATH 自动注册** —— 安装桌面版后首次启动，自动把 `bin\` 写入用户 PATH（幂等）

## 🛡️ 两种形态

| 形态 | 入口 | 适用场景 |
|---|---|---|
| **Guardian Mode**（桌面应用） | `AIIR.exe` | 图形界面操作，拖入图片即可识别，实时进度可视化 |
| **Oracle Mode**（命令行） | `aiir` / `aiir.exe` | 终端批处理、被其他 Agent 通过 subprocess 编排调用 |

## 🚀 快速开始

### 安装桌面版（推荐，零环境依赖）

1. 前往 [GitHub Releases](https://github.com/collared-pratincole/Argus-Self-hosted-Vision-Agent/releases) 下载 `AIIR Setup 1.0.0.exe`
2. 双击运行安装程序，按向导完成安装（可选安装目录、创建快捷方式）
3. **首次启动一次桌面应用** —— 这会触发 PATH 自动注册，让 `aiir` 命令全局可用
4. 在桌面应用内配置 API Base / Model / API Key（如 LM Studio 的 `http://localhost:1234/v1`）
5. 打开**新的**终端窗口（已打开的终端需重开才能感知 PATH 变更），即可在任意目录使用：

```bash
aiir --version
aiir single "C:\Users\me\Desktop\photo.jpg"
```

### 命令行用法速览

```bash
# 单张识别
aiir single <图片路径>

# 批量识别（递归扫描文件夹）
aiir batch <文件夹路径> --concurrency 1

# JSON 结构化输出（便于 AI / 脚本解析）
aiir --json batch <文件夹路径> --concurrency 1
```

输出示例：
```
C:\photos\cat.jpg>>一只橘猫
C:\photos\city.png>>城市夜景
```

> 看不懂？直接在终端敲 `aiir --help`。

完整 CLI 文档见 [docs/cli.md](docs/cli.md)。

## 📁 项目结构

```
Argus-Self-hosted-Vision-Agent/
├── src/                        # 核心源码
│   ├── main.js                 # Electron 主进程
│   ├── preload.js              # contextBridge 安全 IPC 桥
│   ├── vision.js               # 识别内核（fetch + AbortController）
│   ├── cli.js                  # CLI 入口
│   └── renderer/               # 前端 UI
│       ├── index.html
│       └── renderer.js
├── scripts/
│   └── build-sea.js            # Node SEA 打包脚本
├── installer/
│   └── add-cli.nsh             # NSIS 安装脚本（拷贝 aiir.exe）
├── docs/
│   └── cli.md                  # CLI 完整文档
├── skills/                     # TRAE AI Skill 定义
├── package.json                # electron-builder 配置入口
└── .gitignore
```

## 🔧 技术栈

- **Electron** + **electron-builder**（NSIS 安装包）
- **Node SEA**（Single Executable Application，CLI 单文件化）
- **contextBridge + contextIsolation**（安全 IPC）
- **fetch + AbortController**（90 秒超时）
- **esbuild + postject**（CLI 打包流水线）

## 📌 重要注意事项

- 系统要求：Windows 10/11 x64
- 安装桌面版后**必须首次启动一次**，否则 `aiir` 命令不会注册到 PATH
- 终端需**重新打开**才能感知 PATH 变更（已打开的窗口不自动刷新）
- `config.json` 为明文存储 API Key，位于 `%APPDATA%\AIIR\config.json`，请妥善保管
- 本项目聚焦 Windows 平台，macOS / Linux 桌面包未构建（CLI 源码跨平台）

## 📜 许可证

**MIT License**

---

**项目命名**：Argus · Self-hosted Vision Agent
**版本**：1.0.0
**风格注解**：本次尝试了一下高大上的命名风格。
