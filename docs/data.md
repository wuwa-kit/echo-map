# 数据来源与结构

## 收录边界

项目只收录至少属于一个合鸣套装的 C1/C3 声骸，不收录 C4 BOSS、宝箱、采集物、任务、解谜和其他普通怪物。BOSS 仍会作为可传送定位点显示。传送点、局部交通、入口、秘境或挑战和服务地标等定位点默认全部显示。

人工点使用实测整数 XYZ。可直接传送的定位点可额外记录 `teleportCoordinate` 作为实际传送落点；缺省时路线回退使用图标点位 XYZ。官方点转换为相同录入结构，Z=0 为占位值，参与路线时会明确提示。

## 数据来源

- 声骸与合鸣效果：库街区 Wiki 公开目录接口。
- 地图瓦片、分层、图标和临时 XY：库街区官方地图公开静态资源。
- 人工点位与精确 XYZ：`data/manual/points.json`，由录入系统维护。
- 官方点位：`data/generated/official-points.json`，Z=0，占位数量为每种 1 只。原始点位与图标 ID 引用由地图同步写入紧凑的 `data/generated/official-locations.json`，与官方转换点位合并生成 `public/data/official-points.json`。
- 地图类型别名：`data/config/map-echo-aliases.json`，由人工审阅。
- 定位点收录和传送能力：`data/config/map-navigation-types.json`，由人工审阅。
- 重复定位点图标的分组名称：`data/config/map-navigation-icon-groups.json`，由人工审阅。

## 同步与匹配

同步脚本使用 Wiki“套装”和“COST”标签组构建 C1/C3 声骸白名单，并按下载后图标内容的 SHA-256 指纹合并定位点显示分组。无法与白名单精确匹配或无法通过显式别名匹配的官方怪物会被拒绝，不会进入声骸数据。

`data/generated/wiki.json` 与 `public/data/catalog-data.json` 的 `sonatas` 数组保留[官方 Wiki 合鸣效果目录](https://wiki.kurobbs.com/mc/catalogue/list?fid=1099&sid=1219)接口的显示顺序，地图筛选和资产库沿用此顺序。每个合鸣套装包含 `c1EchoIds`、`c3EchoIds`，分别列出该套装的 C1、C3 声骸 ID，例如 `wiki-echo-11231`。没有对应声骸时为空数组。这两个列表由声骸的 `sonataIds` 和 `cost` 自动反向生成、去重并按 ID 排序，数据校验要求双向归属一致，不手工维护列表。

当前官方资源 hash 会在每次同步时动态获取。底图瓦片运行时直接读取官方 WebP 静态资源。`public/vendor/kuro-map/` 已预留为可选本地缓存目录并被 Git 忽略。

## 公开数据文件

`public/data/` 保存四个无缩进、无换行的 JSON 文件：

- `map-data.json`：地图结构、地表与分层瓦片、地区导航、文字标签、楼层连接及地图来源信息。
- `catalog-data.json`：声骸、合鸣套装、定位点图标分组、定位点类型、图标定义、目录来源和同步统计。声骸按中文名称匹配完整 Wiki 图鉴并兼容已配置别名。点位通过 `echoId` 直接复用图鉴头像，不保存官方地图的声骸图标。传送点、BOSS 等定位点通过 `iconId` 引用 `pointIcons`。
- `official-points.json`：`locations` 保存官方原始点位信息，`library` 保存官方转换点位。
- `custom-points.json`：人工已核验记录。

地图同步、官方转换、开发服务启动和构建前都会更新公开点位快照。录入保存成功后也会同步更新，内容未变化时不重写文件。`pnpm build` 将这四个文件复制到 `dist/data/`。

开发服务提供相同路径和结构。地图、图鉴图标与官方数据并行读取，每个文件只请求一次。录入接口、导入导出和历史恢复只写人工库，官方转换命令只写官方库。前端继续复用现有底图、楼层与声骸图鉴素材。

## 官方点与人工点

两份数据使用相同的点位结构。`data/manual/points.json` 保存人工录入，`data/generated/official-points.json` 保存官方转换数据。

定位点的 `coordinate` 表示图标点位 XYZ，只有 `mode: "fast-travel"` 可以携带可选的 `teleportCoordinate`。后者表示角色传送后的实际落点 XYZ，不改变地图图标位置；路线起点使用 `teleportCoordinate ?? coordinate`。官方转换不会把图标坐标重复写成落点，未实测时保持字段缺省。

官方点的 XY 取官方坐标除以 100 后四舍五入，Z 固定为 0，状态为 `imported`，并保留原始 ID。每种声骸初始数量为 1，清单默认未补齐。只有原始 XY、地图、楼层完全相同的官方声骸记录会组合为一处，相邻记录保持独立。

地图默认同时显示两份数据。“人工点位”和“官方点位”使用独立筛选按钮：均未选或均选时显示两份数据，只选一项时仅显示对应来源；URL 通过 `sources` 保存非默认的按钮组合。录入页另有“显示官方点位”开关。

删除 `data/generated/official-points.json` 即可停用官方点位。加载和构建会将缺失文件视为空库，不会回退显示旧地图快照里的点，人工文件不受影响。

`pnpm data:validate` 同时校验两份点位文件。

## 官方测试点与旧 XYZ 示例

`data/manual/locations.json` 中包含少量 `quality: "example"` 的声骸和定位点示例。示例 Z 只用于演示路线算法，不能视为实测坐标。定位点通过 `officialLocationId` 继承同步配置中的类型和传送能力，不从坐标推断是否可传送。

以下是旧同步脚本使用的示例格式。正式录入请使用 `/editor`，不再手工维护此格式：

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

有 `officialLocationId` 时会覆盖对应临时点位，没有时会创建独立人工点位。分层位置还应填写官方楼层 ID，例如 `-1/3`。
