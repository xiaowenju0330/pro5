<script setup>
// 血战昆仑关射击游戏视图：鼠标操控 + 机枪/狙击(8倍镜)/大炮/手榴弹
// 支持两种模式：单人闯关 / 双人在线（局域网共斗，WebSocket 房间）
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { WEAPONS, KunlunGame } from '../engine/kunlunEngine.js';
import '../assets/kunlun.css'; // 本游戏专用样式

const emit = defineEmits(['back']);

const state = ref('menu'); // menu | waiting | playing | over
const hud = reactive({
  score: 0, kills: 0, hp: 100, heat: 0, overheated: false,
  ammo: [Infinity, 20, 8, 10], weapon: 0, scoped: false, supply: 45,
  netMode: false, myPid: 0, remote: null,
});
const playerName = ref(localStorage.getItem('beePlayerName') || '');
const submitted = ref(false);
const leaderboard = ref([]);

// 联机状态
let ws = null;
const myPid = ref(0);
const roomPlayers = ref([]);   // 房间成员列表 [{pid, name, kills, score}]
const myReady = ref(false);    // 本机是否已点击"准备"
const netResults = ref(null);  // 联机结算：服务器下发的双方成绩
const netNotice = ref('');     // 联机提示（房间满/断线等）

const canvasRef = ref(null);
let game = null;

async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    leaderboard.value = data.items || [];
  } catch (e) { /* 忽略网络错误 */ }
}

/* ---------- 单人模式 ---------- */
function startGame() {
  cleanupNet();
  submitted.value = false;
  netResults.value = null;
  state.value = 'playing';
  game.start();
}

