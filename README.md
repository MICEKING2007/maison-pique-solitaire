# Maison Pique · 纸牌沙龙

一款无框架依赖的经典克朗代克纸牌接龙（Klondike Solitaire），为手机、平板和桌面浏览器设计。

**在线游玩**：<https://MICEKING2007.github.io/maison-pique-solitaire/>  
**GitHub 仓库**：<https://github.com/MICEKING2007/maison-pique-solitaire>

<img src="screenshots/desktop.png" alt="Maison Pique 桌面界面" width="780">
<img src="screenshots/iphone.png" alt="Maison Pique 手机界面" width="240">

## 开始游玩

直接访问 **<https://MICEKING2007.github.io/maison-pique-solitaire/>**，无需安装。

也可以克隆后在本地运行：

```bash
git clone https://github.com/MICEKING2007/maison-pique-solitaire.git
cd maison-pique-solitaire
python3 -m http.server 8123
```

然后打开 <http://127.0.0.1:8123/>。macOS 也可以双击 `start-game.command` 启动。

## 功能

- 经典克朗代克规则：七列接龙、四座基础牌堆、牌堆循环与自动翻牌
- 单张 / 三张两种发牌节奏
- 触屏点选移动、拖拽移动、双击快速归位；支持多张连续牌整组移动
- 撤销、智能提示（自动选中牌并标出落点，不再来回无效搬牌）
- 计时、步数、计分与本地最佳纪录
- 基础牌堆左下角显示 `A–X` 收牌进度，弃牌堆显示总张数，随时确认某张牌在哪里
- 自动保存当前牌局，刷新或下次打开可继续
- 所有牌面翻开且剩余牌能一路收完时，自动播放收牌动画并收官；也可手动点击“自动收牌”
- 响应式布局，适配手机竖屏 / 横屏、平板与桌面
- 可安装为 PWA（在支持的浏览器和 HTTPS/localhost 环境下），支持离线游玩
- 合成音效与触感反馈，可随时关闭
- 完整键盘快捷键、可见焦点与屏幕阅读器标签；已通过 axe WCAG 自动审计

## 操作

| 操作 | 方式 |
| --- | --- |
| 发牌 | 点击左上角牌堆；按 `Space` |
| 移动牌 | 直接拖动；或点按纸牌，再点发光的落点 |
| 快速归位 | 双击纸牌 |
| 撤销 | 顶部“撤销”按钮；按 `U` 或 `⌘Z` |
| 提示 | 顶部“提示”按钮；按 `H`（会自动选中建议的牌） |
| 新局 | 顶部“新局”；按 `N` |
| 取消选择 | 按 `Esc` |

## 开发与测试

当前版本：**v1.1.0**。纯 HTML / CSS / ES Modules，无需构建。

```bash
node --test tests/*.test.js
```

规则引擎位于 `js/engine.js`，界面与交互位于 `js/app.js`。字体使用本地自托管 woff2，许可信息见 `fonts/LICENSES.md`。

## 部署

GitHub Pages 直接从 `main` 分支根目录发布，无需构建步骤。页面、字体和 PWA 缓存全部使用相对路径。

发布新版本时，同时更新 `index.html` 与 `js/app.js` 里的 `?v=` 查询串、`sw.js` 的 `CACHE_NAME` 和预缓存地址，确保用户不会停留在旧缓存。当前界面版本号显示在菜单底部（`v1.1.0`）。

## 目录

```
index.html              页面结构
styles.css              视觉系统与响应式布局
js/engine.js            可独立测试的牌局规则引擎
js/app.js               界面、拖拽、存档、音效与动效
manifest.webmanifest    PWA 清单
sw.js                   离线缓存 Service Worker
assets/                 图标与 PWA 视觉资源
fonts/                  本地字体文件与许可
screenshots/            桌面、手机与胜利界面截图
tests/                  规则引擎单元测试
```
