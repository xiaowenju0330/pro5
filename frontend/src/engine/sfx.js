// 纯 Web Audio API 合成音效模块 —— 不需要任何音频文件，
// 枪声/爆炸等全部由白噪声缓冲 + 振荡器实时合成。
// 注意：浏览器自动播放策略要求 AudioContext 必须在用户手势（点击/按键）之后才能出声，
// 因此采用惰性创建：第一次 ensure() 发生在任何射击点击时，天然满足手势要求。
export class SFX {
  constructor() {
    this.ctx = null;      // AudioContext（惰性创建）
    this.noiseBuf = null; // 预生成的 1 秒白噪声缓冲（所有噪声类音效共用）
    this.muted = false;   // 按 M 键静音开关
  }

  // 确保音频上下文可用；静音或创建失败时返回 null
  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null; // 极少数环境不支持 Web Audio
      }
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // 白噪声爆发：射击/爆炸的"沙沙"质感
  // dur 时长秒 / vol 音量 / type 频率曲线 / freq 滤波中心频率
  noise({ dur = 0.1, vol = 0.3, type = 'lowpass', freq = 1000 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  // 振荡器轰鸣：f0 -> f1 频率下滑模拟闷响
  tone({ f0 = 200, f1 = 60, dur = 0.2, vol = 0.3, type = 'sine' } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  /* ---------- 游戏音效 ---------- */

  // 机枪单发：短促高频噪声 + 金属方波
  mg() {
    this.noise({ dur: 0.07, vol: 0.2, freq: 1500 });
    this.tone({ f0: 160, f1: 55, dur: 0.07, vol: 0.12, type: 'square' });
  }

  // 狙击枪：低频炮管闷响 + 长尾噪声
  sniper() {
    this.tone({ f0: 130, f1: 35, dur: 0.28, vol: 0.35 });
    this.noise({ dur: 0.22, vol: 0.4, freq: 900 });
  }

  // 大炮发射：深膛压闷响
  cannon() {
    this.tone({ f0: 95, f1: 28, dur: 0.4, vol: 0.5 });
    this.noise({ dur: 0.28, vol: 0.28, freq: 500 });
  }

  // 手榴弹投掷：轻微呼啸
  grenade() {
    this.noise({ dur: 0.18, vol: 0.1, type: 'highpass', freq: 900 });
  }

  // 爆炸：低频轰鸣 + 宽频噪声衰减
  boom() {
    this.tone({ f0: 70, f1: 22, dur: 0.55, vol: 0.5 });
    this.noise({ dur: 0.45, vol: 0.35, freq: 400 });
  }

  // 敌军/队友远处射击：轻弱的枪声
  enemy() {
    this.noise({ dur: 0.07, vol: 0.06, freq: 800 });
  }

  // 玩家受击：低沉撞击
  hurt() {
    this.tone({ f0: 220, f1: 80, dur: 0.15, vol: 0.18, type: 'triangle' });
  }

  // 切换武器/干燥的机械咔嗒
  tick() {
    this.noise({ dur: 0.04, vol: 0.1, type: 'highpass', freq: 2200 });
  }
}
