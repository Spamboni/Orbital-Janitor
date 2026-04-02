/**
 * game.js
 * Main game controller.
 *  - Owns the game loop (requestAnimationFrame)
 *  - Manages level state & win detection
 *  - Coordinates Physics, GameObjects, and UI
 *  - Handles all canvas rendering calls
 */

'use strict';

// ── Level definitions ─────────────────────────────────────────────────────────
// Add more entries here for future levels.
const LEVELS = [
  {
    objects: [
      { x: 160, y: 180, r: 15, mass: 2.0, color: '#1040a0', glow: '#4488ff', label: 'DBR' },  // ← debris (index 0)
      { x: 400, y: 200, r: 12, mass: 1.5, color: '#7730c0', glow: '#cc44ff', label: 'OBJ' },
      { x: 580, y: 260, r: 10, mass: 1.0, color: '#804020', glow: '#ff8844', label: 'SML' },
    ],
    obstacles: [
      { x: 280, y: 220, shape: 'triangle', size: 32 },
      { x: 520, y: 270, shape: 'square',   size: 28 },
      { x: 380, y: 430, shape: 'hexagon',  size: 36 },
    ],
    targetX: 680, targetY: 460, targetR: 32,
    barrierR: 80, barrierThickness: 14, barrierGap: Math.PI * 0.22,
  },
];

// ── Background assets (built once) ───────────────────────────────────────────
const NEBULA_BLOBS = [
  { x: 120, y:  80, r: 190, c: '#0a1a4a' },
  { x: 660, y: 120, r: 150, c: '#1a0a30' },
  { x: 400, y: 450, r: 210, c: '#080a20' },
  { x: 730, y: 400, r: 140, c: '#0a1530' },
];

// ── Game class ────────────────────────────────────────────────────────────────

class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.W       = canvas.width;
    this.H       = canvas.height;

    // Score / meta state
    this.score      = 0;
    this.level      = 1;   // display (1-based)
    this._levelIdx  = 0;   // index into LEVELS array (wraps)

    // Per-round state
    this.collisions = 0;
    this.won        = false;
    this.winTimer   = 0;    // frames until auto-reset
    this.frame      = 0;

    // Gameplay objects
    this.objects   = [];   // PhysObj[]
    this.obstacles = [];   // StaticObstacle[]
    this.sparks    = [];   // Spark[]
    this.target    = null; // TargetZone
    this.barrier   = null; // TargetBarrier

    // Background
    this.stars         = this._buildStars(170);
    this.nebulaOffscreen = this._buildNebulaOffscreen();

    // UI controller
    this.ui = new UI({
      canvas,
      onReset: () => this._resetRound(),
    });

    this._initLevel();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ── Level init ─────────────────────────────────────────────────────────────

  _initLevel() {
    const def = LEVELS[this._levelIdx % LEVELS.length];

    this.objects = def.objects.map(d =>
      new PhysObj(d.x, d.y, d.r, d.mass, d.color, d.glow, d.label)
    );
    this.obstacles = def.obstacles.map(d =>
      new StaticObstacle(d.x, d.y, d.shape, d.size)
    );
    this.target  = new TargetZone(def.targetX, def.targetY, def.targetR);
    this.barrier = new TargetBarrier(
      def.targetX, def.targetY,
      def.barrierR, def.barrierThickness, def.barrierGap
    );

    this.sparks    = [];
    this.won       = false;
    this.winTimer  = 0;
    this.collisions = 0;

    this.ui.attachObjects(this.objects);
    this.ui.hideWin();
    this.ui.setCollisions(0);
  }

  _resetRound() {
    this._initLevel();
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  _loop() {
    this.frame++;

    // ── Update ──────────────────────────────────────────────────────────────
    for (const obj of this.objects) {
      Physics.stepObject(obj, this.W, this.H, this.sparks);
    }
    this.target.update();
    Physics.stepSparks(this.sparks);

    // Object–object collisions
    for (let i = 0; i < this.objects.length; i++) {
      for (let j = i + 1; j < this.objects.length; j++) {
        const hit = Physics.resolveCollision(this.objects[i], this.objects[j], this.sparks);
        if (hit) {
          this.collisions++;
          this.ui.setCollisions(this.collisions);
        }
      }
    }

    // Object–obstacle collisions
    for (const obs of this.obstacles) {
      for (const obj of this.objects) {
        Physics.bounceOffObstacle(obj, obs, this.sparks);
      }
    }

    // Object–barrier collisions
    for (const obj of this.objects) {
      Physics.bounceOffBarrier(obj, this.barrier);
    }

    // Win detection (only the DEBRIS object, index 0, counts)
    if (!this.won && this.target.overlaps(this.objects[0])) {
      this._triggerWin();
    }

    // Auto-reset countdown
    if (this.won && this.winTimer > 0) {
      this.winTimer--;
      if (this.winTimer === 0) {
        this._levelIdx++;
        this.level++;
        this.ui.setLevel(this.level);
        this.collisions = 0;
        this._initLevel();
      }
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    this._draw();

    requestAnimationFrame(this._loop);
  }

  _triggerWin() {
    this.won = true;
    this.winTimer = 150; // frames ≈ 2.5s at 60fps

    const bonus = Math.max(0, 10 - this.collisions) * 50;
    this.score += 100 + bonus;
    this.ui.setScore(this.score);

    this.target.hit   = true;
    this.target.flash = 1;

    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#00ff88', 50);
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#ffffff', 25);

    this.ui.showWin(bonus > 0 ? `+${bonus} EFFICIENCY BONUS` : '');
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _draw() {
    const { ctx, W, H, frame } = this;

    // Background
    ctx.fillStyle = '#030a18';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.nebulaOffscreen, 0, 0);
    this._drawGrid();
    this._drawStars();

    // Game objects
    this.barrier.draw(ctx);
    this.target.draw(ctx);
    for (const obs of this.obstacles) obs.draw(ctx, frame);
    for (const obj of this.objects)   obj.draw(ctx);

    // Sparks on top
    this._drawSparks();
  }

  _drawGrid() {
    const { ctx, W, H } = this;
    ctx.strokeStyle = '#ffffff05';
    ctx.lineWidth   = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _drawStars() {
    const { ctx } = this;
    for (const s of this.stars) {
      s.phase += s.speed;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(175,195,255,${a})`;
      ctx.fill();
    }
  }

  _drawSparks() {
    const { ctx, sparks } = this;
    for (const s of sparks) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      ctx.fillStyle  = s.color + Math.floor(s.life * 220).toString(16).padStart(2, '0');
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 5;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Background builders ────────────────────────────────────────────────────

  _buildNebulaOffscreen() {
    const oc  = document.createElement('canvas');
    oc.width  = this.W;
    oc.height = this.H;
    const nc  = oc.getContext('2d');
    for (const b of NEBULA_BLOBS) {
      const g = nc.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'transparent');
      nc.fillStyle = g;
      nc.beginPath(); nc.arc(b.x, b.y, b.r, 0, Math.PI * 2); nc.fill();
    }
    return oc;
  }

  _buildStars(n) {
    return Array.from({ length: n }, () => ({
      x:     Math.random() * this.W,
      y:     Math.random() * this.H,
      r:     Math.random() * 1.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.018,
    }));
  }
}
