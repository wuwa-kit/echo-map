# 项目规范

## 开发环境与依赖

- 使用 pnpm 管理依赖和执行脚本，不生成 npm 或 Yarn 锁文件。
- Node.js 与 pnpm 版本以 `package.json` 的 `devEngines` 为唯一来源；本机由 mise 自动识别，不新增 `.node-version`、`.nvmrc` 等重复版本配置。
- TypeScript 工具脚本直接使用当前 Node.js 原生执行，不引入 `tsx`、`ts-node` 等额外运行器；脚本只使用 Node.js 可直接擦除的 TypeScript 语法。
- 所有项目依赖统一声明在 `package.json` 的 `dependencies` 中，不使用 `devDependencies`、`peerDependencies` 或 `optionalDependencies`。
- 所有依赖版本统一维护在 `pnpm-workspace.yaml` 的默认 `catalog` 中，并使用 `^version` 格式；`package.json` 使用 `catalog:` 引用，不直接填写版本号。
- 新增依赖前先确认标准库和现有依赖无法满足需求。
- 完成代码修改后至少运行 `pnpm typecheck`；涉及业务逻辑时运行 `pnpm test`，交付前优先运行 `pnpm check`。

## Vue 原生标签

- Vue 模板、JSX/TSX、`h('tag')` 和 `document.createElement('tag')` 只能使用本节白名单中的原生标签。
- 当前允许的通用及交互标签为：`div`、`span`、`a`、`button`、`input`、`img`、`canvas`、`svg`。
- 当前项目因原生地图筛选表单额外允许：`label`、`select`、`option`；仅在需要对应原生表单行为时使用。
- 当前允许的表格标签为：`table`、`caption`、`colgroup`、`col`、`thead`、`tbody`、`tfoot`、`tr`、`th`、`td`。
- 当前允许的 Vue 内建标签为：`template`、`slot`、`component`。
- 不使用 `header`、`main`、`section`、`aside`、`article`、`nav`、`footer`、`h1`—`h6`、`p`、`time`、`pre`、`code`、`strong`、`small`、`ol`、`ul`、`li`、`i`、`mark` 等白名单外标签；无原生行为要求时使用 `div` 或 `span`，需要语义时使用 ARIA 属性补充。
- Vue 组件统一使用 PascalCase，禁止用小写组件名绕过或混淆原生标签检查。
- SFC 的 `script`、`template`、`style` 块、`index.html` 文档骨架及独立 SVG 资源不受此 Vue/TS 规则约束。

## TypeScript 与源码

- 源码、脚本和工具配置使用 `.ts`、`.tsx` 或 `.vue`，不新增 JavaScript 源文件。
- 导入项目内文件时必须显式携带 `.ts`、`.tsx` 或 `.vue` 扩展名。
- 遵守严格 TypeScript 配置，不使用 `any`、非必要类型断言或 `@ts-ignore` 绕过类型检查。
- 仅作为类型使用的符号通过 `import type` 导入。
- 保持现有代码风格：单引号、无分号、尾随逗号。

## Vue 组件

- Vue 组件使用 `<script setup lang="ts">` 和 PascalCase 文件名。
- 通用、可跨业务场景复用的基础组件统一放在 `src/components/base/`，组件名和文件名必须以 `Wu` 开头，例如 `WuSvg.vue`。
- 页面或领域功能组件可使用描述业务职责的名称，例如 `MapCanvas.vue`、`RoutePanel.vue`；不要为了满足前缀规则把领域组件伪装成基础组件。
- 组件 props、emits 必须声明明确类型；事件名称表达发生的事实或用户意图。
- `useTemplateRef` 的模板引用键统一使用对应变量名加 `Ref` 后缀，例如变量 `viewport` 使用 `useTemplateRef('viewportRef')`，模板同步声明 `ref="viewportRef"`，避免字符串键与变量同名。
- 业务状态和共享状态只能通过 Pinia 的命名 action 修改；用户事件、生命周期和异步回调必须显式调用相应 action。
- Pinia 业务状态使用一个或多个 `shallowRef` 保存；基本类型及完整快照可直接整值替换，数组、对象等非基本类型的增量修改必须通过 Immer `produce` 生成新快照，不直接修改 `.value` 内部数据。
- `computed` 保持纯计算，不修改其他状态或触发网络、存储和 Worker 等副作用。
- 小型、无循环的 JSON-like 派生对象需要稳定引用时使用 `useEqualComputed`；始终完整计算候选值后再比较，不用于完整地图数据集等大型结构。
- Store 对外只暴露只读状态和命名 action，不暴露可由调用方直接修改的响应式对象。
- 不使用 watcher 隐式修改业务状态或启动业务流程。
- watcher 仅用于 OpenLayers、DOM、Worker 等命令式适配，并负责在组件卸载时释放资源。
- 浏览器 API、异步状态和常见响应式工具优先评估 `@vueuse/core`；仅在能减少生命周期清理或样板代码时采用，不用 VueUse 替代领域 action、Worker 消息协议或简单纯计算。

