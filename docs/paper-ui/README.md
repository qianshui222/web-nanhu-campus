# 南湖漫游手绘界面交付

改造基准为 `4e99dd2`，Git 标签为 `baseline-before-paper-ui`。本轮更新首页、地点抽屉、工具区和账号弹窗。全校三维场景沿用基准版本。

## 实际运行截图

| 屏宽 | 改前 | 改后 |
|---|---|---|
| 1440 × 900 | [桌面首页](before/desktop.png) | [桌面首页](after/desktop.png) |
| 754 × 900 | [竖屏首页](before/tablet.png) | [竖屏首页](after/tablet.png) |
| 390 × 844 | [手机首页](before/phone.png) | [手机首页](after/phone.png) |

[地点抽屉](after/tablet-places.png) · [综合楼详情](after/phone-detail.png) · [使用指南](after/phone-guide.png) · [地图工具](after/desktop-tools.png) · [步行导航](after/desktop-route.png) · [第一人称](after/desktop-walk.png)

新旧截图均由实际 Chromium 页面生成。屏幕使用相同 CSS 尺寸，手机使用 DPR 2。沿用实时环境，两批截图的太阳位置随抓取时间略有不同。

## 工程改动

- `frontend/src/App.vue` 重排顶栏和地图操作。校园地点复用现有分类、搜索、图层和业务动作。地图工具汇总路网检查、校准、渲染指标和校园环境。
- `frontend/src/pages/PaperAction.vue` 和 `frontend/public/brand/nanhu-wordmark.svg` 提供原创气泡、图标、字标。
- `frontend/src/pages/PaperDialog.vue` 使用浏览器原生模态对话框管理键盘焦点、Escape 和遮罩。打开时暂停地图第一人称键盘输入。
- `frontend/src/paper-ui.css` 负责界面色板、响应式、详情、小地图外壳和减少动态效果模式。
- `frontend/src/scene/MapScene.vue` 仅调整地图控件、界面状态和输入隔离。 `campusPoi.js` 将新界面区域纳入标签避让。画布由现有逻辑处理容器尺寸变化。
- 核对基准与测试服务的 `/api/scene` 完整场景对象一致，包含 29 个地点、76 个路网节点、80 条边。24 个独立 GLB 在浏览器中实际加载。后端、空间数据、模型与材质文件、相机和渲染配置无改动。

## 验证和运行

从带构建产物的发布包解压后，在 Windows 上使用 JDK 21 并运行 `start.bat -NoBuild`。浏览器访问 [本地首页](http://127.0.0.1:8080/)。修改源代码后可运行 `start.bat -Build`，或在 `frontend` 中安装依赖后执行 `node node_modules/vite/bin/vite.js build --configLoader native`。

```powershell
cd verification
npm ci
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node accept-paper-ui.cjs http://127.0.0.1:8080
```

- 桌面、竖屏和触屏手机分别验证了画布尺寸、POI 随拖拽重新投影、抽屉、搜索定位、帮助、夜间/天气入口的可发现性、第一人称切换、复位、北向俯视、画质和小地图。自动检查覆盖了页面异常、控制台错误和 HTTP 失败。
- 在隔离 H2 上注册临时账号、收藏地点、进入个人空间并从收藏返回地图定位，再退出。新用户测试使用 `NANHU_TEST_SIGNUP=1`，仅适用于隔离测试库。
- 上一阶段场景回归也已通过，复核 24 栋建筑的世界矩阵与包围范围、第一人称碰撞和食堂入口。宿舍至食堂样例为 109.8 m。默认起终点实际规划得到 431.2 m、5 分 45 秒。路网检查打开并关闭后路线结果保持。实时渲染指标可以打开和关闭。自动化采用软件 WebGL，指标取样随镜头和机器负载变化，无硬件性能结论。
- 天气继续由既有服务提供。验收时运行端天气接口返回 `live`，来源 Open-Meteo。无数据或数据过期的状态显示在工具区。
- Vite 生产构建通过，有大于 500 kB 的主包体积提示。桌面与手机使用 Chromium 验证，未实机覆盖 Safari。更早的业务验收脚本包含各自版本的页面定位，本轮入口验收使用 `accept-paper-ui.cjs`，上一阶段场景回归使用 `accept-bruno.cjs`。

## 参考

读取了官网和两份公开 CSS。参考了首页独立字标、`.balloon` 描边气泡、`#gnav.active` 横向展开、`.guideBtnWrap` 浅底描边与 `.menu span` 手绘线条。项目绘制了自己的 SVG 并使用 Vue 原有交互。 [官网首页](https://ghibli-park.jp/) · [主要样式](https://ghibli-park.jp/site/css/style.css?v1) · [公共样式](https://ghibli-park.jp/site/css/common.css?v3)
