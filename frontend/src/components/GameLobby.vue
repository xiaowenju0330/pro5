<script setup>
// 游戏大厅：图标卡片网格，点击进入对应小游戏
import { ref, onMounted } from 'vue';

const emit = defineEmits(['enter-game']);

const bestScore = ref(0); // 小蜜蜂排行榜最高分，展示在卡片上

// 游戏清单：ready=true 的点击进入，false 的预留入口
const games = [
  {
    id: 'bee', icon: '🐝', name: '小蜜蜂',
    desc: '经典蜜蜂编队射击，可选皮肤与核弹',
    ready: true,
  },
  {
    id: 'kunlun', icon: '🎖️', name: '血战昆仑关',
    desc: '射击游戏：机枪/狙击8倍镜/大炮/手榴弹',
    ready: true,
  },
  { id: 'snake', icon: '🐍', name: '贪吃蛇', desc: '经典贪吃蛇，吃道具变长', ready: false },
  { id: 'whack', icon: '🔨', name: '打地鼠', desc: '手速大考验，敲中越多的地鼠分越高', ready: false },
  { id: 'blocks', icon: '🧱', name: '俄罗斯方块', desc: '旋转下落方块，消行得分', ready: false },
  { id: 'memory', icon: '🃏', name: '记忆翻牌', desc: '翻出所有配对卡牌', ready: false },
  { id: 'mine', icon: '💣', name: '扫雷', desc: '经典扫雷，避开所有地雷', ready: false },
];

// 进入游戏：可玩的发出事件切换视图，未上线的不响应
function enter(g) {
  if (g.ready) emit('enter-game', g.id);
}

// 读取小蜜蜂的最高分展示在卡片上
async function fetchBest() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    if (data.items && data.items.length) bestScore.value = data.items[0].score;
  } catch (e) { /* 忽略网络错误 */ }
}

onMounted(fetchBest);
</script>

<template>
  <h1 class="portal-title">🎮 Demo 大 厅</h1>
  <p class="portal-sub">点击图标进入小游戏Demo，更多游戏Demo陆续上线</p>

  <div class="game-grid">
    <div
      v-for="g in games"
      :key="g.id"
      class="game-card"
      :class="{ disabled: !g.ready }"
      @click="enter(g)"
    >
      <span class="badge" :class="{ soon: !g.ready }">{{ g.ready ? '可玩' : '敬请期待' }}</span>
      <div class="icon">{{ g.icon }}</div>
      <div class="name">{{ g.name }}</div>
      <div class="desc">{{ g.desc }}</div>
      <div class="best" v-if="g.ready && bestScore">最高分 {{ bestScore }}</div>
    </div>
  </div>

  <!-- 站点声明 -->
  <footer class="site-notice">
    <p>本站为个人技术学习与作品展示站点，主要用于记录本人学习 Web 开发（Go、Vue 等技术）过程中的笔记与练习成果，并展示个人独立开发的小游戏 Demo 供学习交流。网站不提供游戏运营、充值、对战等商业服务，不涉及任何收费项目，仅为个人非经营性学习展示用途。</p>
  </footer>
</template>

<style scoped>
.portal-title {
  text-align: center;
  margin-bottom: 8px;
  font-size: 38px;
  letter-spacing: 8px;
  text-shadow: 0 0 24px rgba(255, 213, 74, 0.45);
}
.portal-sub {
  text-align: center;
  color: #9fb0d0;
  margin-bottom: 40px;
  font-size: 15px;
}

/* 游戏卡片网格：固定一排 4 个 */
.game-grid {
  display: grid;
  grid-template-columns: repeat(4, 220px);
  gap: 24px;
  justify-content: center;
}
/* 窄屏时自动降为 3 / 2 列，避免挤压变形 */
@media (max-width: 1020px) {
  .game-grid { grid-template-columns: repeat(3, 220px); }
}
@media (max-width: 780px) {
  .game-grid { grid-template-columns: repeat(2, 220px); }
}

/* 单个游戏卡片 */
.game-card {
  position: relative;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 28px 18px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}
.game-card:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 213, 74, 0.6);
  box-shadow: 0 14px 40px rgba(255, 179, 0, 0.15);
  background: rgba(255, 255, 255, 0.1);
}
.game-card .icon {
  font-size: 56px;
  line-height: 1;
  margin-bottom: 14px;
  display: inline-block;
}
.game-card .name { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.game-card .desc { font-size: 13px; color: #9fb0d0; line-height: 1.5; min-height: 40px; }
.game-card .best { margin-top: 12px; font-size: 13px; color: #ffd54a; }

/* 敬请期待的卡片：置灰、禁用 */
.game-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.7);
}
.game-card.disabled:hover {
  transform: none;
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: none;
  background: rgba(255, 255, 255, 0.06);
}

/* 状态角标 */
.badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb300, #ff8f00);
  color: #201300;
  font-weight: 700;
}
.badge.soon { background: rgba(255,255,255,0.14); color: #b8c6e2; font-weight: 400; }
</style>
