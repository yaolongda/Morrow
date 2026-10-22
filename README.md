# 朝暮 · Morrow

![Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D6)
![Electron 45](https://img.shields.io/badge/Electron-45-47848F)
![License MIT](https://img.shields.io/badge/license-MIT-2EA44F)
[![Download](https://img.shields.io/badge/下载-最新版本-FF3B30)](../../releases/latest)

> 朝朝暮暮，皆有安排。

**朝暮（Morrow）** 是一款参考 macOS 日历设计的 Windows 桌面日历：四种视图、可自定义的工作休息节奏、跨周 / 跨月 / 跨年的长期计划、四种桌面小组件，以及一套完整的设置中心。所有数据只保存在本机。

[English](README.en.md) · [离线 HTML 说明](README.html) · [GitHub](https://github.com/yaolongda/Morrow)

![月视图](docs/month.png)

## 下载

前往 **[Releases](../../releases/latest)** 下载最新 Windows 安装包：

```text
朝暮-Morrow-Setup-1.0.1.exe
```

- Windows 10 / 11（x64）
- 按当前用户安装，无需管理员权限；自动创建桌面与开始菜单快捷方式
- 可在「设置 → 应用」中卸载，卸载不会删除日程数据
- 安装包未签名；若出现 SmartScreen，请选择「更多信息 → 仍要运行」

> 安装包约 107 MB，超过 GitHub 普通仓库的单文件限制，因此作为 Release 附件发布。

## 核心功能

### 日历

- 月 / 周 / 日 / 年四种视图，今天高亮，支持全天、多日与跨月日程。
- 周 / 日视图拖出时间段即可新建日程；月视图双击日期快速创建。
- 多日历配色、显隐、右键重命名或删除；标题 / 地点 / 备注即时搜索。
- 本地 JSON 原子持久化，不联网、不上传。

### 工作节奏

- 自定义每周起始日：**周一 / 周日 / 周六**。
- 休息规则预设：
  - 双休、单休
  - 大小周（大周双休、小周单休）
  - 上三休一
  - 周六上半天
  - 周六半天大小周
  - 月休五天（自设）
  - 完全自定义：逐天设置工作 / 半天 / 休息
- **特殊日期**：任选日期切换为休息、半天或补班，支持调休与临时安排。
- 休息日会在月 / 周 / 日 / 年视图、迷你日历与桌面小组件中柔和高亮，并随时同步。

![工作时间设置](docs/settings-work.png)

### 长期计划

- 给计划设置开始与结束日期，支持从几号持续到几号。
- 自动识别并视觉区分：
  - **短期 · 跨周**：3 周以内
  - **中期 · 跨月**：3 周至约 4 个月
  - **长期 · 跨年**：超过 4 个月或跨年
- 在月视图中以浅色进度条横跨日期，在周 / 日视图中显示计划带，不喧宾夺主。
- 进度可在编辑器中拖动更新；经过 **20 / 50 / 75 / 80 / 90 / 100%** 里程碑时，会随机送上一句励志古诗。
- 临近截止时，用一句诗温和提醒；侧边栏展示进行中的计划与进度。

![计划编辑器](docs/plan-editor.png)

### 桌面小组件

四种小组件：月历、今天、即将到来、月历与议程。

- 拖动卡片自由移动；右键菜单可切换 **小 / 中 / 大尺寸**、恢复默认尺寸。
- 拖动窗口边缘可自由缩放；**锁定位置与尺寸**后固定不动。
- 置顶、关闭；位置、尺寸与锁定状态会在重启后恢复。
- 今日小组件显示农历与节气；休息日与半天在所有小组件中柔和标记。
- 点击小组件中的日期或日程，会打开主日历并定位。

![桌面小组件](docs/widgets-showcase.png)

### 设置中心

点击工具栏齿轮，或按 `Ctrl + ,`：

- **通用**：周起始日、侧边栏、配置导入导出、数据文件夹。
- **工作时间**：休息规则预设、自定义工作日、特殊日期调休。
- **外观**：
  - 经典白 / 暖纸 / 晨雾三套主题
  - 强调色（7 种预设 + 自选颜色）
  - 字体（系统、微软雅黑、等线、宋体、楷体、霞鹜文楷）
  - Windows 11 **Mica / 亚克力**窗口材质
  - 面板不透明度、毛玻璃模糊
  - 导入自己的背景图片，可调节透明度、模糊与暗化
- **显示**：农历、二十四节气、黄历宜忌、星座运势，以及计划显示开关。
- **计划**：计划类型说明、进行中的计划、新建计划。
- **关于**：版本、简介、Slogan、项目主页与检查更新。

![外观设置](docs/settings-appearance.png)

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `T` | 回到今天 |
| `D` / `W` / `M` / `Y` | 日 / 周 / 月 / 年视图 |
| `←` / `→` | 上一个 / 下一个时间范围 |
| `Ctrl + N` | 新建日程 |
| `P` | 新建计划 |
| `Ctrl + F` 或 `/` | 搜索 |
| `Ctrl + ,` | 打开设置 |
| `Ctrl + Enter` | 保存日程 / 计划（编辑器打开时） |
| `Esc` | 关闭弹窗 / 搜索结果 |

## 从源码运行

```powershell
npm install
npm start
```

如 Electron 下载缓慢，可先设置镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

## 构建

```powershell
npm run dist
# 输出：dist\朝暮-Morrow-Setup-1.0.1.exe

npm run build:portable
# 输出：release\朝暮-win32-x64\朝暮.exe
```

## 数据与隐私

```text
%APPDATA%\朝暮\
├─ calendar-data.json    # 日历、日程、计划与设置
├─ widgets.json          # 小组件位置、尺寸、置顶与锁定
└─ window-state.json     # 主窗口大小与位置
```

- 不访问网络、不上传任何数据。
- 配置导出包含全部日历、日程、计划、设置与小组件布局。
- 删除 `calendar-data.json` 可恢复示例数据；卸载不会自动删除数据。
- 从旧版「日历」升级时，会自动迁移原有日程与小组件数据。

## 技术栈

- Electron 45
- 原生 HTML / CSS / JavaScript，无前端框架、无运行时 NPM 依赖
- 浏览器内置 Intl 中国历法 + 太阳黄经节气计算
- Chromium DevTools Protocol 端到端测试
- electron-builder + NSIS

## 项目结构

```text
.
├─ main.js                      # Electron 主进程：窗口、托盘、小组件、存储
├─ preload.js                   # 安全的渲染进程桥接
├─ seed.js                      # 首次启动示例数据
├─ renderer/
│  ├─ index.html                # 主窗口、设置中心、计划编辑
│  ├─ styles.css / features.css # 主界面与功能样式
│  ├─ app.js                    # 日历、计划、小组件、设置编排
│  ├─ settings.js               # 设置中心
│  ├─ plans.js                  # 长期计划与里程碑
│  ├─ appearance.js             # 主题、字体、材质、背景
│  ├─ lib/schedule.js           # 工作/休息日规则引擎
│  ├─ lib/almanac.js            # 农历、节气、黄历、星座
│  ├─ widget.html / widget.css / widget.js
│  └─ widget-extra.css
├─ assets/                      # 应用与托盘图标
├─ docs/                        # 截图、发布文案与说明
├─ tools/
│  ├─ e2e.js                    # 核心端到端测试
│  ├─ features-test.js          # 新功能端到端测试
│  ├─ widget-restart-test.js
│  └─ build-portable.js         # 便携版构建
├─ .github/workflows/release.yml
├─ README.md / README.en.md / README.html
├─ RELEASE_NOTES.md
└─ LICENSE
```

## 测试

```powershell
npm test
npm run test:features
npm run test:widgets
```

共 **42 项** 自动化检查：核心 23 项、新功能 15 项、小组件重启恢复 4 项。覆盖休息日规则、周起始日、半天、特殊日期、计划里程碑、设置项、小组件尺寸/锁定/同步、配置导入导出与数据重启恢复。

## 已知边界

- 农历与节气为本地计算；黄历宜忌为传统建除十二神的简化呈现，星座运势为本地生成的娱乐内容。
- Mica / 亚克力需要 Windows 11；旧系统会回退到普通窗口。
- 团队协作、账户同步与提醒通知尚未实现；周数显示、重复日程也暂未加入。
- 安装包与便携版未签名，SmartScreen 可能提示。
- 小组件是独立窗口，置顶时会浮于其它应用之上。

## License

[MIT](LICENSE) © 2026 yaolongda

参考 Apple Calendar 与 macOS Sonoma 桌面小组件。本项目为独立实现，与 Apple 无关。
