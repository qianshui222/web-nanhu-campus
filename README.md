# web课程设计——南湖漫游

《南湖漫游》是面向华中师范大学南湖校区的校园导览与三维导航课程项目。首页提供校园介绍、地点卡片和地图预览。进入三维校园后，可以搜索建筑、切换俯视与第一人称视角，并规划步行路线。

## 主要功能

- **校园漫游** · 查看建筑与设施详情，使用小地图、北向俯视、图层和画质控制。场景根据校园时间更新太阳方向和夜间灯光，天气由外部数据服务提供。
- **步行导航** · 选择起点、终点与途经点，按道路开放状态和避台阶选项计算路线。支持 A* 与 Dijkstra 对比、多站顺序优化及路线模拟。
- **个人空间** · 注册登录后可收藏地点、保存路线和行程、记录导览进度及提交地图纠错。
- **管理后台** · 管理地点和路网，保存地图草稿、发布版本、恢复历史版本及处理用户反馈。
- **校园 Agent** · 配置兼容 OpenAI Chat Completions 且支持工具调用的模型服务后，可用自然语言查找地点和规划行程。

路线距离与步行时间为项目估算，现场通行以实际标识为准。前端使用 Vue 3、Vite 和 Three.js，后端使用 Spring Boot，默认使用 H2 文件数据库。

## 从源码启动

在 Windows 上安装 **JDK 21**、**Maven 3.6.3 或更高版本**、**Node.js 20.19+ 或 22.12+**（含 npm），并确保命令可在终端中执行。首次构建需要下载依赖。

在仓库根目录运行：

```powershell
.\start.bat -Build
```

启动后访问 [http://127.0.0.1:8080/](http://127.0.0.1:8080/)。脚本会构建前端和后端，首次启动自动建表并初始化校园地图。可用 `.\stop.bat` 停止服务；端口占用时可用 `.\start.bat -Build -Port 8081`。

默认会在空库中初始化本地演示账号。普通用户为 `student` / `NanhuStudent21`，管理员为 `admin` / `NanhuAdmin21`。可在首次启动前设置 `NANHU_DEMO=false` 关闭演示账号初始化。H2 数据和启动日志位于 `runtime/`。

### 可选配置

- **MySQL** · 参考 `database/mysql.sql` 创建数据库和账号，设置 `NANHU_DB_PASSWORD`，按需设置 `NANHU_DB_URL` 与 `NANHU_DB_USER`，然后运行 `.\start.bat -Build -MySql`。
- **校园 Agent** · 启动前设置 `NANHU_AGENT_BASE_URL`、`NANHU_AGENT_MODEL` 和 `NANHU_AGENT_API_KEY`。接口基址应包含服务商要求的 API 前缀，程序会追加 `/chat/completions`。

## 项目结构

- `frontend/` · 页面、三维交互、模型和静态资源
- `backend/` · REST API、登录鉴权、路线算法、地图数据与建表脚本
- `database/` · MySQL 初始化示例
- `modeling/` · 校园模型生成脚本与资产清单
- `scripts/` · Windows 构建、启动及停止脚本
