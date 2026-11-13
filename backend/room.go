package main

// 昆仑关双人在线（局域网共斗）房间服务
// 架构：服务器担任"敌军指挥官"——刷兵的时机/位置/类型由服务器统一广播，
// 两台客户端各自本地模拟相同的敌军；命中判定在各自本地进行，
// 击杀消息上报服务器去重后广播（先报者得击杀归属），保证双方比分一致。

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// 允许所有来源（局域网联机，无 Cookie 鉴权需求）
var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

// wsMsg 房间消息（前后端共用结构，omitempty 省略空字段）
type wsMsg struct {
	Type    string      `json:"type"`
	SID     int         `json:"sid,omitempty"`   // 敌军流水号：双方据其识别同一只敌军
	PID     int         `json:"pid,omitempty"`   // 玩家编号：1 / 2
	Name    string      `json:"name,omitempty"`
	Etype   string      `json:"etype,omitempty"` // 敌军类型 rifleman/officer/gunner
	X       float64     `json:"x,omitempty"`
	Y       float64     `json:"y,omitempty"`
	StopY   float64     `json:"stopY,omitempty"`
	X1      float64     `json:"x1,omitempty"` // 队友曳光线起点
	Y1      float64     `json:"y1,omitempty"`
	X2      float64     `json:"x2,omitempty"` // 队友曳光线终点
	Y2      float64     `json:"y2,omitempty"`
	Score   int         `json:"score,omitempty"`
	Kills   int         `json:"kills,omitempty"`
	HP      int         `json:"hp,omitempty"`
	Players []wsPlayer  `json:"players,omitempty"` // 房间成员/结算成绩列表
	Text    string      `json:"text,omitempty"`
}

// wsPlayer 房间内单个玩家的成绩快照
type wsPlayer struct {
	PID   int    `json:"pid"`
	Name  string `json:"name"`
	Kills int    `json:"kills"`
	Score int    `json:"score"`
}

type roomPlayer struct {
	id    int
	name  string
	conn  *websocket.Conn
	send  chan []byte
	ready bool
}

type kunlunRoom struct {
	mu       sync.Mutex
	players  map[int]*roomPlayer
	nextPID  int
	nextSID  int
	phase    string // waiting | playing | over
	stopCh   chan struct{}
	deadSIDs map[int]bool // 已判定击杀的敌军：去重，防止双方同时上报同一目标
	killsOf  map[int]int
	scoreOf  map[int]int
}

var room = &kunlunRoom{
	players:  map[int]*roomPlayer{},
	phase:    "waiting",
	deadSIDs: map[int]bool{},
	killsOf:  map[int]int{},
	scoreOf:  map[int]int{},
}

// broadcast 向房间内所有玩家推送消息（内部短暂加锁，快照后逐个投递）
func (r *kunlunRoom) broadcast(m wsMsg) {
	data, err := json.Marshal(m)
	if err != nil {
		return
	}
	r.mu.Lock()
	targets := make([]*roomPlayer, 0, len(r.players))
	for _, p := range r.players {
		targets = append(targets, p)
	}
	r.mu.Unlock()
	for _, p := range targets {
		select {
		case p.send <- data: // 64 缓冲，写满则丢弃（局域网下极少发生）
		default:
		}
	}
}

// snapshot 当前房间成员列表（含服务器统计的成绩）。调用方若已持有 mu，请用 snapshotLocked
func (r *kunlunRoom) snapshot() []wsPlayer {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.snapshotLocked()
}

// snapshotLocked 无锁版本：仅在已持有 mu 时调用
func (r *kunlunRoom) snapshotLocked() []wsPlayer {
	list := make([]wsPlayer, 0, len(r.players))
	for _, p := range r.players {
		list = append(list, wsPlayer{PID: p.id, Name: p.name, Kills: r.killsOf[p.id], Score: r.scoreOf[p.id]})
	}
	return list
}

// maybeStart 双方都已准备时开局：广播 start 并启动敌军指挥官协程
func (r *kunlunRoom) maybeStart() {
	r.mu.Lock()
	if len(r.players) != 2 || r.phase == "playing" {
		r.mu.Unlock()
		return
	}
	for _, p := range r.players {
		if !p.ready {
			r.mu.Unlock()
			return // 还有人在匹配界面未点"准备"
		}
	}
	r.phase = "playing"
	r.deadSIDs = map[int]bool{}
	r.killsOf = map[int]int{}
	r.scoreOf = map[int]int{}
	r.stopCh = make(chan struct{})
	players := r.snapshotLocked()
	r.mu.Unlock()

	r.broadcast(wsMsg{Type: "start", Players: players})
	go r.commander()
	log.Println("[房间] 开局：双方已就绪")
}

