/* ===================== 游戏引擎 ===================== */

const W = 480, H = 640;

/* ===================== 皮肤定义 ===================== */
/*
 * 每套皮肤 = { id, name, draw }：
 * - draw(ctx, e, flap, king)  蜜蜂绘制函数
 *   ctx    画布上下文（已 translate 到蜜蜂中心）
 *   e      蜜蜂数据对象
 *   flap   翅膀扇动偏移（随时间正弦变化，用于动画）
 *   king   是否蜂王（用于改变配色/大小）
 * - draw(ctx, p)              大炮（玩家飞船）绘制函数
 *   ctx    画布上下文（已 translate 到飞船中心）
 *   p      玩家数据对象
 * 想新增样式：往数组里追加一个对象即可，开始界面会自动出现新选项。
 */

/* ---------- 蜜蜂皮肤 ---------- */
const BEE_STYLES = [
  {
    id: 'classic', name: '经典黄蜂',
    // 经典款：黄黑条纹身体 + 半透明翅膀 + 红眼睛
    draw(ctx, e, flap, king) {
      // 翅膀：两侧椭圆，随 flap 上下摆动
      ctx.fillStyle = king ? 'rgba(255,255,255,0.75)' : 'rgba(200,225,255,0.65)';
      ctx.beginPath();
      ctx.ellipse(-11, -6 + flap * 0.4, 7, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(11, -6 + flap * 0.4, 7, 4, 0.5, 0, Math.PI * 2);
      ctx.fill();
      // 身体：椭圆形，蜂王为深金色
      ctx.fillStyle = king ? '#ff8f00' : '#ffd54a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // 身体上的黑色条纹
      ctx.fillStyle = '#3b2b00';
      ctx.fillRect(-10, -3, 20, 3);
      ctx.fillRect(-8, 2, 16, 3);
      // 红色眼睛
      ctx.fillStyle = '#e53935';
      ctx.beginPath();
      ctx.arc(-4, -5, 2.2, 0, Math.PI * 2);
      ctx.arc(4, -5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'frost', name: '冰霜蓝蜂',
    // 冰霜款：蓝白配色，翅膀带冰晶感
    draw(ctx, e, flap, king) {
      // 冰晶翅膀（更透的蓝白色）
      ctx.fillStyle = king ? 'rgba(200,240,255,0.9)' : 'rgba(160,215,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-11, -6 + flap * 0.4, 7, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(11, -6 + flap * 0.4, 7, 4, 0.5, 0, Math.PI * 2);
      ctx.fill();
      // 冰蓝色身体
      ctx.fillStyle = king ? '#1e88e5' : '#4fc3f7';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // 白色冰纹条纹
      ctx.fillStyle = '#e1f5fe';
      ctx.fillRect(-10, -3, 20, 3);
      ctx.fillRect(-8, 2, 16, 3);
      // 深蓝眼睛
      ctx.fillStyle = '#0d47a1';
      ctx.beginPath();
      ctx.arc(-4, -5, 2.2, 0, Math.PI * 2);
      ctx.arc(4, -5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'mecha', name: '机甲战蜂',
    // 机甲款：方形金属机身 + 铆钉 + 感应眼
    draw(ctx, e, flap, king) {
      // 金属旋翼（用细长矩形模拟机械翼）
      ctx.fillStyle = king ? '#cfd8dc' : '#b0bec5';
      ctx.fillRect(-18, -8 + flap * 0.3, 8, 3);
      ctx.fillRect(10, -8 + flap * 0.3, 8, 3);
      // 方形装甲机身
      ctx.fillStyle = king ? '#78909c' : '#607d8b';
      ctx.fillRect(-11, -8, 22, 16);
      // 蜂王多一条金色装甲带
      if (king) {
        ctx.fillStyle = '#ffb300';
        ctx.fillRect(-11, -8, 22, 3);
      }
      // 铆钉
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-8, -5, 2, 2);
      ctx.fillRect(6, -5, 2, 2);
      ctx.fillRect(-8, 4, 2, 2);
      ctx.fillRect(6, 4, 2, 2);
      // 单个感应眼
      ctx.fillStyle = '#00e676';
      ctx.fillRect(-4, -3, 8, 4);
    },
  },
];

/* ---------- 大炮（玩家飞船）皮肤 ---------- */
/*
 * 每门大炮都有发射参数 stats：
 * - cooldown    射击间隔（秒），越小射速越快
 * - bulletSpeed 子弹飞行速度（像素/秒）
 * - bulletW/H   弹体宽/高（像素），越大"打击范围"越大
 * - damage      单发伤害（可一发击碎血量 2 的蜂王）
 * - bulletColor 弹体颜色
 */
const SHIP_STYLES = [
  {
    id: 'honey', name: '蜂蜜罐号',
    // 发射参数：标准均衡型 —— 0.28 秒一发，普通弹体
    stats: { cooldown: 0.28, bulletSpeed: 520, bulletW: 4, bulletH: 14, damage: 1, bulletColor: '#fff59d' },
    // 蜂蜜罐造型：三角机身 + 圆形驾驶舱
    draw(ctx) {
      // 蜂蜜色三角机身
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-14, 10);
      ctx.lineTo(0, 4);
      ctx.lineTo(14, 10);
      ctx.closePath();
      ctx.fill();
      // 白色驾驶舱
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath();
      ctx.arc(0, -4, 4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'fighter', name: '蜂翼战机',
    // 发射参数：速射型 —— 0.18 秒一发，弹速更快，弹体纤细
    stats: { cooldown: 0.18, bulletSpeed: 620, bulletW: 3, bulletH: 16, damage: 1, bulletColor: '#80d8ff' },
    // 战机造型：宽大机翼 + 机头
    draw(ctx) {
      // 灰蓝色宽机翼
      ctx.fillStyle = '#546e7a';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-18, 8);
      ctx.lineTo(-6, 6);
      ctx.lineTo(0, 10);
      ctx.lineTo(6, 6);
      ctx.lineTo(18, 8);
      ctx.closePath();
      ctx.fill();
      // 机头
      ctx.fillStyle = '#ffab00';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-4, -6);
      ctx.lineTo(4, -6);
      ctx.closePath();
      ctx.fill();
      // 座舱玻璃
      ctx.fillStyle = '#b3e5fc';
      ctx.fillRect(-3, -6, 6, 6);
    },
  },
  {
    id: 'ufo', name: '黄金飞碟',
    // 发射参数：重弹型 —— 射速较慢（0.4 秒一发），但弹体大、伤害 2
    stats: { cooldown: 0.4, bulletSpeed: 460, bulletW: 8, bulletH: 18, damage: 2, bulletColor: '#ffe082' },
    // 飞碟造型：椭圆碟身 + 光环
    draw(ctx) {
      // 底部光环
      ctx.fillStyle = 'rgba(255,213,74,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // 碟身
      ctx.fillStyle = '#f9a825';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // 顶部圆罩
      ctx.fillStyle = '#fff8e1';
      ctx.beginPath();
      ctx.ellipse(0, -5, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 舷窗
      ctx.fillStyle = '#4fc3f7';
      ctx.fillRect(-6, 0, 3, 3);
      ctx.fillRect(3, 0, 3, 3);
    },
  },
  {
    id: 'thunder', name: '雷霆重炮',
    // 发射参数：范围大 + 射速快 —— 0.1 秒一发（约 10 发/秒），粗大弹体，弹速极高
    stats: { cooldown: 0.1, bulletSpeed: 720, bulletW: 10, bulletH: 24, damage: 1, bulletColor: '#b9f6ca' },
    // 重炮造型：粗壮炮管 + 双侧能量罐
    draw(ctx) {
      // 双侧能量罐
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(-13, 2, 6, 0, Math.PI * 2);
      ctx.arc(13, 2, 6, 0, Math.PI * 2);
      ctx.fill();
      // 粗壮炮身
      ctx.fillStyle = '#43a047';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-12, 10);
      ctx.lineTo(12, 10);
      ctx.closePath();
      ctx.fill();
      // 中央粗炮管
      ctx.fillStyle = '#c8e6c9';
      ctx.fillRect(-4, -20, 8, 16);
      // 炮口能量环
      ctx.fillStyle = '#b9f6ca';
      ctx.beginPath();
      ctx.arc(0, -19, 4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
];

class BeeGame {
  // skins: { bee: 蜜蜂皮肤下标, ship: 大炮皮肤下标 }，由 Vue 层传入
  constructor(canvas, hooks, skins = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks; // { onScore, onLives, onWave, onGameOver }
    this.skins = skins; // 当前选中的皮肤
    this.keys = {};
    this.running = false;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.lastTime = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    // 玩家：位于屏幕底部，speed 为水平移动速度（像素/秒）
    this.player = { x: W / 2, y: H - 56, w: 34, h: 26, speed: 300, cooldown: 0 };
    this.bullets = [];        // 玩家发射的蜂蜜弹
    this.enemies = [];        // 当前编队中的蜜蜂
    this.enemyBullets = [];   // 蜜蜂发射的敌弹
    this.particles = [];      // 爆炸粒子特效
    this.score = 0;           // 当前得分
    this.lives = 3;           // 玩家生命值：初始 3 条命，归零后游戏结束
    this.wave = 1;            // 当前关卡（波次），每清空一波蜜蜂进入下一关
    this.swayDir = 1;         // 编队左右摇摆方向（1 向右，-1 向左）
    this.swayOffset = 0;      // 编队摇摆的当前偏移量（像素）
    this.diveTimer = 1.5;     // 俯冲计时器：归零时随机选一只蜜蜂俯冲
    this.gameOver = false;    // 游戏结束标记
    this.nukes = 100;          // 核弹数量：每局固定 10 发，X 键发射
    this.shake = 0;           // 屏幕震动计时（核弹命中时触发）
    this.spawnWave();
    this.hooks.onScore(this.score);
    this.hooks.onLives(this.lives);
    this.hooks.onWave(this.wave);
    if (this.hooks.onNukes) this.hooks.onNukes(this.nukes);
    this.running = true;
  }

  stop() { this.running = false; }

  spawnWave() {
    this.enemies = [];
    const cols = 8, rows = 4;             // 编队规模：8 列 × 4 行
    // 难度递增①：每推进一关，编队左右移动的基础速度 +18（像素/秒）
    const speed = 60 + (this.wave - 1) * 18;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.enemies.push({
          col: c, row: r,
          // 编队内的相对位置
          baseX: 70 + c * 46,
          baseY: 70 + r * 46,
          x: 0, y: 0,
          w: 30, h: 24,
          speed,
          hp: r === 0 ? 2 : 1,            // 第一排是蜂王，血量 2；普通蜜蜂血量 1
          king: r === 0,                  // 蜂王标记：得分翻倍（200 分）
          diving: false,                  // 是否处于俯冲状态
          diveVX: 0, diveVY: 0,           // 俯冲速度向量
          fireDelay: 0.8 + Math.random() * 1.6, // 俯冲时下次开火的间隔（秒）
          flap: Math.random() * Math.PI * 2,    // 翅膀扇动动画相位
        });
      }
    }
  }

  loop(t) {
    // 先调度下一帧再执行本帧逻辑：即使某帧抛出异常，循环也不会永久卡死
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    if (this.running) this.update(dt);
    this.draw();
  }

  update(dt) {
    // 屏幕震动衰减：核弹命中后 0.25 秒内画面持续抖动
    this.shake = Math.max(0, this.shake - dt);
    this.updatePlayer(dt);
    this.updateFormation(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.checkCollisions();

    // 所有蜜蜂被清空：进入下一关，并给予过关奖励分
    if (this.enemies.length === 0) {
      this.wave++;
      this.hooks.onWave(this.wave);
      this.score += 100; // 过关奖励
      this.hooks.onScore(this.score);
      this.spawnWave();  // 生成新一波蜜蜂（速度/下压幅度随关卡提升）
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) p.x -= p.speed * dt;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) p.x += p.speed * dt;
    p.x = Math.max(p.w / 2 + 6, Math.min(W - p.w / 2 - 6, p.x));

    p.cooldown -= dt;
    // 发射参数来自当前选中大炮的 stats（射速/弹速/弹体大小/伤害）
    const st = SHIP_STYLES[this.skins.ship % SHIP_STYLES.length].stats;
    if ((this.keys['Space'] || this.keys['ArrowUp'] || this.keys['KeyW']) && p.cooldown <= 0) {
      this.bullets.push({
        x: p.x, y: p.y - 16,
        vy: -st.bulletSpeed,          // 弹速
        w: st.bulletW, h: st.bulletH, // 弹体大小（决定碰撞"范围"）
        damage: st.damage,            // 单发伤害
        color: st.bulletColor,
      });
      p.cooldown = st.cooldown; // 射击间隔
    }
    // 核弹：X 键发射，伤害 999 一发震碎任何蜜蜂（含蜂王），且可穿透继续摧毁后方目标
    if (this.keys['KeyX'] && this.nukes > 0 && p.cooldown <= 0) {
      this.nukes--;
      this.hooks.onNukes(this.nukes); // 更新 HUD 剩余数量
      this.bullets.push({
        x: p.x, y: p.y - 30,  // 发射起点：炮口前方（y-30 约一个半径，避免圆形弹体与机身重叠）
        vy: -420,             // 飞行速度（像素/秒），负值表示向上；比普通弹慢，更有"重磅"感
        // —— 弹体尺寸（圆形）——
        w: 148,               // 核弹直径（像素）：圆形弹体，绘制半径 = w/2，
                              //   碰撞判定也按直径计算。编队相邻两列蜜蜂间距 46px，
                              //   直径 148 已可一次横扫多列蜜蜂
        h: 148,               // 必须与 w 保持一致！碰撞/绘制都以圆形处理，
                              //   h 过小会导致垂直判定窗口过窄，高速飞行时漏检
        // —— 伤害属性 ——
        damage: 999,          // 单发伤害：999 远超蜂王血量 2，保证一击必碎
        color: '#ff9100',     // 弹体颜色（橙色）
        nuke: true,           // 核弹标记：true = 命中后穿透不清除 + 按圆形绘制；普通子弹无此字段
      });
      p.cooldown = 0.35;      // 发射间隔（秒）：0.35 秒一发，避免一按 X 全放出去
    }
  }

  updateFormation(dt) {
    this.swayOffset += this.swayDir * 30 * dt;
    if (this.swayOffset > 40) this.swayDir = -1;
    if (this.swayOffset < -40) this.swayDir = 1;
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      e.flap += dt * 10;
      if (!e.diving) {
        // 编队位置 = 基础位置 + 左右摇摆 + 缓慢下压
        e.x = e.baseX + this.swayOffset;
        // 难度递增②：每推进一关，整个编队整体下压 8 像素，离玩家更近
        e.y = e.baseY + (this.wave - 1) * 8 + Math.sin(e.flap * 0.3) * 3;
        // 随机俯冲
        this.diveTimer -= dt;
        if (this.diveTimer <= 0) {
          // 难度递增③：关卡越高，俯冲触发间隔越短（最低 0.5 秒），压力越大
          this.diveTimer = Math.max(0.5, 2.2 - this.wave * 0.15) + Math.random();
          this.startDive(e);
        }
      } else {
        e.x += e.diveVX * dt;
        e.y += e.diveVY * dt;
        e.diveVY += 60 * dt; // 俯冲加速：模拟重力，越冲越快
        e.fireDelay -= dt;
        if (e.fireDelay <= 0) {
          e.fireDelay = 0.7 + Math.random() * 0.8; // 俯冲中每隔 0.7~1.5 秒开一次火
          // 难度递增④：敌弹下落速度随关卡提升（220 + 关卡×12 像素/秒）
          this.enemyBullets.push({ x: e.x, y: e.y + 14, vy: 220 + this.wave * 12, w: 5, h: 10 });
        }
        // 飞出屏幕后回到编队
        if (e.y > H + 40) {
          e.diving = false;
          e.y = e.baseY;
          e.x = e.baseX + this.swayOffset;
        }
      }
    }
  }

  startDive(e) {
    const p = this.player;
    e.diving = true;
    // 朝玩家当前位置俯冲（瞄向玩家所在的水平线）
    const dx = p.x - e.x, dy = (H - 60) - e.y;
    const len = Math.hypot(dx, dy) || 1;
    // 难度递增⑤：俯冲初速度随关卡提升（170 + 关卡×12 像素/秒）
    const sp = 170 + this.wave * 12;
    e.diveVX = (dx / len) * sp;
    e.diveVY = (dy / len) * sp;
  }

  updateBullets(dt) {
    for (const b of this.bullets) b.y += b.vy * dt;
    this.bullets = this.bullets.filter((b) => b.y + b.h > 0);
    for (const b of this.enemyBullets) b.y += b.vy * dt;
    this.enemyBullets = this.enemyBullets.filter((b) => b.y < H);
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  explode(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.4, color,
      });
    }
  }

  hit(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
  }

  // 核弹专用圆形碰撞判定：
  // - 半径 = 弹体直径的一半（取 w/h 较大值，兼容手动调整）
  // - 额外加上扫掠余量 vy*dt上限（0.05 秒），防止核弹高速飞行时一帧"跳过"目标造成漏检
  nukeHit(b, tx, ty, tw, th) {
    const r = Math.max(b.w, b.h) / 2 + Math.abs(b.vy) * 0.05;
    const dx = b.x - tx;
    const dy = (b.y + b.h / 2) - (ty + th / 2); // 圆心到目标中心的距离
    return Math.hypot(dx, dy) < r + Math.max(tw, th) / 2;
  }

  checkCollisions() {
    // 玩家子弹 -> 蜜蜂（核弹走圆形扫掠判定，普通子弹走矩形判定）
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        const hitNow = b.nuke
          ? this.nukeHit(b, e.x, e.y, e.w, e.h)
          : this.hit(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h);
        if (hitNow) {
          e.hp -= b.damage; // 扣血量 = 子弹伤害（黄金飞碟/核弹一发可击碎蜂王）
          if (b.nuke) {
            // 核弹穿透：命中后不清除子弹，继续震碎编队后方一串蜜蜂
            this.explode(e.x, e.y, '#ff9100');
            this.shake = 0.25; // 触发屏幕震动
          } else {
            b.y = -999; // 普通子弹：命中即消耗
          }
          if (e.hp <= 0) {
            this.explode(e.x, e.y, e.king ? '#ffb300' : '#ffd54a');
            this.enemies.splice(this.enemies.indexOf(e), 1);
            // 得分：蜂王 200 分，普通蜜蜂 100 分
            this.score += e.king ? 200 : 100;
            this.hooks.onScore(this.score);
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.y > -50);

    // 核弹 -> 敌弹：核弹经过时把蜜蜂发射的子弹全部震碎（圆形扫掠判定，含爆炸火花）
    for (const b of this.bullets) {
      if (!b.nuke) continue; // 只有核弹能摧毁敌弹，普通子弹不行
      // 先给被击中的敌弹生成爆炸特效
      for (const eb of this.enemyBullets) {
        if (this.nukeHit(b, eb.x, eb.y, eb.w, eb.h)) {
          this.explode(eb.x, eb.y, '#ff5252'); // 红色火花：敌弹被震碎
        }
      }
      // 再从敌弹列表中移除命中范围内的敌弹
      this.enemyBullets = this.enemyBullets.filter(
        (eb) => !this.nukeHit(b, eb.x, eb.y, eb.w, eb.h)
      );
    }

    // 敌弹 / 俯冲蜜蜂 -> 玩家
    const p = this.player;
    let dead = false;
    for (const b of this.enemyBullets) {
      if (this.hit(b.x, b.y, b.w, b.h, p.x, p.y, p.w, p.h)) { dead = true; break; }
    }
    if (!dead) {
      for (const e of this.enemies) {
        if (e.diving && this.hit(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {
          this.explode(e.x, e.y, '#ffd54a');
          this.enemies.splice(this.enemies.indexOf(e), 1);
          dead = true;
          break;
        }
      }
    }
    if (dead) this.playerHit();
  }

  playerHit() {
    // 玩家被击中：扣一条生命
    this.explode(this.player.x, this.player.y, '#ff7043');
    this.lives--;
    this.hooks.onLives(Math.max(0, this.lives)); // 更新 HUD 生命图标（不下探到负数）
    this.enemyBullets = []; // 清空敌弹，给玩家喘息空间
    if (this.lives <= 0) {
      // 生命耗尽：游戏结束，回调通知 Vue 层弹出结算界面
      this.running = false;
      this.hooks.onGameOver(this.score, this.wave);
    } else {
      // 还有生命：重生并短暂无敌（约 0.9 秒），期间把玩家移出屏幕避开敌弹
      this.player.y = H + 80;
      setTimeout(() => { if (this.player) this.player.y = H - 56; }, 900);
    }
  }

  /* ---------- 绘制 ---------- */

  draw() {
    const ctx = this.ctx;
    ctx.save();
    // 核弹命中时的屏幕震动：随机偏移整个画面
    if (this.shake > 0) {
      const s = this.shake * 16;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    // 星空背景
    ctx.fillStyle = '#0d1220';
    ctx.fillRect(-20, -20, W + 40, H + 40); // 稍微画出边界，避免震动露边
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + 31) % W;
      const y = (i * 53 + 17) % H;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    if (!this.player) { ctx.restore(); return; }

    this.drawEnemies(ctx);
    this.drawBullets(ctx);
    if (this.running || this.lives > 0) this.drawPlayer(ctx);
    this.drawParticles(ctx);
    ctx.restore();
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (p.y > H) return; // 重生中（无敌）
    ctx.save();
    ctx.translate(p.x, p.y);
    // 用当前选中的大炮皮肤绘制（位于屏幕中心坐标系）
    SHIP_STYLES[this.skins.ship % SHIP_STYLES.length].draw(ctx, p);
    ctx.restore();
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const flap = Math.sin(e.flap) * 6; // 翅膀扇动的实时偏移量
      // 用当前选中的蜜蜂皮肤绘制（蜂王 king 标记会改变配色/大小）
      BEE_STYLES[this.skins.bee % BEE_STYLES.length].draw(ctx, e, flap, e.king);
      ctx.restore();
    }
  }

  drawBullets(ctx) {
    // 玩家子弹：按当前大炮的弹体大小和颜色绘制（大炮弹更粗更长）
    for (const b of this.bullets) {
      if (b.nuke) {
        // 核弹：圆形弹体，圆心 = (x, y + h/2)，半径 = w/2（直径见发射参数）
        const cy = b.y + b.h / 2;  // 圆心纵坐标（y 为圆外接框顶部）
        const r = b.w / 2;         // 半径 = 直径的一半
        // 外圈橙色光晕
        ctx.fillStyle = 'rgba(255,145,0,0.35)';
        ctx.beginPath();
        ctx.arc(b.x, cy, r + 8, 0, Math.PI * 2);
        ctx.fill();
        // 圆形弹体主体
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // 中心白色内核（高亮）
        ctx.fillStyle = '#fffde7';
        ctx.beginPath();
        ctx.arc(b.x, cy, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 普通子弹：矩形弹体
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h);
      }
    }
    ctx.fillStyle = '#ff5252'; // 敌弹
    for (const b of this.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y + 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}

// 模块导出：蜜蜂皮肤、大炮皮肤、游戏引擎类
export { BEE_STYLES, SHIP_STYLES, BeeGame };

