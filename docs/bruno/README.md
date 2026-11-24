# 南湖漫游 · 校园场景重构与验收

本版采用单一校园视图。改造前保存了可运行包、场景快照与浏览器基准。源码基准为 7ddb954，标记为 baseline-before-bruno。

## 兼容路线与参考落点

选用路线 B。工程继续使用 Three.js 0.180、Vue 3、WebGLRenderer 和现有 Draco 模型链路。WebGPU 节点管线需要同时迁移光照扩展、后期和运行时验证。WebGPURenderer 的 WebGL2 后端仍是其节点管线。附录中的 TSL 代码用于理解参考方案，校内部署使用有独立验证的 WebGL 实现。

- folio-2025 读取自 70764a94756cc4de564e493c8ba46c4b5fe03ed1，folio-2019 读取自 540f13573a6da282eae942a4c67335b97cd18970。实际读取附件所列 13 个实现文件及 2025 package.json。代码和图片未移入校园运行包。[逐文件记录](reference-sources.json)

| 参考模块 | 工程落点 | 采用方法 |
| --- | --- | --- |
| 2025 Materials、MeshDefaultMaterial，2019 Materials、Matcap | campusTheme.js、campusMaterials.js、campusAssets.js | 语义色板和 GLB 角色映射。保留原网格的顶点色和材质语义，以 GLSL 在已有实时光照上叠加少量彩色暗部和低位暖反弹。玻璃使用共享环境反射。 |
| 2025 Ligthing，2019 Shadows、FloorShadow | campusLighting.js、atmosphere.js | 动态太阳方向和天气补光，总览与近景独立的阴影范围、贴图分辨率与偏移。地表和建筑接触由基座及动态阴影表现。 |
| 2025 World/Foliage | campusPlants.js、landscape.js | 三类实体树冠、灌木与近远两档合批，保留原植被中心和避让边界。 |
| 2025 World/WaterSurface | campusWater.js | 192×192 最近岸线距离纹理、岸边浅水渐变、轻微波纹与粗糙反射。湖面使用原多边形，统一高度 0.365，开启不透明深度写入。 |
| 2025 View、InteractivePoints | campusCamera.js、campusPoi.js、MapScene.vue、campus-hud.css | 取景按边界和长宽比拟合。单一 OrbitControls、动画单一写入权、触屏拾取代理及节流标签遮挡检测。 |
| 2025 Rendering、cheapDOF | campusPost.js | 精细总览使用轻量屏幕边缘柔化。近景和漫游直接渲染，界面始终独立。 |