// commander 敌军指挥官：按时间递增的节奏生成敌军参数并广播（权威刷兵源）
func (r *kunlunRoom) commander() {
	elapsed := 0.0
	for {
		select {
		case <-r.stopCh:
			return
		default:
		}
		interval := 1.8 - elapsed*0.005 // 与单人模式相同的难度曲线
		if interval < 0.8 {
			interval = 0.8
		}
		interval += rand.Float64() * 0.5
		time.Sleep(time.Duration(interval * float64(time.Second)))
		elapsed += interval

		roll := rand.Float64()
		etype := "rifleman"
		if roll > 0.85 {
			etype = "gunner"
		} else if roll > 0.6 {
			etype = "officer"
		}
		m := wsMsg{Type: "spawn", Etype: etype}
		r.mu.Lock()
		r.nextSID++
		m.SID = r.nextSID
		m.X = 50 + rand.Float64()*700
		m.Y = 290 + rand.Float64()*40
		if etype == "gunner" {
			m.StopY = m.Y // 重机枪手原地火力点
		} else {
			m.StopY = 460 + rand.Float64()*70
		}
		r.mu.Unlock()
		r.broadcast(m)
	}
}

// endGame 结束当前局：停止指挥官，等待双方重新准备
func (r *kunlunRoom) endGame() {
	r.mu.Lock()
	if r.phase != "playing" {
		r.mu.Unlock()
		return
	}
	r.phase = "over"
	if r.stopCh != nil {
		close(r.stopCh)
		r.stopCh = nil
	}
	for _, p := range r.players {
		p.ready = false
	}
	r.mu.Unlock()
}

// removePlayer 玩家断线：移出房间，若对局中则通知对方并结束本局
func (r *kunlunRoom) removePlayer(p *roomPlayer) {
	r.mu.Lock()
	if _, ok := r.players[p.id]; !ok {
		r.mu.Unlock()
		return
	}
	delete(r.players, p.id)
	wasPlaying := r.phase == "playing"
	r.mu.Unlock()

	if wasPlaying {
		r.endGame() // 在锁外调用：endGame 内部会加锁，Go 的 Mutex 不可重入
	}
	close(p.send)
	r.broadcast(wsMsg{Type: "leave", PID: p.id, Name: p.name})
	log.Printf("[房间] 玩家 %s(P%d) 断线", p.name, p.id)
}

// handleRoomWS WebSocket 入口：/api/room/ws?name=玩家名
func handleRoomWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	name := c.Query("name")
	if name == "" {
		name = "无名壮士"
	}

	room.mu.Lock()
	if len(room.players) >= 2 {
		room.mu.Unlock()
		full, _ := json.Marshal(wsMsg{Type: "full", Text: "房间已满（2 人）"})
		conn.WriteMessage(websocket.TextMessage, full)
		conn.Close()
		return
	}
	room.nextPID++
	p := &roomPlayer{id: room.nextPID, name: name, conn: conn, send: make(chan []byte, 64)}
	room.players[p.id] = p
	room.mu.Unlock()

	// 直接告知新玩家：自己的编号 + 房间现状（writePump 启动前 send 有 64 缓冲，不会丢）
	if data, err := json.Marshal(wsMsg{Type: "welcome", PID: p.id, Players: room.snapshot()}); err == nil {
		p.send <- data
	}
	log.Printf("[房间] 玩家 %s 加入为 P%d", name, p.id)
	room.broadcast(wsMsg{Type: "wait", Players: room.snapshot()})

	go writePump(p)
	go readPump(room, p)
}

// writePump 发送协程：把 send 通道里的消息写回 WebSocket
func writePump(p *roomPlayer) {
	for data := range p.send {
		if err := p.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

// readPump 接收协程：处理客户端上报的各类消息
func readPump(r *kunlunRoom, p *roomPlayer) {
	defer func() { r.removePlayer(p) }()
	for {
		_, data, err := p.conn.ReadMessage()
		if err != nil {
			return
		}
		var m wsMsg
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.Type {
		case "ready": // 准备/再来一场
			r.mu.Lock()
			p.ready = true
			r.mu.Unlock()
			r.broadcast(wsMsg{Type: "wait", Players: r.snapshot()})
			r.maybeStart()

		case "kill": // 击杀上报：去重后广播归属（先报者得）
			r.mu.Lock()
			dup := r.deadSIDs[m.SID]
			if !dup {
				r.deadSIDs[m.SID] = true
				r.killsOf[p.id]++
				r.scoreOf[p.id] += m.Score
			}
			r.mu.Unlock()
			if !dup {
				r.broadcast(wsMsg{Type: "kill", SID: m.SID, PID: p.id, Score: m.Score})
			}

		case "dead": // 一方阵亡：本局结束，广播双方成绩
			r.mu.Lock()
			r.phase = "over"
			if r.stopCh != nil {
				close(r.stopCh)
				r.stopCh = nil
			}
			for _, pl := range r.players {
				pl.ready = false
			}
			result := r.snapshotLocked() // 持锁期间用无锁快照，避免重入死锁
			r.mu.Unlock()
			r.broadcast(wsMsg{Type: "over", Players: result})

		case "pos", "hp", "shot", "boom": // 位置/生命/特效：转发给队友
			m.PID = p.id
			r.broadcastExcept(p.id, m)
		}
	}
}

// broadcastExcept 推送给除指定玩家外的所有人
func (r *kunlunRoom) broadcastExcept(pid int, m wsMsg) {
	data, err := json.Marshal(m)
	if err != nil {
		return
	}
	r.mu.Lock()
	targets := make([]*roomPlayer, 0, len(r.players))
	for _, pl := range r.players {
		if pl.id != pid {
			targets = append(targets, pl)
		}
	}
	r.mu.Unlock()
	for _, pl := range targets {
		select {
		case pl.send <- data:
		default:
		}
	}
}
