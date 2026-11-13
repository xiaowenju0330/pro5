<script setup>
// 小蜜蜂游戏视图：Canvas 引擎 + Vue 界面（HUD/菜单/结算/排行榜/皮肤）
import { ref, reactive, onMounted } from 'vue';
import { BEE_STYLES, SHIP_STYLES, BeeGame } from '../engine/beeEngine.js';
import '../assets/bee.css'; // 游戏页样式（HUD/遮罩/排行榜/皮肤选择器等）

const emit = defineEmits(['back']);

const state = ref('menu'); // menu | playing | paused | over
const hud = reactive({ score: 0, lives: 3, wave: 1, nukes: 10 });
const lastScore = ref(0);
const lastWave = ref(1);
const playerName = ref(localStorage.getItem('beePlayerName') || '');
const submitted = ref(false);
const leaderboard = ref([]);

// 皮肤选择（下标），持久化到 localStorage
const beeStyleIdx = ref(Number(localStorage.getItem('beeSkin')) || 0);
const shipStyleIdx = ref(Number(localStorage.getItem('shipSkin')) || 0);
const beeStyleName = () => BEE_STYLES[beeStyleIdx.value].name;
const shipStyleName = () => SHIP_STYLES[shipStyleIdx.value].name;
// 生成当前大炮的参数描述文字（射速 = 每秒发数）
const shipStats = () => {
  const st = SHIP_STYLES[shipStyleIdx.value].stats;
  return `射速 ${(1 / st.cooldown).toFixed(1)} 发/秒 · 弹体 ${st.bulletW}×${st.bulletH}` +
    (st.damage > 1 ? ` · 伤害 ${st.damage}` : '');
};
// 切换皮肤：dir 为 1（下一个）或 -1（上一个），循环滚动
function pickBee(dir) {
  beeStyleIdx.value = (beeStyleIdx.value + dir + BEE_STYLES.length) % BEE_STYLES.length;
  localStorage.setItem('beeSkin', beeStyleIdx.value);
}
function pickShip(dir) {
  shipStyleIdx.value = (shipStyleIdx.value + dir + SHIP_STYLES.length) % SHIP_STYLES.length;
  localStorage.setItem('shipSkin', shipStyleIdx.value);
}

const canvasRef = ref(null);
let game = null;

async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    leaderboard.value = data.items || [];
  } catch (e) { /* 忽略网络错误 */ }
}

function startGame() {
  submitted.value = false;
  state.value = 'playing';
  game.start();
}

function togglePause() {
  if (state.value === 'playing') {
    state.value = 'paused';
    game.stop();
  } else if (state.value === 'paused') {
    state.value = 'playing';
    game.running = true;
  }
}

async function submitScore() {
  if (submitted.value) return;
  const name = playerName.value.trim() || '无名蜂农';
  localStorage.setItem('beePlayerName', name);
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: lastScore.value, wave: lastWave.value }),
    });
    const data = await res.json();
    if (data.items) leaderboard.value = data.items;
    submitted.value = true;
  } catch (e) {
    alert('提交失败，请稍后再试');
  }
}

function onKeyDown(e) {
  if (e.code === 'KeyP' && (state.value === 'playing' || state.value === 'paused')) {
    togglePause();
  }
}

onMounted(() => {
  // 把当前选中的皮肤传给游戏引擎
  game = new BeeGame(canvasRef.value, {
    onScore: (s) => { hud.score = s; },
    onLives: (l) => { hud.lives = l; },
    onWave: (w) => { hud.wave = w; },
    onNukes: (n) => { hud.nukes = n; }, // 更新核弹剩余数量
    onGameOver: (score, wave) => {
      lastScore.value = score;
      lastWave.value = wave;
      state.value = 'over';
      fetchLeaderboard();
    },
  }, { bee: beeStyleIdx.value, ship: shipStyleIdx.value });

  window.addEventListener('keydown', onKeyDown); // P 键暂停/继续
  fetchLeaderboard();
});
</script>

