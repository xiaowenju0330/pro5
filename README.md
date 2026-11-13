# 🐝 游戏大厅（Go + Vue 3 + Vite）

个人学习项目：**Go (Gin) 后端 + Vue 3 / Vite 前端** 的网页小游戏合集，目前包含经典「小蜜蜂」编队射击游戏，后续扩展更多小游戏。

## 玩法（小蜜蜂）

- `← →` 或 `A / D`：左右移动
- `空格` / `↑` / `W`：发射蜂蜜弹
- `X`：发射核弹（每局 10 发，穿透震碎蜜蜂与敌弹）
- `P`：暂停
- 第一排蜜蜂是**蜂王**（血量 2，得分 200），普通蜜蜂 100 分，过关奖励 100 分
- 开始界面可切换蜜蜂 / 大炮皮肤（大炮各有不同射速、弹体、伤害参数）

## 运行

### 开发模式（前端热更新）

```powershell
# 终端 1：启动 Go 后端（API 服务，端口 8080）
go run ./backend

# 终端 2：启动 Vite 开发服务器（端口 5173，/api 自动代理到 8080）
cd frontend
npm run dev
```

浏览器打开 http://localhost:5173

### 生产模式（一键构建单文件 exe）

```powershell
.\deploy.ps1
.\beegame.exe
```

浏览器打开 http://localhost:8080

> 脚本会自动执行 `npm run build`（产物输出到 `backend/dist`）+ `go build`，
> 前端页面通过 `go:embed` **内嵌进 exe**——部署到任何电脑只需复制 `beegame.exe`
> 这一个文件，无需安装 Node.js 或其他依赖。排行榜数据 `leaderboard.json`
> 在 exe 所在目录自动生成。

> Go 依赖下载失败时：`$env:GOPROXY='https://goproxy.cn,direct'`

## 项目结构

```
backend/main.go              Gin 服务器：排行榜 API + 托管前端构建产物
frontend/
├── package.json             前端依赖清单（vue / vite / @vitejs/plugin-vue）
├── vite.config.js           Vite 配置（dev 代理 /api → 8080，产物输出 dist/）
├── index.html               Vite 入口 HTML
├── src/
│   ├── main.js              Vue 应用入口
│   ├── App.vue              根组件：大厅 ↔ 各游戏视图切换
│   ├── components/
│   │   ├── GameLobby.vue    游戏大厅（图标卡片入口）
│   │   └── BeeGameView.vue  小蜜蜂游戏视图（HUD/菜单/结算/排行榜/皮肤）
│   ├── engine/
│   │   └── beeEngine.js     游戏引擎（Canvas）：蜜蜂/大炮皮肤、碰撞、难度递增
│   └── assets/
│       ├── global.css       全局样式
│       └── bee.css          小蜜蜂游戏样式
backend/dist/                npm run build 产物（被 go:embed 打包进 exe，已 gitignore）
deploy.ps1                   一键构建部署脚本
leaderboard.json             运行时自动生成的排行榜数据（前 10 名）
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/leaderboard` | 获取排行榜 |
| POST | `/api/leaderboard` | 提交成绩 `{name, score, wave}` |
