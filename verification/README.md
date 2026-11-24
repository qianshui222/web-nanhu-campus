# 复验脚本

启动一份临时演示数据库后，在此目录执行 `npm install`。执行 `npm run api` 进行接口和持久化验证，执行 `npx playwright install chromium` 和 `npm run browser` 录制浏览器操作与截图。可通过 `NANHU_BROWSER` 指向已有 Chrome/Edge 可执行文件。默认访问本地 8080，通过 `NANHU_TEST_URL` 可指定临时服务地址。

脚本会注册带时间戳的验收账号，创建持久化记录并短暂修改地图。用单独数据库验证，执行期间避免并行修改同一份地图。成功完成后会恢复原场景。浏览器截图默认输出到该项目 `docs/screenshots`，可用 `NANHU_SCREENSHOTS` 指定其他目录。

`npm run revision` 覆盖算法比较、穷举核对小样例、优化保存、反馈、草稿、发布与历史恢复。该脚本默认使用 8086，截图输出到 `docs/revision/after`。设 `NANHU_API_ONLY=1` 时只运行接口算法和权限用例。设 `NANHU_BASELINE_URL` 后会额外记录基线绘制调用和北门步行截图。
