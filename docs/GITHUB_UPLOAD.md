# GitHub 发布文案与上传步骤

## 1. 仓库信息

**建议仓库名**

```text
morrow-calendar
```

**About / 仓库简介（中文，可直接粘贴）**

```text
朝暮 Morrow — 参考 macOS 日历设计的 Windows 桌面日历。月/周/日/年视图、拖拽建日程、多日历配色、搜索，以及四种可拖拽、可置顶、实时同步的桌面小组件。本地存储，支持配置导入导出。
```

**About / Repository description（English）**

```text
Morrow (朝暮) is a macOS-inspired desktop calendar for Windows with month/week/day/year views, drag-to-create events, color-coded calendars, instant search, and four draggable desktop widgets. Local-first, with config import/export. Built with Electron.
```

**Topics**

```text
calendar
desktop-calendar
electron
windows
widget
productivity
macos-style
javascript
local-first
chinese
```

## 2. Release 文案

**Tag**

```text
v1.0.0
```

**Release title**

```text
朝暮 Morrow v1.0.0
```

**Release 正文**

直接使用仓库根目录的 [`RELEASE_NOTES.md`](../RELEASE_NOTES.md)。GitHub Actions 打标签时会自动读取该文件作为 Release 正文。

**Release 附件**

```text
dist/朝暮-Morrow-Setup-1.0.0.exe
dist/SHA256SUMS.txt
```

> 安装包约 107 MB，超过 GitHub 普通仓库 100 MB 的单文件限制，因此不要提交到仓库，请作为 Release 附件上传。Actions 工作流会构建并自动附上；也可以手动上传。

## 3. 上传步骤（命令行）

先在 GitHub 新建一个空仓库，例如 `morrow-calendar`，**不要**勾选自动创建 README。

```powershell
cd E:\Code\Claudecode\日历

git init
git add .
git commit -m "feat: 朝暮 Morrow v1.0.0"

git branch -M main
git remote add origin https://github.com/<你的用户名>/morrow-calendar.git
git push -u origin main
```

打标签，触发 GitHub Actions 自动构建安装包并创建 Release：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

也可以在 Actions 页面手动运行 `Build Windows Installer`，构建产物会作为 workflow artifact 提供。

### 如果不用 Actions，手动发布

在 GitHub 仓库页面进入 **Releases → Draft a new release**：

- Tag：`v1.0.0`
- Title：`朝暮 Morrow v1.0.0`
- 正文：粘贴 `RELEASE_NOTES.md`
- 附件：上传 `dist/朝暮-Morrow-Setup-1.0.0.exe` 和 `dist/SHA256SUMS.txt`

如果已登录 GitHub CLI，也可以直接执行：

```powershell
gh release create v1.0.0 `
  "dist/朝暮-Morrow-Setup-1.0.0.exe" `
  "dist/SHA256SUMS.txt" `
  --title "朝暮 Morrow v1.0.0" `
  --notes-file RELEASE_NOTES.md
```

## 4. 上传前检查

- `.gitignore` 已排除 `node_modules/`、`dist/`、`release/`、`screenshots/`、测试数据、`*.lnk` 和本地启动器。
- 仓库中只保留源码、文档、截图、测试与构建脚本。
- 安装包不要提交到 Git。
- 建议在仓库 **Settings → General → Social preview** 上传 `docs/social-preview.png`。
- 建议开启 Issues；License 已包含（MIT）。
- 首次推送后可编辑仓库右侧 About、Topics 与网站字段。

## 5. 可选发布动态

```text
朝暮 Morrow 1.0 发布。

把日历放回桌面：月/周/日/年四种视图，拖一段空白就能建日程；
四种可以拖动、置顶、实时同步的桌面小组件；
所有数据只在自己的电脑里。

Windows 10/11，免费开源（MIT）。
GitHub: morrow-calendar
```
