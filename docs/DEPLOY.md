# DEPLOY — 部署说明

本项目是**纯静态站点**：没有构建步骤、没有依赖、没有服务端。所以部署只有一步——把仓库发布出去。

## 方案一：GitHub Pages（本项目采用）

1. 打开仓库 **Settings → Pages**；
2. *Source* 选 **Deploy from a branch**；
3. Branch 选 `main`，目录选 `/ (root)`，保存；
4. 等 1–2 分钟，站点会发布在：

```
https://<用户名>.github.io/<仓库名>/
```

本项目对应：**https://yewildy.github.io/yuansu-pixel-sandbox/**

> 为什么不用 GitHub Actions 工作流？
> 因为 `main` 分支只能由远程仓库的 owner 自行写入工作流文件；而本项目由脚本化流程推送，
> 用 *Deploy from a branch* 这种"零配置"方式是等价的，而且更不容易因为权限问题失败。
> 见 `docs/ARCHITECTURE.md` 的部署小节。

## 方案二：任意静态托管

因为不需要构建，直接把仓库根目录丢给任何静态托管即可：

| 平台 | 做法 |
|---|---|
| Netlify | 拖拽整个文件夹到部署面板 |
| Vercel | `vercel --prod`（无需配置文件） |
| Cloudflare Pages | 连接仓库，Build command 留空，输出目录填 `/` |
| 自建 Nginx | 把仓库根目录设为 `root` |

## 方案三：本地跑

```bash
# 直接双击
index.html

# 或者起个静态服务器（推荐，便于测移动端）
python -m http.server 8080     # 然后打开 http://localhost:8080
```

> 本项目**刻意不用 ES Module**，所以 `file://` 双击也能正常跑（不会被 CORS 拦）。
> 如果你引入了模块化的第三方库，就必须改用方案二/三的服务器方式。

## 缓存与更新

纯静态资源没有 hash 文件名，浏览器可能缓存旧版本。发新版后如果用户看到的是旧界面，让他 **Ctrl/Cmd + Shift + R** 强制刷新即可。
