@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  AIIR Windows 一键构建脚本
REM
REM  作用：
REM    1) 用 PyInstaller 把 vision_cli.py 打包成单文件 AIIR.exe
REM    2) 用 NSIS 把 AIIR.exe 包装成标准 Windows 安装包 AIIR-Setup.exe
REM
REM  使用前提（在 Windows 上）：
REM    - 已安装 Python 3.10+ 并加入 PATH
REM    - 已安装 NSIS（https://nsis.sourceforge.io/Download）
REM      安装时勾选 "EnVar plug-in"
REM
REM  运行方法：
REM    双击 build_windows.bat
REM    或在 PowerShell / cmd 里执行： build_windows.bat
REM
REM  产出：
REM    dist\AIIR.exe              <- 独立可执行程序
REM    installer\AIIR-Setup.exe   <- 标准安装包
REM ============================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo [1/4] 检查依赖...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+ 并加入 PATH。
    pause & exit /b 1
)
where makensis >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 NSIS，请从 https://nsis.sourceforge.io 下载安装，
    echo        安装时务必勾选 EnVar plug-in（用于修改系统 PATH）。
    pause & exit /b 1
)

echo.
echo [2/4] 安装 PyInstaller...
pip install --quiet --upgrade pyinstaller httpx
if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause & exit /b 1
)

echo.
echo [3/4] 用 PyInstaller 打包 AIIR.exe ...
if exist build rmdir /s /q build
if exist dist   rmdir /s /q dist
pyinstaller --onefile --name AIIR --clean --noconsole ^
            --icon "installer\aiir.ico" ^
            vision_cli.py
if errorlevel 1 (
    echo [错误] PyInstaller 打包失败。
    pause & exit /b 1
)

REM 准备 NSIS 需要的辅助文件
if not exist "installer\aiir.ico" (
    echo [提示] 未找到 installer\aiir.ico，将使用默认图标。
)
if not exist "installer\LICENSE.txt" (
    echo AIIR 是一个极简识图 CLI 工具。> "installer\LICENSE.txt"
    echo.>> "installer\LICENSE.txt"
    echo 系统提示词固定为：分析这张图片，用5-10字描述图中内容。>> "installer\LICENSE.txt"
)
if not exist "installer\README.txt" (
    echo AIIR 命令使用说明> "installer\README.txt"
    echo.>> "installer\README.txt"
    echo 用法：>> "installer\README.txt"
    echo   AIIR single ^<图片路径^>          识别一张图片>> "installer\README.txt"
    echo   AIIR batch  ^<文件夹路径^>         批量识别文件夹所有图片>> "installer\README.txt"
    echo.>> "installer\README.txt"
    echo 选项：>> "installer\README.txt"
    echo   --json              输出 JSON 格式>> "installer\README.txt"
    echo   --prompt ^<text^>   自定义 prompt>> "installer\README.txt"
    echo   --concurrency ^<n^> batch 并发数，默认 3>> "installer\README.txt"
    echo.>> "installer\README.txt"
    echo 配置环境变量：>> "installer\README.txt"
    echo   VISION_API_BASE  模型 API 地址，默认 http://localhost:11434/v1>> "installer\README.txt"
    echo   VISION_API_KEY   API 密钥>> "installer\README.txt"
    echo   VISION_MODEL     模型名，默认 llava>> "installer\README.txt"
    echo.>> "installer\README.txt"
    echo 默认输出格式：路径^>^>识别结果>> "installer\README.txt"
)

REM 把 AIIR.exe 拷到 installer 目录给 NSIS 用
copy /Y "dist\AIIR.exe" "installer\AIIR.exe" >nul

echo.
echo [4/4] 用 NSIS 生成安装包...
pushd installer
makensis AIIR.nsi
set "NSIS_RC=!errorlevel!"
popd

if not "!NSIS_RC!"=="0" (
    echo [错误] NSIS 编译失败。
    pause & exit /b 1
)

echo.
echo ============================================================
echo  构建完成！
echo ============================================================
echo   可执行程序: %ROOT%dist\AIIR.exe
echo   安装包:    %ROOT%installer\AIIR-Setup.exe
echo.
echo  把 AIIR-Setup.exe 拷到目标 Windows 机器双击安装即可。
echo  安装后会在系统 PATH 里注册 AIIR 命令，可直接：
echo    AIIR --help
echo    AIIR single C:\photos\cat.jpg
echo ============================================================
echo.
pause