参考入口为 [2025 源码](https://github.com/brunosimon/folio-2025/tree/70764a94756cc4de564e493c8ba46c4b5fe03ed1)、[2019 源码](https://github.com/brunosimon/folio-2019/tree/540f13573a6da282eae942a4c67335b97cd18970) 和 [Three.js 渲染器文档](https://threejs.org/docs/pages/WebGPURenderer.html)。

## 空间、资产与界面

- 场景快照包含 29 个地点和 80 条道路记录。建筑、道路、入口和湖岸逐项匹配。快照文件 SHA-256 为 c602452cc9bdddc0961113dffff38f2b30605950aac08c1d6709d5388fadc7db。[布局基准](layout-baseline.json)
- Blender 实际生成 24 栋局部外观。GLB 独立路径由清单按既有编号映射，历史地图保留原资源。综合楼更新幕墙分段、入口底座和斜向构件；食堂保留临路入口并加入内凹门厅、厚窗框和分层檐口；翼楼、宿舍与体育馆分别制作屋顶和立面构造。发布 GLB 共 734.9 KB。
- Blender 校核全部局部包围盒。浏览器比较逐栋世界矩阵，世界范围与锁定尺寸差小于 0.02 场景单位。碰撞沿旧占地，拾取使用独立代理。道路与设施继续从已有图形及通行数据生成。
- 标签包含隐藏、紧凑、悬停与选中状态。按实际文字尺寸进行避让，右下小地图可折叠。中文交互保留搜索、选择、地点详情、导航、第一人称和调试入口。浏览器实测桌面默认可见 7 个标签，手机 4 个。

[24 栋源文件与 GLB 路径](../../modeling/studio-manifest.json) · [Blender 包围盒](local-bounds.json) · [世界矩阵与浏览器实测](browser-verification.json)

## 实际前后截图

桌面比较使用 1440×900、DPR 1、11 月 24 日北京时间固定测试时刻。前后截图使用同一套旧摄像机约定，改造后可用查询参数 frame=baseline 复现。另附新版默认视角、精细总览和手机图片。截图中的新版修订号来自隔离测试数据库。

| 视角 | 改造前 | 改造后 |
| --- | --- | --- |
| 全校 | [前](before/campus-day.png) | [后](after/campus-day.png) |
| 高位俯视 | [前](before/campus-overhead.png) | [后](after/campus-overhead.png) |
| 湖岸及湖面 | [前](before/lake.png) | [后](after/lake.png) |
| 综合楼 | [前](before/complex.png) | [后](after/complex.png) |
| 食堂 | [前](before/canteen.png) | [后](after/canteen.png) |
| 宿舍 | [前](before/d5.png) | [后](after/d5.png) |
| 体育馆 | [前](before/hall.png) | [后](after/hall.png) |
| 地点卡 | [前](before/place-card.png) | [后](after/place-card.png) |
| 小地图 | [前](before/minimap.png) | [后](after/minimap.png) |
| 第一人称 | [前](before/walk-day.png) | [后](after/walk-day.png) |
| 夜间 | [前](before/walk-night.png) | [后](after/walk-night.png) |
| 雨天 | [前](before/walk-rain.png) | [后](after/walk-rain.png) |
| 手机 390×844 | [前](before/mobile.png) | [后](after/mobile.png) |

[新版默认总览](overview.png) · [精细总览](overview-detailed.png) · [新版地点卡](place-card.png) · [新版手机](mobile.png)

## 验证与性能

- Vite 构建与独立 Spring Boot/H2 环境实际运行。桌面 Chrome 使用 SwiftShader，预热后检查渲染指标。浏览器核对 24 个新版 GLB 请求、端点、材质角色和可见标签，控制台及静态资源无意外错误。保存和权限另外运行既有业务验收。
- 同镜头雨天短样本。原版 12 FPS · 107 绘制调用，73,694 三角面 · 66 几何 · 1 纹理。新版 6 FPS · 109 绘制调用，87,396 三角面 · 72 几何 · 3 纹理。这两个样本均为 DPR 1；详见原始指标。
- 新版默认晴天总览，均衡档 7 FPS · 94 绘制调用，87,148 三角面 · 49 几何 · 3 纹理，精细档 7 FPS · 96 绘制调用，87,150 三角面 · 50 几何 · 5 纹理。采样画布 1172×827。画质重复切换回均衡档后 7 FPS · 94 绘制调用，87,148 三角面 · 49 几何 · 3 纹理，只有一个画布。软件帧率随负载波动。
- 食堂拾取、Escape 关闭详情、小地图折叠、第一人称碰撞和真实路线计算均通过。宿舍 5 栋到食堂约 109.8 米，末端为 canteen-in。太阳、天气和地图业务使用原接口。

## 可复现与边界

使用 Blender 4.5 LTS，在仓库根目录完成资产再生成与包围盒检查。可编辑资产位于 modeling/studio-source，运行资源位于 frontend/public/assets/campus/studio。启动可用 start.bat，独立验收实例可用 scripts/start.ps1 -Port 8086 -NoBuild 并指定独立 H2 数据库。

```powershell
blender -b --factory-startup --python-exit-code 41 --python modeling/build_studio.py
blender -b --factory-startup --python-exit-code 42 --python modeling/check_studio.py
cd frontend
npm run build
```

阴影颜色使用已有渲染光照的直射占比与暖反弹近似。湖面用岸距纹理和程序波纹，精细档柔化是屏幕空间效果。真实门洞、坡度和背立面仍有现场资料缺口；真实天气和外部 Agent 的可用性继续取决于部署配置。
