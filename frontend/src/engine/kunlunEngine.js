/* ===================== 血战昆仑关 - 射击游戏引擎 ===================== */
// 场景背景：1939 年昆仑关战役（个人学习演示项目，非商业用途）
// 操作：鼠标瞄准，左键射击；右键按住开启 8 倍镜（仅狙击枪）；
//       数字键 1/2/3/4 切换 机枪 / 狙击枪 / 大炮 / 手榴弹
// 玩法：无关卡， endless 模式——敌军持续进攻，击杀得分，生命归零即结束
// 音效：枪声/爆炸由 Web Audio API 实时合成（sfx.js），按 M 键静音
import { SFX } from './sfx.js';

export const W = 800, H = 600;

// 武器参数表
// - fireRate  射击间隔（秒）        damage  单发伤害
// - spread    未开镜散布（像素）    auto    是否按住连发
// - ammo/maxAmmo 弹药（Infinity=不限，机枪用枪管过热限制）
// - projectile 弹道武器：大炮/手榴弹按抛物线飞行，落点爆炸（radius=杀伤半径）
// - scoped    支持右键 8 倍镜
export const WEAPONS = [
  { id: 'mg',      name: '机枪',     fireRate: 0.1,  damage: 20,  spread: 0, auto: true,  ammo: Infinity, maxAmmo: Infinity },
  { id: 'sniper',  name: '狙击枪',   fireRate: 1.2,  damage: 100, spread: 0, auto: false, ammo: 20, maxAmmo: 20, scoped: true },
  { id: 'cannon',  name: '大炮',     fireRate: 1.8,  damage: 130, radius: 90, auto: false, ammo: 8,  maxAmmo: 8,  projectile: true },
  { id: 'grenade', name: '手榴弹',   fireRate: 1.0,  damage: 90,  radius: 80, auto: false, ammo: 10, maxAmmo: 10, projectile: true },
];

// 敌军类型：hp 血量 / speed 推进速度(像素/秒) / score 击杀得分 / fireT 开火间隔
const ENEMY_TYPES = {
  rifleman: { hp: 60,  speed: 14, score: 100, w: 22, h: 40, dmg: 6,  fireT: 2.6 },
  officer:  { hp: 40,  speed: 26, score: 200, w: 20, h: 40, dmg: 8,  fireT: 2.0 },
  gunner:   { hp: 150, speed: 0,  score: 300, w: 26, h: 34, dmg: 12, fireT: 3.2 },
};

const ZOOM = 8;        // 8 倍镜放大倍数（可调）
const SCOPE_R = 170;   // 镜筒视野半径（像素）

export class KunlunGame {
  // hooks: { onHUD, onGameOver } —— 每帧推送 HUD 状态 / 结束回调
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.running = false;
    this.gameOver = false;
    this.sfx = new SFX(); // 合成音效（首次射击的用户点击会顺带解锁 AudioContext）

    // 鼠标状态（坐标已换算为画布内部坐标）
    this.mouse = { x: W / 2, y: H / 2, down: false, rDown: false };
    this.aim = { x: W / 2, y: H / 2 }; // 瞄准点（世界坐标）

    // 初始化全部状态字段（菜单阶段也要能安全绘制，否则第一帧就报错卡死）
    this.weaponIdx = 0;
    this.scoped = false;
    this.ammo = WEAPONS.map((w) => w.ammo);
    this.heat = 0;
    this.overheated = false;
    this.cooldown = 0;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.tracers = [];
    this.score = 0;
    this.kills = 0;
    this.hp = 100;
    this.hurtFlash = 0;
    this.shake = 0;
    this.time = 0;
    this.spawnT = 1;
    this.supplyT = 45;
    this.gameOver = false;

    // 双人在线（局域网共斗）相关状态
    this.netMode = false;   // true = 联机模式（刷兵由服务器指挥官驱动）
    this.myPid = 0;         // 本机玩家编号 1/2
    this.netSend = null;    // 组件注入的发送函数 (msg) => ws.send(...)
    this.remote = null;     // 队友信息 { pid, name, kills, score, hp, x }

    this.bindEvents();
    this.buildBackground(); // 预渲染昆仑关静态背景

