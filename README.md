# 声巡 · 鸣潮声骸地图

使用 pnpm、Node.js、TypeScript、Vue 3 和 OpenLayers 构建的声骸位置地图与三维刷取路线规划器。

项目只收录至少属于一个合鸣套装的 C1/C3 声骸，不收录 C4 BOSS、宝箱、采集物、任务、解谜和其他普通怪物。BOSS 仍会作为可传送定位点显示；传送点、局部交通、入口、秘境/挑战和服务地标等定位点默认全部显示。官方地图点位可以使用临时 XY 展示，但只有确认可直接传送并人工补齐 XYZ 的定位点才能作为路线起点。

## 环境

本机工具链由 mise 根据 `package.json` 中的 `devEngines` 自动选择：

- Node.js 26.6.0
- pnpm 11.24.0

不需要额外维护 `.nvmrc`、`.node-version` 或 mise 配置文件。

```powershell
pnpm install
pnpm data:sync
pnpm dev
```

如果 pnpm 首次安装时询问是否允许 esbuild 执行安装脚本，选择允许。允许项记录在 `pnpm-workspace.yaml`。

## 常用命令

```powershell
pnpm data:sync         # 同步 Wiki 与官方地图并生成前端数据
pnpm data:sync:wiki    # 只同步声骸与合鸣效果
pnpm data:sync:map     # 使用现有 Wiki 快照同步官方地图
pnpm data:validate     # 校验白名单、关联和坐标数据
pnpm typecheck         # Vue + TypeScript 类型检查
pnpm test              # 单元测试与生成数据契约测试
pnpm build             # 数据校验、类型检查和生产构建
pnpm check             # 完整检查
```

生产构建不会访问远程 API，只验证已经生成的 `public/data/app-data.json`。更新线上数据时显式执行 `pnpm data:sync`。

右侧面板会按图标内容列出当前地图的定位点分组、数量和最低显示缩放级别，多个使用同一图标的官方类型只显示一次，默认全部允许显示。地图缩小时会依次隐藏服务地标、入口/交通、秘境和小型信标，远景只保留中枢信标；声骸点只在局部视野显示，已录入 XYZ 的点位会更早出现。取消勾选后，URL 仅通过 `hiddenTypes` 保存隐藏的图标分组 ID；显示全集时不会产生该参数。点位显示状态不会改变路线起点资格。

## 移动端使用与验证

小于 1024px 的窗口默认以地图为主，底部“筛选”和“路线”入口每次只打开一个面板。竖屏面板最多占视口高度的 70%；宽度至少 500px、高度不超过 500px 的紧凑窗口使用侧面板。面板会随可视视口高度调整，避让软键盘和屏幕安全区。

筛选面板支持跳转到声骸、合鸣和定位点分类；移动端内容共用纵向滚动，合鸣图标横向滑动。地图、地区和楼层使用原生选择器，桌面浏览器不支持 Popover 或 CSS Anchor Positioning 时也会降级到原生选择器。

`sheet=filters` 和 `sheet=route` 保存移动面板状态，关闭时省略；原有 `panel=1` 继续独立保存桌面筛选面板的折叠偏好。搜索词、进行中的计算和路线结果不写入 URL。关闭面板不会取消计算；改变路线相关筛选、取消计算或离开页面会释放 Worker，过期结果不会覆盖新状态。

生成路线时自动定位到未被面板及地图控件遮挡的区域；在用户手动移动地图前，收起面板会重新适配路线视野。地图保留拖动与双指缩放，关闭旋转。

交付前运行 `pnpm check`，并在 320×568、390×844、844×390、768×1024 和桌面尺寸验证筛选、原生下拉框、楼层定位、路线生成/取消/失败重试、面板切换、URL 刷新恢复及根页面 `/`。另在 iOS Safari、Android Chrome 真机检查双指缩放、键盘弹出/关闭、安全区与横竖屏切换；桌面视口模拟不能替代这些真机检查。

## 数据来源和边界

- 声骸与合鸣效果：库街区 Wiki 公开目录接口。
- 地图瓦片、分层、图标和临时 XY：库街区官方地图公开静态资源。
- 精确 XYZ：`data/manual/locations.json` 人工维护。
- 地图类型别名：`data/config/map-echo-aliases.json` 人工审阅。
- 定位点收录和传送能力：`data/config/map-navigation-types.json` 人工审阅。
- 重复定位点图标的分组名称：`data/config/map-navigation-icon-groups.json` 人工审阅。

同步脚本使用 Wiki“套装”和“COST”标签组构建 C1/C3 声骸白名单，并按下载后图标内容的 SHA-256 指纹合并定位点显示分组。无法与白名单精确匹配或无法通过显式别名匹配的官方怪物会被拒绝，不会进入声骸数据。

当前官方资源 hash 会在每次同步时动态获取。底图瓦片运行时直接读取官方 WebP 静态资源；`public/vendor/kuro-map/` 已预留为可选本地缓存目录并被 Git 忽略。

## 人工坐标

`data/manual/locations.json` 中包含少量 `quality: "example"` 的声骸和定位点示例。示例 z 只用于演示路线算法，不能视为实测坐标。定位点通过 `officialLocationId` 继承同步配置中的类型和传送能力，不从坐标推断是否可传送。

正式录入时使用：

```json
{
  "id": "my-location-id",
  "echoName": "先锋幼岩",
  "officialLocationId": "官方点位 ID，可选",
  "stateId": 8,
  "countryId": 1,
  "levelId": null,
  "x": -497,
  "y": 449,
  "z": 18,
  "quality": "manual-verified",
  "note": "游戏内实测"
}
```

有 `officialLocationId` 时会覆盖对应临时点位；没有时会创建独立人工点位。分层位置还应填写官方楼层 ID，例如 `-1/3`。

## 路线规划

- 小于等于 15 个点时使用精确动态规划。
- 更多点位使用多起点最近邻和 2-opt。
- 启发式路线会检查当前地图内全部合格传送起点，不按官方数据顺序截断。
- 距离使用 X、Y、Z，高度权重可在界面调整。
- 不同楼层之间必须存在人工维护的 connector，否则拒绝生成穿墙路线。
- 路线在 Web Worker 中计算，不阻塞 OpenLayers 拖动和缩放。

项目中的相对 TypeScript 与 Vue 导入都显式包含 `.ts` 或 `.vue` 后缀；第三方包继续使用其公开的包导入路径，例如 OpenLayers 的 `.js` 子路径。
