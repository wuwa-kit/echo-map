# 开发与命令

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
pnpm data:convert-official # 将现有官方快照转换为独立点位 JSON，Z=0
pnpm data:validate     # 校验白名单、关联和坐标数据
pnpm data:check-assets # 联网检查官方图片原图、预览和地图加载 URL
pnpm typecheck         # Vue + TypeScript 类型检查
pnpm test              # 单元测试与生成数据契约测试
pnpm build             # 数据校验、类型检查和生产构建
pnpm check             # 完整检查
```

## 构建行为

生产构建不会访问远程 API，会验证已有地图快照和两份点位文件。更新官方点位时显式执行 `pnpm data:sync`、`pnpm data:convert-official`。构建本身不会重新生成已删除的官方点位文件。

部署时需要将前端路由回退到 `index.html`，以便直接访问 `/assets` 等页面。

官方 CDN 的旧版本瓦片可能被清理；本地结构校验无法发现远程 404。遇到部分地图缺图时，运行 `pnpm data:check-assets` 检查资源。如果版本过期，运行 `pnpm data:sync:map`、`pnpm data:convert-official`、`pnpm check` 和 `pnpm data:check-assets`，然后重新部署。同步会一起更新资源版本、瓦片清单和楼层覆盖范围，不应只手改资源 hash。远程检查独立运行，保持普通构建不依赖网络。

项目中的相对 TypeScript 与 Vue 导入都显式包含 `.ts` 或 `.vue` 后缀。第三方包继续使用其公开的包导入路径，例如 OpenLayers 的 `.js` 子路径。

## 交付检查

交付前运行：

```powershell
pnpm check
```

界面需要在 320×568、390×844、844×390、768×1024 和桌面尺寸下检查筛选、原生下拉框、楼层定位、路线生成、取消与失败重试、面板切换、URL 刷新恢复及根页面 `/`。

另需在 iOS Safari 和 Android Chrome 真机检查双指缩放、键盘弹出与关闭、安全区和横竖屏切换。桌面视口模拟不能替代真机检查。