<template>
  <div class="game-page">
    <div class="game-shell">
      <!-- 返回大厅 -->
      <a class="back-link" @click="emit('back')">🏠 返回大厅</a>

      <!-- 顶部 HUD -->
      <div class="hud" v-if="state === 'playing' || state === 'paused'">
        <div class="hud-item">得分 <b>{{ hud.score }}</b></div>
        <div class="hud-item">关卡 <b>{{ hud.wave }}</b></div>
        <div class="hud-item">生命
          <span class="lives">
            <i v-for="n in hud.lives" :key="n">🐝</i>
          </span>
        </div>
        <div class="hud-item">核弹 <b>💥 {{ hud.nukes }}</b></div>
        <button class="btn small" @click="togglePause">{{ state === 'paused' ? '继续' : '暂停' }}</button>
      </div>

      <!-- 游戏画布 -->
      <canvas ref="canvasRef" width="480" height="640"></canvas>

      <!-- 开始界面 -->
      <div class="overlay" v-if="state === 'menu'">
        <h1>🐝 小蜜蜂</h1>
        <p class="sub">经典蜜蜂编队射击</p>
        <ul class="help">
          <li>← → 或 A / D 移动</li>
          <li>空格 / ↑ / W 发射蜂蜜弹</li>
          <li>X 键发射核弹（每局 10 发，穿透震碎蜜蜂与敌弹）</li>
          <li>P 键暂停</li>
        </ul>

        <!-- 皮肤选择器 -->
        <div class="skin-picker">
          <div class="skin-row">
            <span class="skin-label">🐝 蜜蜂</span>
            <button class="btn small arrow" @click="pickBee(-1)">◀</button>
            <span class="skin-name">{{ beeStyleName() }}</span>
            <button class="btn small arrow" @click="pickBee(1)">▶</button>
          </div>
          <div class="skin-row">
            <span class="skin-label">🚀 大炮</span>
            <button class="btn small arrow" @click="pickShip(-1)">◀</button>
            <span class="skin-name">{{ shipStyleName() }}</span>
            <button class="btn small arrow" @click="pickShip(1)">▶</button>
          </div>
          <div class="skin-stats">{{ shipStats() }}</div>
        </div>

        <button class="btn primary" @click="startGame">开始游戏</button>

        <div class="leaderboard" v-if="leaderboard.length">
          <h3>🏆 蜂王排行榜</h3>
          <table>
            <tr><th>排名</th><th>玩家</th><th>得分</th><th>关卡</th></tr>
            <tr v-for="(item, i) in leaderboard" :key="i">
              <td>{{ i + 1 }}</td><td>{{ item.name }}</td>
              <td>{{ item.score }}</td><td>{{ item.wave }}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 暂停界面 -->
      <div class="overlay translucent" v-if="state === 'paused'">
        <h2>⏸ 已暂停</h2>
        <button class="btn primary" @click="togglePause">继续</button>
      </div>

      <!-- 结算界面 -->
      <div class="overlay" v-if="state === 'over'">
        <h2>💥 游戏结束</h2>
        <p class="final-score">本局得分 <b>{{ lastScore }}</b>，抵达第 <b>{{ lastWave }}</b> 关</p>
        <div class="submit-box">
          <input v-model="playerName" maxlength="12" placeholder="输入你的名字" @keyup.enter="submitScore" />
          <button class="btn primary" @click="submitScore" :disabled="submitted">
            {{ submitted ? '已提交' : '提交成绩' }}
          </button>
        </div>
        <div class="leaderboard" v-if="leaderboard.length">
          <h3>🏆 蜂王排行榜</h3>
          <table>
            <tr><th>排名</th><th>玩家</th><th>得分</th><th>关卡</th></tr>
            <tr v-for="(item, i) in leaderboard" :key="i">
              <td>{{ i + 1 }}</td><td>{{ item.name }}</td>
              <td>{{ item.score }}</td><td>{{ item.wave }}</td>
            </tr>
          </table>
        </div>
        <button class="btn" @click="startGame">再来一局</button>
      </div>
    </div>

    <!-- 站点声明 -->
    <footer class="site-notice">
      <p>本站为个人技术学习与作品展示站点，主要用于记录本人学习 Web 开发（Go、Vue 等技术）过程中的笔记与练习成果，并展示个人独立开发的小游戏 Demo 供学习交流。网站不提供游戏运营、充值、对战等商业服务，不涉及任何收费项目，仅为个人非经营性学习展示用途。</p>
    </footer>
  </div>
</template>
