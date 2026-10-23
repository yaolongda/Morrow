# 项目上下文 · 朝暮 Morrow

> 新会话先读这里，再读 `docs/HANDOFF.md` / `README.md`。项目已经完成到 v1.1.0，可直接继续开发。

## 基本信息

- 产品名：**朝暮 / Morrow**（公开作者名只用 `yaolongda`，不要写真实姓名）
- 目录：`E:\Code\Claudecode\日历`
- GitHub：https://github.com/yaolongda/Morrow （已有 v1.0.0；v1.1.0 已准备但尚未推送）
- 版本：**1.1.0**
- 技术：Electron 45 + 原生 HTML / CSS / JavaScript；无框架、无运行时 NPM 依赖
- 数据目录：`%APPDATA%\朝暮\`（`calendar-data.json`、`widgets.json`、`window-state.json`）
- 旧版「日历」数据会自动迁移

## 已实现功能

1. 月 / 周 / 日 / 年视图、全天与多日日程、拖拽建日程、搜索、多日历配色。
2. **重复日程**：每天 / 每个工作日 / 每周（任选星期几）/ 每两周 / 每月 / 每季度 / 每年，可设结束日期；编辑与删除支持「仅此日程 / 所有日程」，单独删除记为例外；所有视图与小组件自动展开并标记 ↻。
3. **上下班与下班庆祝**：设置上午 + 下午 / 全天 / 夜班三种班次和具体时间；「今天」小组件显示上班倒计时，午休有轻量庆祝，下班有完整动画与一句古诗，放假前夜自动升级庆祝强度。
4. 自定义周起始日（周一 / 周日 / 周六）与休息规则：双休、单休、大小周、上三休一、周六上半天、周六半天大小周、月休五天（自设）、自定义；特殊日期支持休息 / 半天 / 补班。休息日同步到所有视图与桌面小组件。
5. **法定节假日**：内置 2024–2026 年国务院放假与调休补班安排，自动标记休息 / 上班；特殊日期可把某天设为加班，优先级高于节假日。
6. 长期计划：日期范围，自动分为短期（跨周）/ 中期（跨月）/ 长期（跨年）；支持按时间自动推进进度，也可手动拖动；可添加自定义提醒节点，节点当天弹出一张温和的提醒卡；里程碑随机古诗提示。
7. 四种桌面小组件：月历、今天、即将到来、月历与议程；可自由拖拽缩放（右下角手柄或窗口边缘）、布局随尺寸自适应、跟随全局主题与背景；「今天」小组件含上班倒计时和下班庆祝动画；状态持久化。
8. 设置中心：通用、工作时间（休息规则、上下班时间、法定节假日）、外观（3 主题、字体、强调色、Mica/亚克力、面板透明度、毛玻璃、背景图片）、显示（农历 / 节气 / 黄历宜忌 / 星座运势 / 计划开关）、计划、关于。
9. 配置导出 / 导入（日历、日程、计划、设置、小组件布局），数据全部本机。
10. 关于页：主页 https://github.com/yaolongda/Morrow 、版本、Slogan、更新入口。

**注意**：黄历 / 农历 / 节气 / 星座全部为本地实现。用户已明确不接入收费的 ToolFK 黄历 API，也不要新增联网依赖。

## 关键文件

```text
main.js                    主进程、托盘、小组件窗口、widgets.json、NSIS 配置
preload.js                 contextBridge API
seed.js                    首次启动示例数据（含重复站会、月度复盘与 1 个 Q4 计划）
renderer/
  index.html               主界面、设置中心、计划编辑、小组件中心
  styles.css               基础样式
  features.css             休息日、计划、设置、主题、背景等新样式
  app.js                   日历与计划渲染、交互、外观应用、测试 API
  settings.js              设置中心（主题卡片选择器用 .theme-card[data-theme]）
  plans.js                 长期计划与里程碑
  appearance.js            主题 / 字体 / 材质 / 背景
  lib/schedule.js          工作休息规则引擎（主窗口 + 小组件共用）
  lib/holidays.js          中国法定节假日与调休数据（2024–2026，本地内置）
  lib/workday.js           上下班时段、倒计时与下班庆祝判定
  lib/recurrence.js        重复日程展开引擎（主窗口 + 小组件共用）
  lib/almanac.js           农历、节气、黄历、星座
  widget.html/widget.css/widget.js/widget-extra.css
assets/                    图标
docs/                      截图、GitHub 发布文案
tools/
  e2e.js                   核心端到端测试（23 项）
  features-test.js         新功能端到端测试（32 项）
  widget-restart-test.js   小组件重启/尺寸/锁定（4 项）
  build-portable.js        Node 版便携构建
  build-readme.js          从 readme-template.html 生成自包含 README.html
README.md / README.en.md / README.html
RELEASE_NOTES.md
docs/GITHUB_UPLOAD.md
```

## 开发命令

```powershell
npm start                 # 启动开发版
npm test                  # 核心 23 项
npm run test:features     # 新功能 32 项
npm run test:widgets      # 小组件 4 项
npm run dist              # 生成 dist\朝暮-Morrow-Setup-1.1.0.exe
npm run build:portable    # 生成 release\朝暮-win32-x64\朝暮.exe
```

当前 59 项自动化检查全部通过。

## 交付物

- 安装包：`dist\朝暮-Morrow-Setup-1.1.0.exe`
- 校验：`dist\SHA256SUMS.txt`
- 便携版：`release\朝暮-win32-x64\朝暮.exe`
- 干净的 GitHub 仓库：`E:\Code\Claudecode\朝暮-Morrow-GitHub`
- 源码 ZIP：`E:\Code\Claudecode\朝暮-Morrow-v1.1.0-GitHub.zip`

## 硬约束 / 坑

- **本机有 TSD 透明加密**：最终仓库和交付物中不要放 `.py`。生成图片/文档用的 Python 脚本也不要提交。当前工具脚本已经是 Node / JS。
- 不要提交 `node_modules/`、`dist/`、`release/`、`screenshots/`、`.lnk`、`.bat`、测试数据。
- 用户要求匿名，公开内容只写 `yaolongda`。
- 不要擅自执行 git commit / push；用户会自己更新 GitHub v1.1.0。
- 设置页主题点击必须用 `.theme-card[data-theme]`，否则会被 `<html data-theme>` 截获。
- 修改数据模型时同步更新 `normalizeState`、`seed.js`、导出/导入、`lib/schedule.js`、`lib/recurrence.js`、`lib/workday.js` 与小组件 `normalize`。
- 法定节假日数据在 `renderer/lib/holidays.js`（chinese-days v1.5.9，MIT），覆盖 2024–2026；更新年份只需替换该文件，不要新增联网请求。
- 改完 UI 后建议跑 `tools/e2e.js` + `tools/features-test.js`，并看一遍 `docs/month.png` 类截图。
- 重新 `npm run dist` 时 electron-builder 可能重新下载 Electron；直连 GitHub 超时会报 `ETIMEDOUT`，先设置 `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"` 再构建。
