package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// go:embed 把前端构建产物（backend/dist）直接打包进可执行文件，
// 编译出的 exe 自带全部页面资源，部署时只需复制这一个文件。
// 注意：dist 由 `npm run build` 生成（vite.config.js 中 outDir 指向此处）。
//
//go:embed all:dist
var distFS embed.FS

// ---------- 排行榜数据 ----------

type ScoreRecord struct {
	Name     string `json:"name"`
	Score    int    `json:"score"`
	Wave     int    `json:"wave"`
	CreateAt string `json:"createAt"`
}

type Leaderboard struct {
	mu     sync.Mutex
	Items  []ScoreRecord
	MaxLen int
	File   string
}

func NewLeaderboard(file string, maxLen int) *Leaderboard {
	lb := &Leaderboard{MaxLen: maxLen, File: file}
	lb.load()
	return lb
}

func (lb *Leaderboard) load() {
	data, err := os.ReadFile(lb.File)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &lb.Items)
}

func (lb *Leaderboard) save() {
	data, err := json.MarshalIndent(lb.Items, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(lb.File, data, 0644)
}

func (lb *Leaderboard) Add(rec ScoreRecord) []ScoreRecord {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	rec.CreateAt = time.Now().Format("2006-01-02 15:04:05")
	lb.Items = append(lb.Items, rec)
	sort.SliceStable(lb.Items, func(i, j int) bool {
		return lb.Items[i].Score > lb.Items[j].Score
	})
	if len(lb.Items) > lb.MaxLen {
		lb.Items = lb.Items[:lb.MaxLen]
	}
	lb.save()
	return lb.Items
}

func (lb *Leaderboard) Top() []ScoreRecord {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	out := make([]ScoreRecord, len(lb.Items))
	copy(out, lb.Items)
	return out
}

// ---------- HTTP 处理 ----------

type SubmitScoreReq struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
	Wave  int    `json:"wave"`
}

func main() {
	lb := NewLeaderboard("leaderboard.json", 10)

	router := gin.Default()

	// API
	api := router.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})
		// 昆仑关双人在线（局域网共斗）房间 WebSocket 入口
		api.GET("/room/ws", handleRoomWS)
		api.GET("/leaderboard", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"items": lb.Top()})
		})
		api.POST("/leaderboard", func(c *gin.Context) {
			var req SubmitScoreReq
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
				return
			}
			if req.Score < 0 || req.Score > 10_000_000 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "分数不合法"})
				return
			}
			name := req.Name
			if name == "" {
				name = "无名蜂农"
			}
			items := lb.Add(ScoreRecord{Name: name, Score: req.Score, Wave: req.Wave})
			c.JSON(http.StatusOK, gin.H{"items": items})
		})
	}

	// 静态资源：从嵌入的 dist 文件系统中读取（Vue 前端构建产物）
	// 开发时：npm run dev（Vite 热更新，/api 代理到本服务）
	// 部署时：单个 exe 内嵌全部页面，复制到任何机器运行即可
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(dist))

	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// API 的未知路径返回 404 JSON
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		// dist 中存在对应文件则直接返回（页面 JS/CSS/图标等）
		if f, err := dist.Open(strings.TrimPrefix(path, "/")); err == nil {
			f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		// SPA 回退：其余路径统一返回首页，视图由前端切换
		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})

	addr := ":8080"
	println("小蜜蜂游戏已启动: http://localhost" + addr)
	if err := router.Run(addr); err != nil {
		panic(err)
	}
}
