AIIR (AI Image Recognizer) Windows 安装包
==========================================

本目录提供把 AIIR 打包成 **标准 Windows 安装包** 的全部脚本与配置。

由于 PyInstaller 不能跨平台编译，最终安装包需在 **Windows 机器** 上构建。
本目录提供一键脚本，双击即可生成 `AIIR-Setup.exe`。

---

## 目录内容

| 文件 | 说明 |
|---|---|
| `build_windows.bat` | 一键构建脚本（推荐） |
| `AIIR.nsi`          | NSIS 安装包脚本 |
| `aiir.ico`          | 应用图标（可选，缺失时使用默认） |
| `LICENSE.txt`       | 许可证文本（缺失时自动生成） |
| `README.txt`        | 安装后展示给用户的说明（缺失时自动生成） |

---

## 一、构建环境准备

在 **Windows** 机器上一次性准备以下两项：

### 1. 安装 Python 3.10+

下载：<https://www.python.org/downloads/windows/>

安装时务必勾选 **"Add Python to PATH"**。

### 2. 安装 NSIS 3.x

下载：<https://nsis.sourceforge.io/Download>

安装时务必勾选 **EnVar plug-in**（用于修改系统 PATH，让 AIIR 全局可用）。
- 在 NSIS 安装界面 → "Choose Components" → 勾选 "EnVar plug-in"

验证：

```cmd
python --version
makensis -VERSION
```

---

## 二、构建步骤（一行搞定）

把整个 `/workspace` 目录拷到 Windows，进入 `installer` 子目录，双击 `build_windows.bat`。

或在 cmd / PowerShell 里运行：

```cmd
cd C:\path\to\workspace\installer
build_windows.bat
```

脚本会自动：

1. 检查 Python / NSIS 是否就绪
2. `pip install pyinstaller httpx`
3. `pyinstaller --onefile --name AIIR --icon aiir.ico vision_cli.py`
4. 用 `makensis AIIR.nsi` 生成安装包

约 1–3 分钟完成，产出在：

```
workspace\dist\AIIR.exe             <- 独立 exe，无需 Python
workspace\installer\AIIR-Setup.exe  <- 标准安装包
```

---

## 三、分发与安装

把 `AIIR-Setup.exe` 拷到任意 Windows 机器双击即可。

安装包会做：

1. 把 `AIIR.exe` 安装到 `C:\Program Files\AIIR\`
2. 把该路径加入 **系统 PATH**，让 `AIIR` 命令全局可用
3. 在开始菜单创建「AIIR 命令行」「卸载 AIIR」快捷方式
4. 在桌面创建 `AIIR` 快捷方式
5. 注册到「控制面板 → 程序与功能」，可标准卸载

安装完成后打开**新的** cmd / PowerShell，运行：

```cmd
AIIR --help
```

> ⚠️ PATH 修改后，**新开**的终端窗口才会生效；已打开的窗口需要重启。

---

## 四、自定义图标

把你的图标命名为 `aiir.ico` 放到 `installer/` 目录下，重新运行 `build_windows.bat` 即可。
缺失时 PyInstaller / NSIS 会使用默认图标。

---

## 五、自定义版本号

编辑 `AIIR.nsi` 顶部：

```
!define APP_VERSION     "1.0.0"
```

改成你需要的版本号后重新构建。

---

## 六、卸载

任选其一：

- 控制面板 → 程序与功能 → AIIR → 卸载
- 开始菜单 → AIIR → 卸载 AIIR
- 直接运行 `C:\Program Files\AIIR\uninstall.exe`

卸载会自动从 PATH 移除 AIIR 路径，并清理快捷方式和注册表。

---

## 七、安装包特性

| 特性 | 支持 |
|---|---|
| 简体中文 + 英文双语 UI | ✅ |
| 32 位 / 64 位安装包 | 64 位（InstallDir `$PROGRAMFILES64`） |
| 修改系统 PATH（全局命令） | ✅（EnVar plug-in） |
| 开始菜单 / 桌面快捷方式 | ✅ |
| 程序与功能注册 | ✅ |
| 完整卸载（含 PATH 清理） | ✅ |
| 静默安装支持 | ✅（`AIIR-Setup.exe /S`） |
| 数字签名 | ❌（需自备代码签名证书） |

### 静默安装（脚本/运维场景）

```cmd
AIIR-Setup.exe /S
```

`/S` 是 NSIS 的静默参数。需要管理员权限（UAC 提示）。

---

## 八、常见问题

### Q1：构建时报 "未检测到 NSIS"

NSIS 没装或没加进 PATH。重新安装 NSIS 并确认 `makensis` 命令可用。

### Q2：构建时报 "EnVar plug-in not found"

NSIS 安装时没勾选 EnVar plug-in。重新运行 NSIS 安装程序，"Choose Components" 里勾选后修复安装。

### Q3：安装后新开 cmd 仍提示 "AIIR 不是内部或外部命令"

- 确认是新打开的 cmd 窗口（PATH 改动不会影响已开窗口）
- 重新登录 Windows 用户会话
- 检查 `C:\Program Files\AIIR\AIIR.exe` 是否存在

### Q4：报错 "无法连接到模型服务"

AIIR 本身只是 CLI，需要后端模型服务运行。默认连接 `http://localhost:11434/v1`（本地 Ollama）。可改环境变量：

```cmd
set VISION_API_BASE=https://api.openai.com/v1
set VISION_API_KEY=sk-xxx
set VISION_MODEL=gpt-4o-mini
AIIR single C:\photos\cat.jpg
```

### Q5：能否在 Linux / macOS 上构建 Windows 安装包？

不能。PyInstaller 不能跨平台编译，必须在 Windows 上运行 `build_windows.bat`。

---

## 九、文件结构（构建后）

```
installer\
├── build_windows.bat       ← 一键构建入口
├── AIIR.nsi                ← NSIS 脚本
├── aiir.ico                ← 图标（可选）
├── LICENSE.txt              ← 许可证（自动生成）
├── README.txt               ← 用户说明（自动生成）
├── AIIR.exe                ← PyInstaller 产物（构建后）
└── AIIR-Setup.exe          ← 最终安装包（构建后）
```