    this.lastTime = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  bindEvents() {
    // 鼠标坐标换算：CSS 尺寸 -> 画布内部尺寸（画布被 CSS 缩放时也正确）
    const toCanvas = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };
    this.canvas.addEventListener('mousemove', (e) => {
      const p = toCanvas(e);
      // 未开镜：瞄准点 = 鼠标位置；开镜：鼠标增量平移瞄准点（移动更慢，模拟高倍率）
      if (this.scoped) {
        this.aim.x += (p.x - this.mouse.x) / ZOOM;
        this.aim.y += (p.y - this.mouse.y) / ZOOM;
        this.aim.x = Math.max(0, Math.min(W, this.aim.x));
        this.aim.y = Math.max(140, Math.min(H - 40, this.aim.y));
      } else {
        this.aim = { x: p.x, y: p.y };
      }
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        // 非自动武器（狙击/大炮/手榴弹）：按下瞬间立即开火（事件驱动，
        // 不依赖循环轮询 mouse.down，避免快速点按或按住右键开镜时漏判）
        this.tryFireOnce();
      }
      if (e.button === 2) {                        // 右键：8 倍镜
        this.mouse.rDown = true;
        if (WEAPONS[this.weaponIdx].scoped) this.scoped = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) { this.mouse.rDown = false; this.scoped = false; }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 屏蔽右键菜单
    // 数字键切换武器；M 键静音开关
    this._keyHandler = (e) => {
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (idx >= 0) this.selectWeapon(idx);
      if (e.code === 'KeyM') {
        this.sfx.muted = !this.sfx.muted;
        if (!this.sfx.muted) this.sfx.tick(); // 解除静音时给个反馈音
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  selectWeapon(i) {
    if (i !== this.weaponIdx) this.sfx.tick(); // 切枪机械咔嗒
    this.weaponIdx = i;
    this.scoped = false; // 切枪收镜
    this.cooldown = 0.3;
  }

  start() {
    this.weaponIdx = 0;
    this.scoped = false;
    this.ammo = WEAPONS.map((w) => w.ammo);          // 各武器当前弹药
    this.heat = 0;                                    // 机枪枪管热量 0~100
    this.overheated = false;
    this.cooldown = 0;
    this.enemies = [];
    this.projectiles = [];                            // 大炮弹/手榴弹
    this.particles = [];
    this.tracers = [];                                // 曳光/弹道特效
    this.score = 0;
    this.kills = 0;
    this.hp = 100;                                    // 玩家生命
    this.hurtFlash = 0;                               // 受击红屏闪烁
    this.shake = 0;                                   // 爆炸屏幕震动
    this.time = 0;                                    // 游戏进行时间（决定难度曲线）
    this.spawnT = 1;                                  // 下一次刷兵倒计时
    this.supplyT = 45;                                // 补给倒计时（补满弹药）
    this.gameOver = false;
    this.running = true;
  }

  // 联机开局：由服务器 start 消息触发（敌军全部来自服务器刷兵广播）
  startNet(myPid, remoteInfo, sendFn) {
    this.start();
    this.netMode = true;
    this.myPid = myPid;
    this.remote = remoteInfo; // { pid, name, kills, score, hp, x }
    this.netSend = sendFn;
    this.spawnT = Infinity;   // 关闭本地刷兵计时器
  }

  // 联机收尾：服务器判定本局结束（队友阵亡/离开）时调用
  endByNet() {
    this.gameOver = true;
    this.running = false;
  }

  stop() { this.running = false; }

  // 组件卸载时清理事件
  destroy() {
    this.running = false;
    window.removeEventListener('keydown', this._keyHandler);
  }

  loop(t) {
    // 先调度下一帧再执行本帧逻辑：即使某帧抛出异常，循环也不会永久卡死
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    if (this.running) this.update(dt);
    this.draw();
    if (this.hooks.onHUD) {
      this.hooks.onHUD({
        score: this.score, kills: this.kills, hp: Math.max(0, this.hp),
        heat: Math.round(this.heat), overheated: this.overheated,
        ammo: this.ammo, weapon: this.weaponIdx, scoped: this.scoped,
        supply: Math.ceil(this.supplyT),
        netMode: this.netMode, myPid: this.myPid,
        remote: this.remote
          ? { name: this.remote.name, kills: this.remote.kills, score: this.remote.score, hp: Math.max(0, this.remote.hp) }
          : null,
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.supplyT -= dt;
    if (this.supplyT <= 0) {          // 补给到达：弹药补满
      this.supplyT = 45;
      this.ammo = this.ammo.map((a, i) => Math.max(a, WEAPONS[i].maxAmmo));
    }

    this.updateWeapon(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateFx(dt);

    if (this.hp <= 0 && !this.gameOver) {
      this.gameOver = true;
      this.running = false;
      if (this.netMode) {
        // 联机模式：上报阵亡，由服务器广播 over 结算双方成绩
        this.netSend({ type: 'dead' });
      } else if (this.hooks.onGameOver) {
        this.hooks.onGameOver(this.score, this.kills);
      }
    }
  }

  /* ---------- 射击 ---------- */
  // 自动武器（机枪）：按住左键连发，由游戏循环每帧轮询
  updateWeapon(dt) {
    this.cooldown -= dt;
    // 机枪枪管散热
    this.heat = Math.max(0, this.heat - 25 * dt);
    if (this.overheated && this.heat <= 25) this.overheated = false;

    const w = WEAPONS[this.weaponIdx];
    if (!w.auto) return;                            // 非自动武器由 tryFireOnce 处理
    if (!this.mouse.down || this.cooldown > 0 || this.gameOver) return;
    if (this.overheated) return;                    // 枪管过热：暂停射击等待冷却

    this.cooldown = w.fireRate;
    this.heat += 6;                                 // 每发积攒热量
    if (this.heat >= 100) this.overheated = true;
    this.hitscan(w, 2);                            // 连发散布较大
    this.sfx.mg();                                  // 机枪枪声
  }

  // 非自动武器（狙击/大炮/手榴弹）：左键按下瞬间立即开火
  tryFireOnce() {
    if (!this.running || this.gameOver) return;
    const w = WEAPONS[this.weaponIdx];
    if (w.auto || this.cooldown > 0) return;
    this.fireWeapon(w);
  }

  fireWeapon(w) {
    if (w.id === 'sniper') {
      if (this.ammo[1] <= 0) return;
      this.ammo[1]--;
      this.cooldown = w.fireRate;
      this.hitscan(w, 8);                           // 精准度高
      this.aim.y += 4 / (this.scoped ? ZOOM : 1);   // 后坐力：准星上跳
      this.sfx.sniper();
    } else if (w.id === 'cannon') {
      if (this.ammo[2] <= 0) return;
      this.ammo[2]--;
      this.cooldown = w.fireRate;
      this.launchProjectile(w, 'shell', 1.5, 500);
      this.sfx.cannon();
    } else if (w.id === 'grenade') {
      if (this.ammo[3] <= 0) return;
      this.ammo[3]--;
      this.cooldown = w.fireRate;
      this.launchProjectile(w, 'grenade', 1.8, 320);
      this.sfx.grenade();
    }
  }

  // 瞬发武器（机枪/狙击）：以瞄准点为中心，命中半径内最近的敌军
  hitscan(w, tolerance) {
    const jitter = this.scoped ? 0 : tolerance * 0.5;
    const ax = this.aim.x + (Math.random() - 0.5) * jitter;
    const ay = this.aim.y + (Math.random() - 0.5) * jitter;
    this.tracers.push({ x1: W / 2, y1: H, x2: ax, y2: ay, life: 0.06, color: '#fff59d' });

    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      const s = this.enemyScale(e);
      const cx = e.x, cy = e.y - (e.h * s) / 2;
      const d = Math.hypot(ax - cx, ay - cy);
      if (d < Math.max(14, (e.w * s) / 2 + 6) && d < bestD) { best = e; bestD = d; }
    }
    if (best) {
      this.damageEnemy(best, w.damage);
      this.spawnParticles(ax, ay, 6, '#c62828', 120); // 命中血雾
    } else {
      this.spawnParticles(ax, ay, 4, '#cfd8dc', 100); // 打在地面扬尘
    }
    // 联机模式：把曳光弹道转发给队友（蓝色特效展示对方射击）
    if (this.netMode && this.netSend) {
      this.netSend({ type: 'shot', x1: W / 2, y1: H, x2: ax, y2: ay });
    }
  }

  // 弹道武器（大炮/手榴弹）：从屏幕底部中央抛射到瞄准点，落地爆炸
  launchProjectile(w, type, flightT, g) {
    const sx = W / 2, sy = H - 20;
    const tx = Math.max(20, Math.min(W - 20, this.aim.x));
    const ty = Math.max(160, this.aim.y);
    this.projectiles.push({
      type, x: sx, y: sy, targetY: ty,
      vx: (tx - sx) / flightT,
      vy: (ty - sy - 0.5 * g * flightT * flightT) / flightT,
      g, damage: w.damage, radius: w.radius, t: 0,
    });
    this.tracers.push({ x1: sx, y1: sy, x2: tx, y2: ty, life: 0.08, color: '#b0bec5' });
  }

  // 爆炸：对半径内所有敌军造成伤害（越近伤害越高）
  explode(x, y, radius, damage) {
    this.shake = 0.4;
    this.spawnParticles(x, y, 34, '#ff9100', 260, 8);
    this.spawnParticles(x, y, 20, '#5d4037', 180, 10);
    this.sfx.boom(); // 爆炸轰鸣
    // 联机模式：爆炸特效转发队友（各自本地结算伤害）
    if (this.netMode && this.netSend) {
      this.netSend({ type: 'boom', x, y });
    }
    for (const e of [...this.enemies]) {
      const s = this.enemyScale(e);
      const cx = e.x, cy = e.y - (e.h * s) / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < radius) this.damageEnemy(e, damage * (1 - d / radius) + damage * 0.3);
    }
  }

  damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hurtT = 0.15;
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    const t = ENEMY_TYPES[e.type];
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.spawnParticles(e.x, e.y - t.h / 2, 14, '#c62828', 160);
    if (this.netMode) {
      // 联机模式：上报击杀（sid 标识敌军），得分由服务器广播统一结算，
      // 防止两人同时击杀同一目标导致比分重复计算
      if (this.netSend) this.netSend({ type: 'kill', sid: e.sid, score: t.score });
    } else {
      this.score += t.score;
      this.kills++;
    }
    // 击杀有概率掉落弹药补给（各自本地）
    if (Math.random() < 0.25) {
      const wIdx = 1 + Math.floor(Math.random() * 3); // 狙击/大炮/手榴弹 随机 +1
      if (this.ammo[wIdx] < WEAPONS[wIdx].maxAmmo) this.ammo[wIdx]++;
    }
  }

  /* ---------- 敌军 ---------- */
  updateSpawns(dt) {
    if (this.netMode) return; // 联机模式：敌军由服务器指挥官广播生成，本地不再刷兵
    // 无关卡 endless：刷兵间隔随时间缓慢缩短（1.8 秒起步，最低 0.8 秒），
    // 且场上敌军最多 8 人，避免弹幕密度失控
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length < 8) {
      this.spawnT = Math.max(0.8, 1.8 - this.time * 0.005) + Math.random() * 0.5;
      this.spawnEnemy();
    }
  }

  // 依据服务器广播的刷兵消息生成敌军（双方参数一致 → 战场同步）
  spawnNetEnemy(m) {
    const t = ENEMY_TYPES[m.etype];
    this.enemies.push({
      type: m.etype, sid: m.sid, hp: t.hp, w: t.w, h: t.h,
      x: m.x, y: m.y, stopY: m.stopY,
      fireT: 1 + Math.random() * t.fireT,
      hurtT: 0, muzzle: 0,
    });
  }

  // 处理服务器转发的联机消息（击杀归属/队友位置/特效）
  handleNet(m) {
    switch (m.type) {
      case 'spawn': // 服务器刷兵
        this.spawnNetEnemy(m);
        break;
      case 'kill': {
        // 击杀归属（先报者得，服务器去重）：移除双方各自的敌军副本并计分
        const e = this.enemies.find((x) => x.sid === m.sid);
        if (e) {
          this.enemies.splice(this.enemies.indexOf(e), 1);
          this.spawnParticles(e.x, e.y - e.h / 2, 14, '#c62828', 160);
        }
        if (m.pid === this.myPid) {
          this.kills++;
          this.score += m.score;
        } else if (this.remote) {
          this.remote.kills++;
          this.remote.score += m.score;
        }
        break;
      }
      case 'pos': // 队友飞船位置
        if (this.remote && m.pid === this.remote.pid) this.remote.x = m.x;
        break;
      case 'hp': // 队友生命值
        if (this.remote && m.pid === this.remote.pid) this.remote.hp = m.hp;
        break;
      case 'shot': // 队友曳光特效
        this.tracers.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, life: 0.12, color: '#80d8ff' });
        break;
      case 'boom': // 队友爆炸特效（仅视觉，伤害判定各自本地结算）
        this.spawnParticles(m.x, m.y, 30, '#ff9100', 260, 8);
        this.spawnParticles(m.x, m.y, 18, '#5d4037', 180, 10);
        break;
    }
  }

  spawnEnemy() {
    const r = Math.random();
    let type = 'rifleman';
    if (r > 0.85) type = 'gunner';      // 重机枪手：原地火力点
    else if (r > 0.6) type = 'officer'; // 军官：移动快
    const t = ENEMY_TYPES[type];
    const stationary = type === 'gunner';
    const y = stationary ? 300 + Math.random() * 40 : 290 + Math.random() * 40;
    this.enemies.push({
      type, hp: t.hp, w: t.w, h: t.h,
      x: 50 + Math.random() * (W - 100),
      y, stopY: stationary ? y : 460 + Math.random() * 70,
      fireT: 1 + Math.random() * t.fireT,
      hurtT: 0, muzzle: 0,
    });
  }

  enemyScale(e) {
    // 距离越近（y 越大）体型越大：远端 0.55 倍，近端 1.35 倍
    return Math.min(1.35, 0.55 + (e.y - 290) / 300);
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      const t = ENEMY_TYPES[e.type];
      e.hurtT = Math.max(0, e.hurtT - dt);
      e.muzzle = Math.max(0, e.muzzle - dt);
      // 未到达攻击位置则向玩家推进
      if (!t.speed || e.y < e.stopY) e.y += t.speed * dt;
      // 开火：按命中率判定是否伤到玩家，曳光线做视觉反馈
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 260) {
        e.fireT = t.fireT + Math.random() * 1.2;
        e.muzzle = 0.1;
        const hit = Math.random() < 0.18; // 命中率：0.18（原 0.35 太致命，几乎无法生存）
        this.tracers.push({
          x1: e.x, y1: e.y - t.h / 2,
          x2: W / 2 + (Math.random() - 0.5) * 120,
          y2: H + 10, life: 0.12, color: '#ff8a80',
        });
        if (hit) this.damagePlayer(t.dmg);
      }
    }
  }

  damagePlayer(dmg) {
    if (this.gameOver) return;
    this.hp -= dmg;
    this.hurtFlash = 0.35;
    this.spawnParticles(W / 2, H - 30, 5, '#ff5252', 150);
    // 联机模式：生命变化即时上报，队友 HUD 实时显示
    if (this.netMode && this.netSend) {
      this.netSend({ type: 'hp', hp: Math.max(0, Math.round(this.hp)) });
    }
  }

  /* ---------- 弹道 / 特效 ---------- */
  updateProjectiles(dt) {
    for (const p of [...this.projectiles]) {
      p.vy += p.g * dt;               // 重力
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t += dt;
      // 落点爆炸：必须"下落中"(vy>0) 且到达目标地面高度。
      // 发射起点(屏幕底部)本来就在 targetY 下方，若不加 vy>0 判断，
      // 炮弹会在发射后的第一帧就"原地爆炸"，根本飞不出去！
      if (p.vy > 0 && p.y >= p.targetY) {
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
        this.explode(p.x, p.y, p.radius, p.damage);
      }
    }
  }

  spawnParticles(x, y, n, color, speed, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.4 + Math.random() * 0.5, color, size,
      });
    }
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.vy += 300 * dt; // 粒子受重力
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
  }

  /* ---------- 绘制 ---------- */
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * 14;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    const w = WEAPONS[this.weaponIdx];
    if (this.scoped && w.scoped) {
      // ===== 8 倍镜视角：圆形镜筒内放大绘制战场 =====
      const cx = W / 2, cy = H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, SCOPE_R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(cx - SCOPE_R, cy - SCOPE_R, SCOPE_R * 2, SCOPE_R * 2);
      ctx.translate(cx - this.aim.x * ZOOM, cy - this.aim.y * ZOOM);
      ctx.scale(ZOOM, ZOOM);
      this.drawWorld(ctx);
      ctx.restore();
      this.drawScopeOverlay(ctx, cx, cy);
    } else {
      // ===== 常规视角 =====
      this.drawWorld(ctx);
      this.drawCrosshair(ctx);
    }
    // 受击红屏 + 爆炸震动后恢复
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(200,20,20,${this.hurtFlash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* ---------- 场景：血战昆仑关（静态部分预渲染一次） ---------- */
  buildBackground() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // 黄昏天空（暗蓝到橘红，战场氛围）
    const sky = g.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, '#2c3e5d');
    sky.addColorStop(0.6, '#7a5a4a');
    sky.addColorStop(1, '#a8713f');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 300);
    // 远山（三层，颜色渐深，用正弦曲线勾勒昆仑关群山）
    const mountains = [
      { base: 235, amp: 55, freq: 0.006, color: '#3a4a5e' },
      { base: 265, amp: 40, freq: 0.009, color: '#2f3c4c' },
      { base: 292, amp: 26, freq: 0.013, color: '#26303d' },
    ];
    for (const m of mountains) {
      g.fillStyle = m.color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        g.lineTo(x, m.base - Math.abs(Math.sin(x * m.freq)) * m.amp);
      }
      g.lineTo(W, H);
      g.fill();
    }
    // 关隘城楼（画面中央，"昆仑关"关名）
    g.fillStyle = '#1d2430';
    g.fillRect(W / 2 - 90, 208, 180, 78);      // 城墙主体
    g.fillStyle = '#141a24';
    g.fillRect(W / 2 - 34, 242, 68, 44);       // 关门拱洞
    g.fillStyle = '#37475c';
    g.fillRect(W / 2 - 100, 196, 200, 14);     // 城楼飞檐
    g.fillStyle = '#c8b78a';
    g.font = 'bold 18px serif';
    g.textAlign = 'center';
    g.fillText('昆 仑 关', W / 2, 232);        // 关名刻字
    // 地面（焦土：深橄榄色渐变）
    const ground = g.createLinearGradient(0, 296, 0, H);
    ground.addColorStop(0, '#4a4a38');
    ground.addColorStop(0.5, '#3d3d2e');
    ground.addColorStop(1, '#2b2b20');
    g.fillStyle = ground;
    g.fillRect(0, 296, W, H - 296);
    // 弹坑（随机椭圆）
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * (W - 80);
      const y = 340 + Math.random() * 220;
      g.beginPath();
      g.ellipse(x, y, 18 + Math.random() * 26, 6 + Math.random() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 铁丝网（中景两排）
    g.strokeStyle = 'rgba(30,30,25,0.8)';
    g.lineWidth = 1.5;
    for (const rowY of [370, 430]) {
      for (let x = 20; x < W; x += 26) {
        g.beginPath();
        g.moveTo(x, rowY - 14);
        g.lineTo(x + 20, rowY + 6);
        g.moveTo(x + 20, rowY - 14);
        g.lineTo(x, rowY + 6);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(0, rowY); g.lineTo(W, rowY);
      g.stroke();
    }
    // 枯草丛（近景散布短线）
    g.strokeStyle = 'rgba(90,90,60,0.7)';
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * W, y = 440 + Math.random() * 150;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 8, y - 8 - Math.random() * 8);
      g.stroke();
    }
    this.bg = c;
  }

  // 战场世界绘制（常规视角与开镜视角共用）
  drawWorld(ctx) {
    ctx.drawImage(this.bg, 0, 0);
    this.drawSmoke(ctx);        // 远处炮火硝烟
    this.drawEnemies(ctx);
    this.drawProjectiles(ctx);
    this.drawTracers(ctx);
    this.drawParticles(ctx);
  }

  // 远处炮火硝烟：缓慢飘动的半透明烟团
  drawSmoke(ctx) {
    for (let i = 0; i < 5; i++) {
      const t = this.time * 0.15 + i * 2.2;
      const x = ((i * 173 + 90) % W) + Math.sin(t) * 30;
      const y = 180 + (i % 3) * 30;
      const r = 30 + (i % 4) * 12;
      ctx.fillStyle = `rgba(120,120,120,${0.14 + 0.06 * Math.sin(t * 1.3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 日军士兵：钢盔 + 军服 + 步枪，随距离缩放
  drawEnemies(ctx) {
    for (const e of this.enemies) {
      const s = this.enemyScale(e);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(s, s);
      const hurt = e.hurtT > 0;
      // 双腿
      ctx.fillStyle = '#4e4a3a';
      ctx.fillRect(-7, -10, 5, 10);
      ctx.fillRect(2, -10, 5, 10);
      // 军装上衣（受击闪红）
      ctx.fillStyle = hurt ? '#a1685a' : '#5d6b3f';
      ctx.fillRect(-11, -28, 22, 19);
      // 武装带
      ctx.fillStyle = '#3b3527';
      ctx.fillRect(-3, -28, 5, 19);
      // 步枪（斜持）
      ctx.strokeStyle = '#2b2b22';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(10, -20);
      ctx.lineTo(-6, -4);
      ctx.stroke();
      // 头部 + 钢盔
      ctx.fillStyle = '#c9a884';
      ctx.beginPath();
      ctx.arc(0, -32, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a5232';
      ctx.beginPath();
      ctx.arc(0, -34, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-8, -34, 16, 2); // 盔沿
      // 开火枪口火光
      if (e.muzzle > 0) {
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath();
        ctx.arc(-8, -6, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 血条（头顶）
      const t = ENEMY_TYPES[e.type];
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-14, -46, 28, 4);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(-14, -46, 28 * Math.max(0, e.hp / t.hp), 4);
      ctx.restore();
    }
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      if (p.type === 'shell') {
        // 大炮弹：黑色弹体 + 尾烟
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(176,190,197,0.4)';
        ctx.beginPath();
        ctx.arc(p.x - p.vx * 0.02, p.y - p.vy * 0.02, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 手榴弹：小铁蛋 + 引信火花
        ctx.fillStyle = '#33691e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffee58';
        ctx.beginPath();
        ctx.arc(p.x + 3, p.y - 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTracers(ctx) {
    for (const tr of this.tracers) {
      ctx.strokeStyle = tr.color;
      ctx.globalAlpha = Math.max(0, tr.life * 8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // 常规视角准星：十字 + 空心圆
  drawCrosshair(ctx) {
    const { x, y } = this.aim;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);  ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);  ctx.lineTo(x, y + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 8 倍镜遮罩：镜筒外全黑 + 消黑边十字密位线 + 倍率标注
  drawScopeOverlay(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0,0,0,0.94)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, SCOPE_R, 0, Math.PI * 2, true);
    ctx.fill();
    // 镜筒边框
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, SCOPE_R + 5, 0, Math.PI * 2);
    ctx.stroke();
    // 十字密位线（中心细线 + 刻度短横）
    ctx.strokeStyle = 'rgba(20,20,20,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - SCOPE_R + 12, cy); ctx.lineTo(cx + SCOPE_R - 12, cy);
    ctx.moveTo(cx, cy - SCOPE_R + 12); ctx.lineTo(cx, cy + SCOPE_R - 12);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 1; i <= 4; i++) {
      const d = i * 16;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + d); ctx.lineTo(cx + 5, cy + d);
      ctx.moveTo(cx - 5, cy - d); ctx.lineTo(cx + 5, cy - d);
      ctx.stroke();
    }
    // 倍率标注
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('8x', cx + SCOPE_R - 26, cy + SCOPE_R - 16);
  }
}
