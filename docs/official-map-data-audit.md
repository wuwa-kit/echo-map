# 官方地图数据扫描记录

扫描日期：2026-09-06。入口：[库街区鸣潮大地图](https://www.kurobbs.com/mc/map/)。资源版本：`E62CEAC5F80745288BF76C7AD5F731C3`。

本次完成公开页面的请求观察、官方前端资源地址与消费逻辑核对，并按地图选择接口返回的全部 8 个 `stateId` 请求静态数据。额外抽查了 3 个点位详情和 3 个声骸的当前 Wiki 标签。未扫描登录后的个人标记、位置同步数据或后台管理接口。

原始响应及对照结果保存在项目根目录下 `data/cache/official-map-audit-2026-09-06/`，该目录已被 Git 忽略。`source-index.json` 索引 61 份响应，记录 URL、请求方式、保存时间、SHA-256，以及是否为字段或记录子集。没有保存认证请求头。本次没有修改应用数据结构或重新生成业务数据。

## 地图名称与层级

用户指出的 [country.json](https://web-static.kurobbs.com/mcmap/country/E62CEAC5F80745288BF76C7AD5F731C3/country.json) 确实含有「拉海洛」。此前仅凭 `getMapStateSelection.data.state` 判断名称是否存在，结论不完整。

| 大区 `countryId` | 大区名称 | 分组 `mapStateId` | `mapStateName` | 直属地区关联的 `stateId` |
| --- | --- | --- | --- | --- |
| 4 | 罗伊冰原 | 5 | 拉海洛 | 906 |
| 4 | 罗伊冰原 | 6 | 冰原地表 | 8 |
| 4 | 罗伊冰原 | 7 | 黯原 | 909 |
| 3 | 黎那汐塔 | 3 | 拉古那 | 8、902、903、905 |
| 3 | 黎那汐塔 | 4 | 七丘 | 8 |
| 1 | 瑝珑 | 1 | 今州 | 8 |
| 1 | 瑝珑 | 8 | 梦州 | 8 |
| 900 | 黑海岸 | 无 | 无此层分组 | 8、900、910 |

前三列分组信息来自根节点的逗号分隔字段 `mapStateId` / `mapStateName`，最后一列来自直属 `countrys[]` 的 `mapState` / `stateId`。官方切换地图组件也按这组关系组织菜单；浏览器实际选择「罗伊冰原 → 拉海洛」后使用 `state=906`。

`mapStateId` 是菜单中的地区分组 ID，`stateId` 是加载瓦片和点位的地图 ID，两者不能互换。例如「梦州」的分组 ID 为字符串 `8`，恰好与公共地图的数字 `stateId=8` 同值，但不是同一类标识。

`getMapStateSelection` 仍把 `stateId=906` 命名为「罗伊冰原」，把 `stateId=8` 命名为「瑝珑、黑海岸群岛、黎那汐塔、罗伊冰原」。这些是资源选择接口的名称，不能单独承担界面的完整地理层级。拉古那也横跨多张地图，不能简单地给每个 `stateId` 替换一个分组名称。

另有一处来源不一致：地区树将「时隙废都」放在黑海岸下，标记 `countryId=900`；`position/910/position.json` 的 59 个点中，51 点标记 `countryId=900`，另外 8 点标记 `countryId=1`。保存地区树时应保留这一差异，不能未经核实就改写点位大区。

当前 `flattenRegions()` 保留了 249 个地名及其坐标、层级数字，但丢弃了 7 个分组的名称和 ID、显式父子关系、`fatherName`、`haveLayer`、`stateMatchValid`、`order`、`pic` 和 `clusterPic`。`fetchMapConfiguration()` 只保存了选择接口的 `data.state`，未保存 `data.country`。

## 已读取与未读取的资源

下表的 `{hash}` 指上述资源版本，`{state}` 指地图选择接口返回的 ID。静态资源统一以 `https://web-static.kurobbs.com/mcmap/` 为前缀；API 以 `https://api.kurobbs.com` 为前缀。

| 资源或接口 | 当前同步情况 | 本次核实的内容与遗漏 |
| --- | --- | --- |
| `GET /map/core/position/getMapStateSelection` | 已读取一部分 | 8 张地图；另有 4 个大区的选择数据未保存 |
| `POST /map/core/config/getMapResource` | 已读取 | 当前资源 hash |
| `POST /map/core/config/getMapIdList` | 已读取 | 640 张地表瓦片，与当前快照一致 |
| `country/{hash}/country.json` | 已读取一部分 | 大区、7 个地图分组、地区树、排序、8 张大区配图；分组等字段丢失 |
| `position/{state}/position.json` | 按业务范围读取 | 共 23835 个不重复官方点位；范围内 7415 点的 `description`、`gravityType`、`online` 未保留 |
| `layer/{hash}/{state}/layer.json` | 已读取一部分 | 90 个楼层，与当前快照一致；未保存楼层 `sort`，数组顺序仍保留 |
| `catalog/{hash}/{state}/catalog.json` | 已读取一部分 | 当前只索引类别和表名；未保存敌人的 `costList`、`groupList`、`levelList`、`growUpList` 等关系 |
| `gravity/{hash}/{state}/gravity.json` | 未读取 | 仅 903 阿维纽林非空；`2` 键下有 36 张反重力底图瓦片 |
| `region/{hash}/{state}/sldt.json` | 未读取 | 仅 905 隐海试验场非空；1 张导航缩略图、5 个交互区域、各 1 张普通/悬停图片及跳转坐标 |
| `catalog/{hash}/catalogRelation.json` | 未读取 | 官方路线分类配置，共 7 类；含 34 个声骸套装和 109 个养成材料条目 |
| `catalog/{hash}/{state}/tagRelation.json` | 未读取 | COST、套装、敌人等级、养成材料四类标签；8 张地图均返回 33 个套装标签 |
| `typeJump/positionTypeJump.json` | 未读取 | 527 个类型的跨地图、跨大区跳转目标与坐标 |
| `cluster/positionCluster.json` | 未读取 | 214 个类型的官方采集区聚合；包含中心、半径、所属地图/大区和点位 ID 列表 |
| `area/{hash}/area.json` | 未读取 | 891 条游戏区域 ID → 地图/大区/楼层映射，官方用于位置同步；不含区域边界几何 |
| `POST /map/core/position/getDetailOnline` | 未读取 | 点位详情按需加载；抽查发现图片、详情链接结构、更新时间和组织树等信息 |
| `POST /map/core/homepage/getPage` | 未读取 | 公告和页面菜单配置，属于官网页面内容 |
| `GET /map/core/position/reverseReasonTypeList` | 未读取 | 点位纠错原因列表，属于纠错功能配置 |
| `POST /ugc/server/marquee/path/recommend` | 未读取 | 页面实际请求的 UGC 推荐路线，未纳入本次官方基础地图数据收录 |

前端脚本中还声明了其他查询和管理 API，但仅出现接口名称不等于本次页面实际调用，也不等于存在一套遗漏的静态地图；未将这些声明计入已验证的遗漏。

## 对地图展示与资产库的影响

### 反重力数据

[阿维纽林 gravity.json](https://web-static.kurobbs.com/mcmap/gravity/E62CEAC5F80745288BF76C7AD5F731C3/903/gravity.json) 中的 36 张图片位于独立路径，例如 `mcmap/tiles/{hash}/903/2/-1_-1.png`。当前资产库的地表和楼层枚举没有包含这些图片。

官方前端将重力状态区分为 `1=POSITIVE` 和 `2=NEGATIVE`。当前已收录的定位点里，以下 3 点标记为 `gravityType=2`，但导入时该字段被丢弃：

| 点位 ID | 类型 |
| --- | --- |
| 1527465951493472256 | 贡多拉站台 |
| 1350575116023947264 | 小型信标 |
| 1354772880909459456 | 中枢信标 |

小型信标的原始说明也明确提及颠倒重力后的方向。该字段影响点位与地图模式的对应关系，应独立建模，不能用占位 `Z=0` 代替。

### 缩略图与配图

[隐海试验场 sldt.json](https://web-static.kurobbs.com/mcmap/region/E62CEAC5F80745288BF76C7AD5F731C3/905/sldt.json) 是区域导航缩略图配置。5 个区域是涌明高塔、朝拜圣所、化能浮池、生灵显地、千殁沉岛。`width` / `height` 被前端用于缩略图内的相对定位，`xPosition` / `yPosition` 用于地图跳转；不能按图片像素宽高直接解释。

已核对当前资产 URL 集合，明确缺少以下 89 个 URL：大区 `pic` / `clusterPic` 共 8 个、隐海导航缩略图与交互图片 11 个、反重力瓦片 36 个、地图侧套装图标 34 个。该计数未包含全部点位详情图片，也未扩大到角色、武器、材料等业务范围外资产。

### 点位说明和详情

7415 个已收录官方点位中，3118 点的原始 `description` 非空。当前归一化后均不保留。全部 7415 点的 `online` 都为 `false`，本次没有发现该标记有值差异；其业务语义仍需进一步核对，不能将它解释为点位无效并过滤。

实际打开 [海维夏点位](https://www.kurobbs.com/mc/map/?state=906&country=4&typeId=5040&pointId=1451173550991028224) 观察到详情请求：`POST /map/core/position/getDetailOnline`，表单为 `id=1451173550991028224`。另抽查了反重力小型信标与赦罪节使，3 个样本都含 `content.picturesUrl` 和 `lastUpdateTime`。

详情中的 `content.linkRaw` / `linkType` / `linkVisible` 提供链接结构，但这 3 个样本的链接均未启用。详情根节点 `gravityType` 在样本中为 `null`，实际模式可能位于 `content.gravityType`；不能直接用详情根字段覆盖列表数据。详情只抽查了 3 点，未对 7415 个点逐一请求，也未下载图片文件。

## 套装关系交叉核对

地图目录中的 `groupList` 是地图侧套装 ID，需通过 `catalogRelation.json` 或 `tagRelation.json` 解析名称，不能直接当成 `wiki-sonata-*` ID 使用。各地图中相同敌人类型的 COST/套装关系经对照一致。

符合 C1/C3 且有套装条件的地图敌人类型，经名称和现有别名映射后，没有发现本地 Wiki 未收录的新种类。但有以下 3 项关系差异；重新读取当前 Wiki 目录的原始标签后，确认它们仍存在：

| 声骸 | 地图目录 | 当前 Wiki 目录标签 |
| --- | --- | --- |
| 矿岩机麋 | 逆光跃彩之约、剪心辑梦之影 | 逆光跃彩之约 |
| 重工铁蹄 | 逆光跃彩之约、雪落无声之愿、剪心辑梦之影 | 除地图的三套外，还有星构寻辉之环 |
| 心傀·悲 | 清邪荡煞之心 | 冥途夜行之灯 |

Wiki 页面：[矿岩机麋](https://wiki.kurobbs.com/mc/item/1452367169920040960)、[重工铁蹄](https://wiki.kurobbs.com/mc/item/1452365492872908800)、[心傀·悲](https://wiki.kurobbs.com/mc/item/1523981041532538880)。本次关系证据来自公开目录 API 的原始标签，未据此断言其中哪一方符合当前游戏内掉落。

此外，`catalogRelation.json` 有 34 套，全部 8 张地图的 `tagRelation.json` 都只有 33 套，后者缺少 ID `32`「碎梦亡鬼之魇」。这说明单一标签接口也不是完整的套装清单，应保留来源并报告差异。

## 已覆盖范围与建议顺序

本次使用现有 `normalizeLocations()` 在缓存的当前官方数据上重新计算，得到 6815 个声骸点、600 个定位点，两个集合的点位 ID 均与项目快照一致。8 张地图的地表瓦片 ID 集合、归一化的楼层数据以及 249 个地区标签也与项目快照一致。没有发现当前收录规则下新增的点位 ID 或整张常规地图遗漏。

官方全部 23835 点中的宝箱、采集物、任务、解谜、观景点等仍按项目约束排除，数量差额本身不视为漏抓。`positionCluster.json` 的官方采集区聚合也不等同于项目随缩放生成的显示聚合，接入时应保留两者的独立用途。

建议后续按以下顺序补齐：

1. 保存大区和地图分组结构，使用 `mapStateName` 展示地理层级，并保留原始地图名称和 `stateId`。
2. 保存反重力瓦片与点位模式，接入地图筛选和资产库；不以占位高度推断可达关系。
3. 保留点位说明，纳入大区配图、隐海导航缩略图和地图侧套装图标；点位图片详情可另建缓存按需抓取。
4. 保存地图目录的套装/COST关系和原始 ID，增加与 Wiki 的差异报告，在来源核实前不覆盖现有关系。
5. 按具体功能需要接入类型跳转、官方采集区聚合和位置同步区域映射。

关键本地实现位置：`scripts/lib/map/source.ts`（请求资源）、`scripts/lib/map/normalize.ts`（地区和楼层归一化）、`scripts/lib/map/locations.ts`（点位字段）、`src/domain/official-assets.ts`（资产枚举）。本次仅新增这份记录并保存忽略目录下的证据，未执行数据同步。

后续实现记录：同日已接入 `mapNavigation`，保存 4 个大区、7 个地区分组及 51 个目的地区域的标签引用，并将地图切换改为逐级导航动作。上文其余遗漏和来源差异仍为待处理项。
