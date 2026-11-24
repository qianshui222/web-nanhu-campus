# 南湖漫游

当前版的校园材质、阴影、水面、植被与界面重构记录见 [浏览器截图与验收](docs/bruno/README.md)。

当前全校模型资产、地图校正、可编辑源文件、构建步骤和实测截图见 [Blender 校园资产交付](docs/assets/README.md)。

华中师范大学南湖校区三维导航与生活服务平台。打开地图即可搜索地点、查看校园并演算步行路线。登录后可保存个人记录、接续导览和提交纠错。

地图 v3 补齐 GIS 中可核对的 15 个实体建筑，新增北京时间、真实太阳方向、区域天气、虚拟夜灯和时间约束行程。自然语言校园 Agent 需要配置支持函数工具的模型服务。[建筑与前后图](docs/environment/BUILDINGS.md) · [环境与模型配置](docs/environment/CONFIG.md) · [本轮实测](docs/environment/VERIFIED.md)

本次整改新增北向地图校准、A* 与 Dijkstra 对照、多站行程优化、服务端草稿和版本发布恢复。已有原版数据库在启用历史时会存档当前场景，只有与原始发布模板完全一致时才自动升级地图，保留账号和私人记录。详见 [地图校准及画面前后对照](docs/revision/CALIBRATION.md) 和 [整改操作与测试](docs/revision/RESULTS.md)。

## Windows 快速启动

解压完整交付包，确认 `java --version` 可用。推荐 JDK 21，把对应 JDK 的根目录设为 `JAVA_HOME`，或者把 Java 加到当前终端的 PATH。交付包自带构建好的 Vue 页面和 Spring Boot 可执行 JAR，首次演示只需要 Java。

1. 双击 `start.bat`。
2. 打开 [http://127.0.0.1:8080/](http://127.0.0.1:8080/)。
3. 演示结束双击 `stop.bat`。停止脚本按 PID、启动时间和可执行文件路径核对进程。

| 身份 | 账号 | 密码 |
| --- | --- | --- |
| 普通用户 | `student` | `NanhuStudent21` |
| 管理员 | `admin` | `NanhuAdmin21` |

演示配置默认监听本机。可以注册自己的账号。应用日志在 `runtime/server.log` 和 `runtime/server-error.log`。

## 修改源码后的构建

安装 JDK 21、Apache Maven 3.6.3+ 和 Node.js 20.19+ 或 22.12+（含 npm）。使用 `start.bat -Build` 重新安装前端锁定依赖、生成生产页面、构建后端并启动。此前已运行本项目时，先执行 `stop.bat`。前后端共用同一个本地端口。改动较频繁时，可先启动后端，再进入 `frontend` 执行 `npm ci`、`npm run dev`，在 [http://127.0.0.1:5173/](http://127.0.0.1:5173/) 开发，Vite 把 `/api` 转发给端口 8080。

便携环境可在当前终端设置 `JAVA_HOME`、`NANHU_MAVEN`（指向 `mvn.cmd`）、`NANHU_NPM_CLI`（指向 npm 的 `bin/npm-cli.js`）、`NANHU_MAVEN_REPO`。构建日志分别见 `runtime/npm.log`、`runtime/vite.log`、`runtime/maven.log`。Spring Boot 3.5 系列支持 Java 21，项目固定使用 3.5.7 和 Java 21 编译目标。前端版本固定在 `package.json` 和 `package-lock.json`。[Spring Boot 构建要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)

## 数据库

- 快速启动使用 H2 文件库，默认文件为 `runtime/nanhu.mv.db`。首次创建时，后端应用 `schema.sql` 并载入 `scene.json`。刷新页面、注销和重启服务都会保留已保存的业务记录。需要一份全新数据时，可在服务停止后备份旧库，再用新目录启动发行包。
- MySQL 8.4 配置同样经过本地验证。启动 MySQL 后，按 `database/mysql.sql` 创建 `nanhu` 数据库和专用账号，在当前终端设置 `NANHU_DB_PASSWORD`，需要时设置 `NANHU_DB_USER`、`NANHU_DB_URL`，运行 `start.bat -MySql`。默认 JDBC 地址使用本机 3306。PowerShell 用 `$env:NANHU_DB_PASSWORD = '你设置的密码'` 设置本会话环境变量。Spring 使用相同的建表语句和种子。H2 和 MySQL 各自保存数据。
- `NANHU_DEMO=false` 可在空库中跳过演示账号初始化。已初始化数据库中的演示账号继续有效。

## 使用与排查

- 地图支持鼠标拖动旋转、滚轮缩放、右键拖动平移。第一人称可用 WASD 或方向键移动，拖动改视线。触屏可双指缩放，浏览地点列表由地图左上角按钮打开。
- 路线是校园局部坐标中的步行模拟。避台阶依据本项目道路属性。导览完成由用户手动确认。
- 默认端口占用时，可运行 `start.bat -Port 8081`。开发代理默认仍指向 8080，可按需调整 `vite.config.js`。
- 若三维场景初始化失败，页面内可重试，地点列表和路径表单仍可使用。远程参考照片取自校方新闻，受网络状态影响。
- 场景数据更新后可刷新地图。后台保存时校验入口、道路、导览和已有业务引用。导入 JSON 先进入草稿，点击保存后生效。数据导出覆盖场景数据。

## 交付资料

- [设计说明](docs/DESIGN.md)
- [校园资料来源与估算](docs/SOURCES.md)
- [实际测试记录](docs/TESTING.md)
- [答辩演示提纲](docs/DEMO.md)
- [全校概览](docs/screenshots/01-campus.png) · [综合楼与详情](docs/screenshots/02-landmark.png) · [路线](docs/screenshots/03-route.png) · [个人空间](docs/screenshots/04-personal.png) · [后台](docs/screenshots/05-admin.png) · [移动端](docs/screenshots/06-mobile.png)
