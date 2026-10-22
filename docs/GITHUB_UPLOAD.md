# GitHub 发布文案与更新步骤（v1.0.1）

## 1. 仓库信息

**仓库**

```text
https://github.com/yaolongda/Morrow
```

**About / 仓库简介（中文，可直接粘贴）**

```text
朝暮 Morrow — 参考 macOS 日历设计的 Windows 桌面日历。月/周/日/年视图、自定义周起始日与休息日、跨周/跨月/跨年计划、搜索、四种可拖拽可缩放桌面小组件，以及完整的设置中心。本地存储，支持配置导入导出。
```

**About / Repository description（English）**

```text
Morrow (朝暮) is a macOS-inspired desktop calendar for Windows with week-start and rest-day customization, short/medium/long-running plans, four resizable desktop widgets, and a full settings center. Local-first, with config import/export. Built with Electron.
```

**Topics**

```text
calendar
desktop-calendar
electron
windows
widget
productivity
work-schedule
plans
macos-style
local-first
```

## 2. Release 文案

**Tag**

```text
v1.0.1
```

**Title**

```text
朝暮 Morrow v1.0.1
```

**正文**

直接使用仓库根目录的 [`RELEASE_NOTES.md`](../RELEASE_NOTES.md)。GitHub Actions 在推送 `v*` 标签时会读取该文件并创建 Release。

**附件**

```text
dist/朝暮-Morrow-Setup-1.0.1.exe
dist/SHA256SUMS.txt
```

> 安装包约 107 MB，超过 GitHub 普通仓库 100 MB 单文件限制。不要提交到源码仓库，请作为 Release 附件上传。

## 3. 更新已有仓库

仓库已存在 `v1.0.0`，这次作为 `v1.0.1` 更新。推荐先克隆现有仓库，再把整理好的源码复制进去：

```powershell
git clone https://github.com/yaolongda/Morrow.git E:\Code\Claudecode\Morrow
```

将 `E:\Code\Claudecode\朝暮-Morrow-GitHub` 中的内容覆盖到克隆目录（不要复制 `node_modules`、`dist`、`release`）。

```powershell
cd E:\Code\Claudecode\Morrow
git add .
git commit -m "feat: work rhythm, plans, settings center and resizable widgets (v1.0.1)"
git push origin main

git tag v1.0.1
git push origin v1.0.1
```

推送标签后，Actions 会构建安装包并创建 Release。也可以手动把 `dist/朝暮-Morrow-Setup-1.0.1.exe` 与 `dist/SHA256SUMS.txt` 上传到 Release。

如果本地已有该仓库的克隆，直接复制更新文件后执行提交与打标签即可。

## 4. 手动发布

在 GitHub 仓库页面进入 **Releases → Draft a new release**：

- Tag：`v1.0.1`
- Title：`朝暮 Morrow v1.0.1`
- 正文：粘贴 `RELEASE_NOTES.md`
- 附件：`dist/朝暮-Morrow-Setup-1.0.1.exe`、`dist/SHA256SUMS.txt`

或使用 GitHub CLI：

```powershell
gh release create v1.0.1 `
  "dist/朝暮-Morrow-Setup-1.0.1.exe" `
  "dist/SHA256SUMS.txt" `
  --title "朝暮 Morrow v1.0.1" `
  --notes-file RELEASE_NOTES.md
```

## 5. 上传前检查

- `.gitignore` 已排除 `node_modules/`、`dist/`、`release/`、`screenshots/`、测试数据、快捷方式与启动器。
- 仓库中只保留源码、文档、截图、测试与构建脚本。
- 安装包不要提交到 Git。
- 建议在仓库 **Settings → General → Social preview** 上传 `docs/social-preview.png`。
- 提交作者建议使用 `yaolongda` 与 GitHub noreply 邮箱，避免公开真实身份。

## 6. 可选发布动态

```text
朝暮 Morrow 1.1 发布。

这一版开始认真对待「工作节奏」：
自定义周起始日、双休/单休/大小周/上三休一/周六半天/月休五天，
特殊日期还能调休补班；休息日会同步到桌面小组件。

还有跨周、跨月、跨年的长期计划，进度经过里程碑时送一句古诗。
四种小组件现在可以缩放、锁定位置，设置中心也能换主题、字体、毛玻璃和背景图。

Windows 10/11，免费开源（MIT）。
GitHub: yaolongda/Morrow
```