## 样式

- 使用 UnoCSS，固定启用 `presetWind4()` 和 `presetAttributify()`；组件布局、间距、尺寸、颜色、排版、状态和响应式样式优先使用原子类或 Attributify 属性表达。
- 仅当原子类无法表达时才新增 `style` 或全局 CSS，例如第三方库内部选择器、浏览器级根样式或必须复用的复杂伪元素规则。
- 不为可由原子类表达的样式新增语义类选择器、组件级 `<style>` 或 `@apply`。
- 动态原子类必须以完整静态字符串出现在源码中，避免运行时拼接导致 UnoCSS 无法扫描。

## SVG 图标

- UI SVG 图标放在 `src/assets/svg/`，通过 `WuSvg` 按不含扩展名的文件名使用，不在业务组件中重复粘贴 SVG 标记。
- SVG 文件的根 `<svg>` 只能包含 `viewBox` 属性，不设置 `xmlns`、`fill`、`stroke`、`width`、`height`、`class` 或 `style`。
- `fill`、`stroke`、`stroke-width`、`stroke-linecap`、`stroke-linejoin` 等呈现属性写在 `<path>`、`rect` 等内部元素上；单色图标使用 `currentColor`。
- 图标仅作装饰时不传 `label`；表达独立含义时为 `WuSvg` 提供简洁的 `label`。

## 地图与数据领域约束

- 只收录至少属于一个合鸣套装的 C1/C3 声骸；C4 BOSS、无套装公共/特殊声骸及其他怪物不进入声骸业务数据。
- 游戏内人工录入的整数 XYZ 是路线规划的权威坐标。官方点位转换为独立的 `data/generated/official-points.json`，按用户要求以 Z=0 占位参与展示和路线测试，必须标明来源，不将占位高度视为实测。
- 地图渲染可只使用 XY；分层筛选和路线距离计算必须保留并使用 Z。
- 官方地图抓取结果与人工坐标数据保持来源可追踪，避免直接手改生成数据；同步后运行 `pnpm data:validate`。
- 地图点位保持批量 Canvas/WebGL 渲染，不为每个点位创建独立 DOM 交互节点。
- 纳入项目范围的传送点、交通点、入口、挑战/秘境和服务地标默认全部显示；宝箱、采集物、任务、解谜、观景点及白名单外怪物不进入定位点数据。
- BOSS 仅作为可传送定位点显示，不作为声骸目标；BOSS 和官方副本挑战统一标记为可传送。人工定位点需核验 XYZ；官方导入点允许以 Z=0 测试路线，并在界面提示。
- 定位点显示筛选按图标内容分组；同一图标组可包含多个官方类型，但每个真实点位的传送模式、缩放等级和坐标数据保持独立。
- 点位是否显示与是否可参与路线相互独立。确认可直接传送且已人工核验 XYZ 的定位点可作为路线起点；官方导入数据按上述 Z=0 测试规则处理。
- 地图点位使用缩放级别分层显示：远景优先保留中枢/信标，放大后逐步显示功能点、入口、服务地标和声骸；手动类型过滤优先于自动缩放显示。

## URL 会话状态

- 可复现当前页面渲染的核心简单状态写入 URL，包括地图范围、筛选、图层开关、核心组件配置和地图视口。
- URL query 由 Vue Router 与 `@vueuse/router` 的 `useRouteQuery` 管理，不直接操作 `URLSearchParams` 或调用 `history.replaceState`。
- 每个 query 字段必须声明默认值；状态等于默认值时从 URL 中移除，根页面的完整默认状态保持为 `/`。
- 搜索输入、加载与错误、进行中任务、路线计算结果等临时或可派生状态不写入 URL。
- URL 数据在恢复前必须结合当前数据集校验，忽略未知地图、楼层、声骸、合鸣 ID 和非法数值。
- 地图视口仅在整体交互结束后更新；保持 `useRouteQuery` 的 `replace` 模式，不为拖动、缩放和筛选制造浏览历史记录。
- 定位点图标分组默认全部显示；URL 只通过 `hiddenTypes` 保存被隐藏的图标分组 ID，不保存冗长的已选分组全集。

## 文件与变更边界

- 保留用户已有改动，不覆盖无关文件或生成物。
- 不提交 `dist/`、临时抓取文件、日志或本地环境配置。
- 新增数据结构时同步更新 `src/domain/types.ts`、`src/domain/schema.ts`、校验脚本及对应测试。
