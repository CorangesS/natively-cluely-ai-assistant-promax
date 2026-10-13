# Natively ProMax 构建指南

本文仅说明本仓库 ProMax 版本的 macOS / Windows 本地运行与打包。

## 构建前须知

- **完整应用仍依赖私有 `premium` 子模块**，必须拥有 [该仓库](https://github.com/Natively-AI-assistant/natively-premium) 的读取权限。若拉取时报 `Repository not found` 或 `Authentication failed`，先解决权限问题。桌面端不需要初始化 `natively-api` 子模块。
- 安装过程需要联网下载 npm、Electron、Rust 依赖和本地模型。正常构建不要给 `npm ci` 添加 `--ignore-scripts` 或 `--omit=optional`，也不要跨系统复制 `node_modules` 或编译产物。
- LLM API Key 可在应用启动后的设置中填写，编译本身不需要。每条命令成功后再执行下一条。

## macOS

### 1. 准备工具

- Git、Node.js **22.13+**（含 npm）。Node 架构应与当前 Mac 一致：Apple Silicon 为 `arm64`，Intel 为 `x64`。
- Rust stable 工具链，包含 `rustup`、`cargo`、`rustc`。
- 本地开发需要 Xcode Command Line Tools；**生成 `.app` / DMG 需要 Xcode 26+ 和 macOS 26 SDK**，因为打包流程会编译 Apple Speech helper。

在终端检查：

```bash
node --version
node -p "process.platform + ' ' + process.arch"
git --version
rustc --version
cargo --version
xcode-select -p
```

需要打包时，选择已安装的完整 Xcode，并确认 SDK 版本至少为 26：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcrun --sdk macosx --show-sdk-version
```

### 2. 获取源码并启动

```bash
git clone https://github.com/CorangesS/natively-cluely-ai-assistant-promax.git
cd natively-cluely-ai-assistant-promax
git submodule update --init --recursive -- premium
npm ci
npm run build:native
npm start
```

已有本仓库时，进入项目目录，从子模块初始化开始执行即可。`build:native` 默认只编译当前 Mac 架构；`npm start` 启动 Vite 和 Electron。截图和音频功能需要在 macOS 中授予屏幕录制、麦克风等相应权限。

开发时如需 Apple Speech，另行执行下列命令再启动应用；Intel Mac 将 `arm64` 改为 `x64`。该功能运行需要 macOS 26+，编译需要上述 Xcode / SDK。

```bash
npm run build:apple-speech -- --arch arm64
```

### 3. 生成应用或安装包

先生成本地 `.app`，不生成 DMG、不上传：

```bash
npm run app:build -- --mac --arm64 --dir --publish never
```

Apple Silicon 的应用位于 `release/mac-arm64/corespeechd.app`。Intel 改用 `--x64`，通常输出到 `release/mac/corespeechd.app`。`corespeechd` 是当前项目的应用文件名。缺少日历凭据时，`--dir` 允许继续构建，但日历功能不可用。

生成 DMG 和 ZIP 前，先完成下文的“安装包所需日历配置”，然后执行：

```bash
npm run app:build -- --mac --arm64 --publish never
```

Intel 改用 `--x64`；同时生成两种架构的安装包可省略架构参数。产物在 `release/`，命名为 `Natively-版本号-架构.dmg` / `.zip`。注意：现有 `app:build` 脚本总会先编译两种 Mac 架构的 Rust 模块，即使只打包一种架构。

以上是本地构建，不执行 Apple Developer 分发签名、公证或 Release 上传。

## Windows x64

### 1. 准备工具

在 **Windows 原生 PowerShell** 中构建：

- Git for Windows、Node.js **22.13+ x64**（含 npm）。
- Python 3，安装 Python Launcher，使 `py` 命令可用。
- Visual Studio 2022 Build Tools：选择“使用 C++ 的桌面开发”，包含 MSVC v143 x64/x86 工具和 Windows 10/11 SDK。
- Rust stable，使用 **`stable-x86_64-pc-windows-msvc`** 工具链。

安装后重新打开 PowerShell，检查：

```powershell
node --version
node -p "process.platform + ' ' + process.arch"
npm.cmd --version
git --version
py --version
cargo --version
rustup show active-toolchain
```

Node 平台应输出 `win32 x64`。本文使用 `npm.cmd`，避免 PowerShell 对 `npm.ps1` 的执行策略限制。Windows 不需要 Xcode 或 Apple Speech helper。

### 2. 获取源码并启动

```powershell
git clone https://github.com/CorangesS/natively-cluely-ai-assistant-promax.git
cd natively-cluely-ai-assistant-promax
git submodule update --init --recursive -- premium
npm.cmd ci
npm.cmd run build:native
npm.cmd start
```

已有本仓库时，进入项目目录，从子模块初始化开始执行即可。

### 3. 生成程序或安装包

先生成可运行目录，不生成安装包、不上传：

```powershell
npm.cmd run app:build -- --win --x64 --dir --publish never
```

入口为 `release\win-unpacked\audiodg.exe`，这是当前项目的程序文件名。缺少日历凭据时，`--dir` 允许继续构建，但日历功能不可用。

生成 NSIS 安装包和 portable 程序前，先完成下文的日历配置，然后执行：

```powershell
npm.cmd run app:build -- --win --x64 --publish never
```

产物在 `release\`，包括安装包和 portable `.exe`。以上命令不上传 Release，也不包含 Windows 分发签名配置。

## 安装包所需日历配置（两平台通用）

**现有打包脚本要求 Google Calendar OAuth client secret，即使你不使用日历功能。** 仅开发运行或生成 `--dir` 应用目录时可以不配置。

生成 DMG / Windows 安装包前，在项目根目录的本地 `.env` 中设置自己的有效凭据（不要提交 `.env`）：

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=你的Google_OAuth客户端ID
GOOGLE_CALENDAR_CLIENT_SECRET=与上述ID匹配的客户端Secret
```

构建器只会把 secret 写入应用。分发包若使用自己的 OAuth 客户端，还需将 [`electron/services/CalendarManager.ts`](electron/services/CalendarManager.ts) 中的 `DEFAULT_CALENDAR_CLIENT_ID` 改为对应的公开 client ID；仅在构建机器 `.env` 中设置 ID 不会将它写入安装包。修改后重新执行完整 `app:build`。桌面应用中内嵌的 OAuth secret 无法对安装者保密。

## 构建问题

| 问题 | 处理 |
| --- | --- |
| 缺少 `premium/...` | 确认私有仓库权限并初始化子模块；`build:electron:core-smoke` 仅用于核心编译检查，不能代替完整应用构建。 |
| Mac 提示 Apple Speech SDK 版本不足 | 安装并选择 Xcode 26+，检查 `xcrun --sdk macosx --show-sdk-version`。 |
| Windows 找不到 Python / MSBuild / `link.exe` | 检查 Python、C++ 工作负载和 Windows SDK，必要时使用 VS Developer PowerShell。 |
| `.node` 模块架构或 ABI 不匹配 | 关闭自己启动的应用，在目标系统重新执行 `npm ci`、`npm run build:native`；必要时执行 `npm run rebuild:native`。Windows 使用 `npm.cmd`。 |
| 本地模型资源缺失 | 执行 `node scripts/download-models.js` 后重试，检查下载网络是否畅通。 |
| `[package-app] Refusing to package` 提到 calendar | 完成上述日历配置后重新构建，或使用 `--dir` 生成本地应用目录。 |

验证范围：已在 macOS 完成类型检查、前端构建、核心 Electron 编译及相关回归测试；尚未完成 macOS 完整应用打包运行和 Windows 实机构建验收。
