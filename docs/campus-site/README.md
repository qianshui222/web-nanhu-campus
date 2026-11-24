# 南湖漫游校园官网交付

首页使用正常文档滚动。三维校园独立运行，首次打开首页不会初始化 WebGL、载入三维页面模块或请求 GLB。

## 开始使用

解压发布包，用 JDK 21 运行 `start.bat -NoBuild`。默认打开 [校园官网](http://127.0.0.1:8080/#/)；[三维校园](http://127.0.0.1:8080/#/campus)可以直接访问。在首页点「开始漫游」进入地图，或从地点卡片进入对应地点，例如[南湖食堂](http://127.0.0.1:8080/#/campus?place=canteen)。旧写法 `/#/?place=canteen` 自动转到专用地图路由。个人空间和管理后台继续使用原有路由与权限。

修改源码后，运行 `start.bat -Build`，或在 `frontend` 中安装依赖后执行 `node node_modules/vite/bin/vite.js build --configLoader native`。

## 实际运行截图

| 验收内容 | 运行截图 |
|---|---|
| 1440 × 900 桌面 | [首屏](screenshots/desktop-hero.png) · [整页长图](screenshots/desktop-full.png) · [校园地点](screenshots/desktop-places.png) |
| 754 × 900 竖屏 | [首屏](screenshots/tablet-hero.png) |
| 390 × 844 手机 | [首屏](screenshots/phone-hero.png) · [整页长图](screenshots/phone-full.png) · [菜单](screenshots/phone-menu.png) |
| 真实三维页 | [地图入口](screenshots/desktop-campus.png) · [食堂深链接定位](screenshots/desktop-canteen.png) |
| 改造前 | [原全屏地图首页](../paper-ui/after/desktop.png) |

## 文件与素材

- `frontend/src/pages/CampusHome.vue` 实现首屏、介绍、真实地点筛选、静态地图预览、指南、常见问题和页脚。地点名称、简介与链接来自项目现有场景数据和稳定地点编号。
- `frontend/src/site.css` 实现官网版式、滚动页面的吸顶导航和弹窗过渡。首页使用浏览器文档流，地图保留视口内操作。
- `frontend/src/main.js` 定义首页和地图路由，支持锚点、历史滚动位置和旧地点链接。`App.vue` 共享账号入口、导航和业务状态，按需导入原有三维组件。
- `frontend/public/site-media/` 包含实际浏览器输出的七张 WebP，源自部署基准 `2b8ed73`。通过项目的晴天测试预览选择同一时间，截取等角全景、北向俯视、教学区和四处地点；去除 UI 后裁切压缩，首屏去除纯色背景以融入版式。首页素材是项目三维场景截图。
- `verification/accept-campus-site.cjs` 验证网站与地图联动，既有 `accept-paper-ui.cjs` 和 `accept-bruno.cjs` 迁移到专用地图路由。基准标签为 `baseline-before-campus-site`。

## 验收

- Chromium 覆盖 1440 × 900、754 × 900 和 390 × 844，手机使用 DPR 2 和触摸输入模拟。验证滚轮、PageDown、触摸滑动，文档滚动到页脚，页脚锚点标题低于吸顶导航。检查横向溢出、弹窗的滚动锁定及 Esc 后恢复。
- 验证首页与三维页之间前进、后退、滚动位置恢复、直接访问、刷新以及旧地点链接重定向。四处筛选卡片引用稳定编号，并验证了食堂与图书馆入口的真实定位。
- 通过原有地图回归核对第一人称、搜索定位、标签、画质、小地图、工具和导航。24 个 GLB 实际加载，基准与候选的场景数据逐项相同；三维组件源代码、模型、道路、相机、光照和后端未改动。
- 构建通过。首屏入口 JavaScript 约 200 kB，地图独立包约 715 kB，后者仍触发 Vite 大包提示。验证覆盖 Chromium，未覆盖 Safari 或移动真机。

```powershell
cd verification
npm ci
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node accept-campus-site.cjs http://127.0.0.1:8080
```

## 公开参考

通过 Chromium 查看了官网首屏、菜单展开、导览与资讯区、园区地图及页脚，并读取两份公开样式。借鉴主视觉与正文的顺序、大面积留白和导航渐进展开，页面内容与图片来自南湖漫游项目。 [官网](https://ghibli-park.jp/) · [主要样式](https://ghibli-park.jp/site/css/style.css?v1) · [公共样式](https://ghibli-park.jp/site/css/common.css?v3)