/* ---------- 双人在线（局域网共斗） ---------- */
// 连接房间 WebSocket：两人在同一房间准备就绪后由服务器统一开局
function connectNet() {
  cleanupNet();
  const name = playerName.value.trim() || '无名壮士';
  localStorage.setItem('beePlayerName', name);
  submitted.value = false;
  netResults.value = null;
  netNotice.value = '';
  myReady.value = false;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/room/ws?name=${encodeURIComponent(name)}`);
  ws.onmessage = (ev) => handleNetMsg(JSON.parse(ev.data));
  ws.onclose = () => {
    if (state.value === 'playing' || state.value === 'waiting') {
      netNotice.value = '连接已断开（服务器关闭或对方退出）';
      game.endByNet();
      state.value = 'menu';
    }
  };
  state.value = 'waiting';
}

function handleNetMsg(m) {
  switch (m.type) {
    case 'welcome': // 服务器告知：我的编号 + 房间现状
      myPid.value = m.pid;
      roomPlayers.value = m.players || [];
      break;
    case 'wait': // 房间成员变化
      roomPlayers.value = m.players || [];
      break;
    case 'start': // 双方就绪，服务器统一开局
      startNetGame(m.players || []);
      break;
    case 'spawn': case 'kill': case 'pos': case 'hp': case 'shot': case 'boom':
      if (game) game.handleNet(m); // 战场消息直接转给引擎
      break;
    case 'over': // 一方阵亡：本局结束，展示双方成绩
      game.endByNet();
      netResults.value = m.players || [];
      state.value = 'over';
      fetchLeaderboard();
      break;
    case 'leave': // 对方断线
      netNotice.value = '对方已离开房间';
      if (game) game.endByNet();
      state.value = 'menu';
      break;
    case 'full':
      netNotice.value = m.text || '房间已满';
      cleanupNet();
      state.value = 'menu';
      break;
  }
}

// 服务器宣布开局：把联机参数注入引擎（本地不再刷兵，击杀上报结算）
function startNetGame(players) {
  const me = players.find((p) => p.pid === myPid.value);
  const mate = players.find((p) => p.pid !== myPid.value);
  state.value = 'playing';
  game.startNet(
    myPid.value,
    { pid: mate.pid, name: mate.name, kills: 0, score: 0, hp: 100 },
    (msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg)),
  );
  console.log('开局', me?.name, 'vs/和', mate?.name);
}

// 联机模式下点"准备"（首次进入或再来一场时）
function netReady() {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'ready' }));
    myReady.value = true;
  }
}

function cleanupNet() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

/* ---------- 成绩提交 ---------- */
async function submitScore() {
  if (submitted.value) return;
  const name = playerName.value.trim() || '无名壮士';
  localStorage.setItem('beePlayerName', name);
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // wave 字段复用为击杀数，与排行榜 API 兼容
      body: JSON.stringify({ name, score: hud.score, wave: hud.kills }),
    });
    const data = await res.json();
    if (data.items) leaderboard.value = data.items;
    submitted.value = true;
  } catch (e) {
    alert('提交失败，请稍后再试');
  }
}

// 弹药显示：Infinity 显示 ∞
function ammoText(i) {
  const a = hud.ammo[i];
  return a === Infinity ? '∞' : a;
}

// 结算界面按钮：联机模式回到房间重新准备，单人直接开局
function replay() {
  if (hud.netMode && ws && ws.readyState === 1) {
    state.value = 'waiting';
    netResults.value = null;
    netReady();
  } else {
    startGame();
  }
}

onMounted(() => {
  game = new KunlunGame(canvasRef.value, {
    // 引擎每帧推送 HUD 状态，直接写入响应式对象驱动界面刷新
    onHUD: (h) => Object.assign(hud, h),
    // 单人模式阵亡回调（联机模式的结算走服务器 over 消息）
    onGameOver: () => {
      state.value = 'over';
      fetchLeaderboard();
    },
  });
  window.__kunlunGame = game; // 调试入口：控制台可直接查看引擎内部状态
  fetchLeaderboard();
});

onUnmounted(cleanupNet);
</script>

<template>
  <div class="game-page">
    <div class="kl-shell">
      <!-- 返回大厅 -->
      <a class="back-link" @click="emit('back')">🏠 返回大厅</a>

      <!-- 顶部状态栏 -->
      <div class="kl-topbar" v-if="state === 'playing'">
        <div class="kl-stat">得分 <b>{{ hud.score }}</b></div>
        <div class="kl-stat">击杀 <b>{{ hud.kills }}</b></div>
        <div class="kl-hpbar">
          <div class="kl-hpfill" :style="{ width: hud.hp + '%' }"
               :class="{ low: hud.hp <= 30 }"></div>
          <span class="kl-hptext">生命 {{ hud.hp }}</span>
        </div>
        <div class="kl-stat supply">补给 {{ hud.supply }}s</div>
        <!-- 联机模式：队友状态 -->
        <div class="kl-stat mate" v-if="hud.netMode && hud.remote">
          🤝 {{ hud.remote.name }} · 击杀{{ hud.remote.kills }} · 分{{ hud.remote.score }} · ❤{{ hud.remote.hp }}
        </div>
      </div>

      <!-- 游戏画布（鼠标瞄准区域） -->
      <canvas ref="canvasRef" width="800" height="600" class="kl-canvas"></canvas>

      <!-- 武器栏 -->
      <div class="kl-weapons" v-if="state === 'playing'">
        <div
          v-for="(w, i) in WEAPONS"
          :key="w.id"
          class="kl-wslot"
          :class="{ active: hud.weapon === i, empty: hud.ammo[i] <= 0 }"
          @click="game.selectWeapon(i)"
        >
          <span class="key">{{ i + 1 }}</span>
          <span class="wname">{{ w.name }}</span>
          <span class="ammo">{{ ammoText(i) }}</span>
          <i v-if="i === 1" class="scope-tip">右键8倍镜</i>
        </div>
        <!-- 机枪枪管热量条 -->
        <div class="kl-heat" v-if="hud.weapon === 0">
          <div class="kl-heatfill" :class="{ hot: hud.overheated }"
               :style="{ width: hud.heat + '%' }"></div>
          <span v-if="hud.overheated" class="heat-warn">枪管过热！</span>
        </div>
      </div>

      <!-- 开始界面 -->
      <div class="kl-overlay" v-if="state === 'menu'">
        <h1>🎖️ 血战昆仑关</h1>
        <p class="sub">1939 · 昆仑关战役（个人学习演示）</p>
        <ul class="help">
          <li>鼠标瞄准，左键射击</li>
          <li>右键按住 = 8 倍镜（仅狙击枪，鼠标移动微调瞄准）</li>
          <li>数字键 1/2/3/4 或点击下方图标切换武器</li>
          <li>机枪：无限连发，注意枪管过热</li>
          <li>大炮 / 手榴弹：抛物线弹道，落点范围杀伤</li>
          <li>无关卡模式：敌军持续进攻，每 45 秒空投补给补满弹药</li>
          <li>双人在线：局域网两人同战一张地图，击杀各自计分</li>
          <li>M 键：开/关音效</li>
        </ul>
        <p class="net-err" v-if="netNotice">{{ netNotice }}</p>
        <div class="over-btns">
          <button class="btn primary" @click="startGame">进入战场（单人）</button>
          <button class="btn" @click="connectNet">🤝 双人在线</button>
        </div>
      </div>

      <!-- 联机等待界面 -->
      <div class="kl-overlay" v-if="state === 'waiting'">
        <h2>🤝 双人在线 · 局域网共斗</h2>
        <p class="sub">房间成员（{{ roomPlayers.length }}/2）· 我是 P{{ myPid }}</p>
        <ul class="help">
          <li v-for="p in roomPlayers" :key="p.pid">P{{ p.pid }} · {{ p.name }}</li>
        </ul>
        <p class="sub" v-if="myReady">已准备，等待队友就绪后自动开局…</p>
        <p class="sub" v-else>两人都点击"准备"后开始战斗</p>
        <div class="over-btns">
          <button class="btn primary" @click="netReady" :disabled="myReady">
            {{ myReady ? '已准备' : '准备' }}
          </button>
          <button class="btn" @click="state = 'menu'; cleanupNet()">取消</button>
        </div>
      </div>

      <!-- 结算界面 -->
      <div class="kl-overlay" v-if="state === 'over'">
        <h2>{{ hud.netMode ? '🎖️ 战斗结束' : '🩹 阵亡' }}</h2>
        <!-- 联机结算：双方成绩对比 -->
        <div class="net-results" v-if="netResults && netResults.length">
          <div class="net-row" v-for="p in netResults" :key="p.pid"
               :class="{ me: p.pid === myPid }">
            <span>P{{ p.pid }} {{ p.name }}{{ p.pid === myPid ? '（我）' : '' }}</span>
            <span>击杀 <b>{{ p.kills }}</b> · 得分 <b>{{ p.score }}</b></span>
          </div>
        </div>
        <p class="final-score" v-else>击杀 <b>{{ hud.kills }}</b> 名敌军 · 得分 <b>{{ hud.score }}</b></p>
        <div class="submit-box">
          <input v-model="playerName" maxlength="12" placeholder="输入你的名字" @keyup.enter="submitScore" />
          <button class="btn primary" @click="submitScore" :disabled="submitted">
            {{ submitted ? '已提交' : '提交成绩' }}
          </button>
        </div>
        <div class="leaderboard" v-if="leaderboard.length">
          <h3>🏆 英雄榜</h3>
          <table>
            <tr><th>排名</th><th>玩家</th><th>得分</th><th>击杀</th></tr>
            <tr v-for="(item, i) in leaderboard" :key="i">
              <td>{{ i + 1 }}</td><td>{{ item.name }}</td>
              <td>{{ item.score }}</td><td>{{ item.wave }}</td>
            </tr>
          </table>
        </div>
        <div class="over-btns">
          <button class="btn primary" @click="replay">
            {{ hud.netMode ? '再战一场' : '再战一场' }}
          </button>
          <button class="btn" @click="emit('back')">返回大厅</button>
        </div>
      </div>
    </div>

    <!-- 站点声明 -->
    <footer class="site-notice">
      <p>本站为个人技术学习与作品展示站点，主要用于记录本人学习 Web 开发（Go、Vue 等技术）过程中的笔记与练习成果，并展示个人独立开发的小游戏 Demo 供学习交流。网站不提供游戏运营、充值、对战等商业服务，不涉及任何收费项目，仅为个人非经营性学习展示用途。</p>
    </footer>
  </div>
</template>
