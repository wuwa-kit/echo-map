# 声巡 · 鸣潮声骸地图

声巡是一张面向《鸣潮》声骸刷取的交互地图，支持按声骸、合鸣套装、定位点和楼层筛选，并使用 XYZ 坐标规划三维刷取路线。

在线访问：[wuwa-echo-map.pages.dev](https://wuwa-echo-map.pages.dev)

## 主要功能

- 浏览官方地表与分层地图，按缩放级别显示地区、声骸和传送定位点。
- 筛选至少属于一个合鸣套装的 C1/C3 声骸，生成刷取路线并导出路线长图。
- 同时展示人工实测点与官方导入点，明确区分实测高度和 Z=0 占位高度。
- 适配桌面端和移动端，并通过 URL 恢复地图、楼层、筛选与视口状态。
- 浏览项目收录的官方图鉴、图标、地图瓦片和数据快照。
- 通过本地开发页录入、核验和维护人工点位。

项目不收录 C4 BOSS、宝箱、采集物、任务、解谜和其他普通怪物。BOSS 只作为可传送定位点显示，不作为声骸目标。

## 快速开始

```powershell
pnpm install
pnpm data:sync
pnpm dev
```

本机工具链由 mise 根据 `package.json` 中的 `devEngines` 自动选择。完整的环境要求、命令和检查流程见[开发与命令](docs/development.md)。

## 文档

- [开发与命令](docs/development.md)
- [地图交互与路线规划](docs/map-and-route.md)
- [数据来源与结构](docs/data.md)
- [官方资产浏览](docs/asset-browser.md)
- [人工点位录入](docs/point-editor.md)

项目使用 pnpm、Node.js、TypeScript、Vue 3、OpenLayers、Pinia 和 UnoCSS 构建。
