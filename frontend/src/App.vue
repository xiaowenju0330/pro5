<script setup>
// 根组件：负责大厅与各小游戏之间的视图切换
import { ref } from 'vue';
import GameLobby from './components/GameLobby.vue';
import BeeGameView from './components/BeeGameView.vue';
import KunlunView from './components/KunlunView.vue';

// 当前视图：'lobby' = 大厅，其余为各游戏（后续新增游戏在此扩展）
const view = ref('lobby');

// 大厅点击游戏图标时触发
function enterGame(id) {
  if (id === 'bee') view.value = 'bee';
  if (id === 'kunlun') view.value = 'kunlun';
}
</script>

<template>
  <!-- 大厅视图 -->
  <GameLobby v-if="view === 'lobby'" @enter-game="enterGame" />

  <!-- 小蜜蜂游戏视图 -->
  <BeeGameView v-else-if="view === 'bee'" @back="view = 'lobby'" />

  <!-- 血战昆仑关射击游戏视图 -->
  <KunlunView v-else-if="view === 'kunlun'" @back="view = 'lobby'" />
</template>
