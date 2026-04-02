// game.js — Main game controller (portrait slingshot edition)

const LEVELS = [
  {
    objects: [
      { x: 0.18, y: 0.0, r: 15, mass: 2.0, color: '#1040a0', glow: '#4488ff', label: 'DBR' },
      { x: 0.50, y: 0.0, r: 12, mass: 1.5, color: '#7730c0', glow: '#cc44ff', label: 'OBJ' },
      { x: 0.78, y: 0.0, r: 10, mass: 1.0, color: '#804020', glow: '#ff8844', label: 'SML' },
    ],
    obstacles: [
      { rx: 0.28, ry: 0.52, shape: 'triangle', size: 28 },
      { rx: 0.70, ry: 0.42, shape: 'square',   size: 24 },
      { rx: 0.50, ry: 0.32, shape: 'hexagon',  size: 30 },
    ],
    targetRX: 0.50, targetRY: 0.08, targetR: 30,
    barrierR: 72, barrierThickness: 13, barrierGap: Math.PI * 0.25,
    barrierGapAngle: -Math.PI / 2,
  },
];

const NEBULA_BLOBS = [
  { rx: 0.15, ry: 0.12, r: 180, c: '#0a1a4a' },
  { rx: 0.85, ry: 0.20, r: 150, c: '#1a0a30' },
  { rx: 0.50, ry: 0.55, r: 200, c: '#080a20' },
  { rx: 0.20, ry: 0.80, r: 140, c: '#0a1530' },
];

const SLING_MIN_OFFSET = 10;
const SLING_MAX_PULL   = 180;
const SLING_POWER      = 0.38;

// Floor sits this many px above the bottom edge — gives drag room
const FLOOR_MARGIN = 140;

// Default settings (all multipliers, 1.0 = 100%)
var Settings = {
  velocityMult: 1.0,   // 1.0 – 3.0
  bounceMult:   1.0,   // 0.3 – 2.0
  gravityMult:  1.0,   // 0.3 – 2.0
};

class Game {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.resize();

    this.score      = 0;
    this.level      = 1;
    this._levelIdx  = 0;
    this.collisions = 0;
    this.won        = false;
    this.winTimer   = 0;
    this.frame      = 0;

    this.objects   = [];
    this.obstacles = [];
    this.sparks    = [];
    this.target    = null;
    this.barrier   = null;
    this.sling     = null;

    this.stars           = this._buildStars(180);
    this.nebulaOffscreen = this._buildNebulaOffscreen();

    this.ui = new UI({ canvas: canvas, onReset: () => this._resetRound() });
    this._initLevel();
    this._bindInput();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    window.addEventListener('resize', () => {
      this.resize();
      this.nebulaOffscreen = this._buildNebulaOffscreen();
      this._initLevel();
    });
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
  }

  floorY() {
    // The visual ground line — balls rest here
    return this.H - FLOOR_MARGIN;
  }

  _initLevel() {
    var W = this.W;
    var floorY = this.floorY();
    var def = LEVELS[this._levelIdx % LEVELS.length];

    this.objects = def.objects.map(function(d) {
      var x = d.x * W;
      var r = d.r;
      var y = floorY - r;
      return new PhysObj(x, y, r, d.mass, d.color, d.glow, d.label);
    });

    this.obstacles = def.obstacles.map(function(d) {
      return new StaticObstacle(d.rx * W, d.ry * (floorY), d.shape, d.size);
    });

    var tx = def.targetRX * W;
    var ty = def.targetRY * floorY + def.targetR + def.barrierR;
    this.target  = new TargetZone(tx, ty, def.targetR);
    this.barrier = new TargetBarrier(tx, ty, def.barrierR, def.barrierThickness, def.barrierGap, def.barrierGapAngle);

    this.sparks     = [];
    this.won        = false;
    this.winTimer   = 0;
    this.collisions = 0;
    this.sling      = null;

    this.ui.attachObjects(this.objects);
    this.ui.hideWin();
    this.ui.setCollisions(0);
  }

  _resetRound() { this._initLevel(); }

  // ── Input ──────────────────────────────────────────────────────────────────

  _bindInput() {
    var self   = this;
    var canvas = this.canvas;

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function onDown(e) {
      // Don't intercept taps on the HUD overlay (buttons, settings panel)
      var tag = e.target ? e.target.tagName : '';
      if (tag === 'BUTTON' || tag === 'INPUT' || e.target === document.getElementById('settings-panel') ||
          (e.target && e.target.closest && e.target.closest('#hud-overlay')) ||
          (e.target && e.target.closest && e.target.closest('#settings-panel'))) {
        return;
      }
      e.preventDefault();
      if (window.Sound) Sound.getCtx(); // unlock audio on first touch

      var pos = getPos(e);
      var best = null, bestDist = 9999;

      for (var i = 0; i < self.objects.length; i++) {
        var obj = self.objects[i];
        var dx = pos.x - obj.x;
        var dy = pos.y - obj.y;
        // Allow grab if finger is within 2.5r horizontally AND at or below the ball
        if (Math.abs(dx) < obj.r * 2.5 && dy >= -obj.r) {
          var dist = Math.hypot(dx, dy);
          if (dist < bestDist) { bestDist = dist; best = obj; }
        }
      }

      if (best) {
        best.vx = 0; best.vy = 0;
        best.pinned = true;
        self.sling = {
          obj:     best,
          anchorX: best.x,
          anchorY: best.y,
          pullX:   pos.x,
          pullY:   pos.y,
        };
      }
    }

    function onMove(e) {
      e.preventDefault();
      if (!self.sling) return;
      var pos = getPos(e);
      self.sling.pullX = pos.x;
      self.sling.pullY = pos.y;

      var dx   = self.sling.anchorX - pos.x;
      var dy   = self.sling.anchorY - pos.y;
      var dist = Math.hypot(dx, dy);
      if (dist > SLING_MIN_OFFSET && window.Sound) {
        Sound.stretch(Math.min(dist, SLING_MAX_PULL) / SLING_MAX_PULL);
      }
    }

    function onUp(e) {
      e.preventDefault();
      if (!self.sling) return;
      var s   = self.sling;
      var obj = s.obj;

      var dx   = s.anchorX - s.pullX;
      var dy   = s.anchorY - s.pullY;
      var dist = Math.hypot(dx, dy);

      if (dist > SLING_MIN_OFFSET) {
        var rawPower = Math.min(dist, SLING_MAX_PULL) * SLING_POWER;
        var power    = rawPower * Settings.velocityMult;
        obj.vx = (dx / dist) * power;
        obj.vy = (dy / dist) * power;
        if (window.Sound) Sound.snap(Math.min(dist, SLING_MAX_PULL) / SLING_MAX_PULL);
      }

      obj.pinned = false;
      self.sling = null;
    }

    canvas.addEventListener('mousedown',   onDown);
    canvas.addEventListener('mousemove',   onMove);
    canvas.addEventListener('mouseup',     onUp);
    canvas.addEventListener('mouseleave',  onUp);
    canvas.addEventListener('touchstart',  onDown, { passive: false });
    canvas.addEventListener('touchmove',   onMove, { passive: false });
    canvas.addEventListener('touchend',    onUp,   { passive: false });
    canvas.addEventListener('touchcancel', onUp,   { passive: false });
    canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  _loop() {
    this.frame++;
    var i, j;
    var floorY = this.floorY();

    // Step physics — pass floorY as the effective bottom wall
    for (i = 0; i < this.objects.length; i++) {
      var obj = this.objects[i];
      if (!obj.pinned) {
        Physics.stepObject(obj, this.W, floorY, this.sparks, Settings);
      }

      // Reset inFlight once ball slows down enough to be grabbed again
      if (obj.inFlight && Math.abs(obj.vy) < 1.2 && Math.abs(obj.vx) < 1.2) {
        obj.inFlight = false;
      }
    }

    this.target.update();
    Physics.stepSparks(this.sparks);

    // Object–object
    for (i = 0; i < this.objects.length; i++) {
      for (j = i + 1; j < this.objects.length; j++) {
        var hit = Physics.resolveCollision(this.objects[i], this.objects[j], this.sparks);
        if (hit) { this.collisions++; this.ui.setCollisions(this.collisions); }
      }
    }

    // Object–obstacle
    for (i = 0; i < this.obstacles.length; i++) {
      for (j = 0; j < this.objects.length; j++) {
        Physics.bounceOffObstacle(this.objects[j], this.obstacles[i], this.sparks);
      }
    }

    // Object–barrier
    for (i = 0; i < this.objects.length; i++) {
      Physics.bounceOffBarrier(this.objects[i], this.barrier);
    }

    // Win check — debris (index 0) must enter target zone
    if (!this.won) {
      var debris = this.objects[0];
      var tdx = debris.x - this.target.x;
      var tdy = debris.y - this.target.y;
      if (Math.hypot(tdx, tdy) < this.target.r + debris.r) {
        this._triggerWin();
      }
    }

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

    this._draw();
    requestAnimationFrame(this._loop);
  }

  _triggerWin() {
    this.won = true; this.winTimer = 150;
    var bonus = Math.max(0, 10 - this.collisions) * 50;
    this.score += 100 + bonus;
    this.ui.setScore(this.score);
    this.target.hit = true; this.target.flash = 1;
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#00ff88', 50);
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#ffffff', 25);
    this.ui.showWin(bonus > 0 ? '+' + bonus + ' EFFICIENCY BONUS' : '');
    if (window.Sound) Sound.win();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _draw() {
    var ctx    = this.ctx;
    var W      = this.W;
    var H      = this.H;
    var floorY = this.floorY();

    ctx.fillStyle = '#030a18';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.nebulaOffscreen, 0, 0);
    this._drawGrid();
    this._drawStars();
    this._drawFloor(floorY);

    this.barrier.draw(ctx);
    this.target.draw(ctx);
    for (var i = 0; i < this.obstacles.length; i++) this.obstacles[i].draw(ctx, this.frame);
    for (var j = 0; j < this.objects.length;   j++) this.objects[j].draw(ctx);

    if (this.sling) this._drawSling();
    this._drawSparks();
  }

  _drawFloor(floorY) {
    var ctx = this.ctx, W = this.W, H = this.H;

    // Dim zone below the floor (the drag area)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, floorY, W, H - floorY);

    // Glowing ground line
    ctx.save();
    ctx.strokeStyle = 'rgba(0,180,255,0.55)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur  = 10;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    ctx.shadowBlur  = 0;

    // "DRAG ZONE" label
    ctx.fillStyle    = 'rgba(0,140,200,0.25)';
    ctx.font         = "10px 'Share Tech Mono', monospace";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('▼  PULL DOWN TO AIM  ▼', W / 2, floorY + 8);
    ctx.restore();
  }

  _drawSling() {
    var ctx  = this.ctx;
    var s    = this.sling;
    var obj  = s.obj;
    var dx   = s.anchorX - s.pullX;
    var dy   = s.anchorY - s.pullY;
    var dist = Math.hypot(dx, dy);
    if (dist < SLING_MIN_OFFSET) return;

    var power = Math.min(dist, SLING_MAX_PULL) / SLING_MAX_PULL;

    ctx.save();

    // Band lines
    ctx.strokeStyle = 'rgba(255,200,60,' + (0.45 + power * 0.5) + ')';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ffcc30';
    ctx.shadowBlur  = 8;
    ctx.beginPath(); ctx.moveTo(obj.x - obj.r * 0.5, obj.y); ctx.lineTo(s.pullX, s.pullY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(obj.x + obj.r * 0.5, obj.y); ctx.lineTo(s.pullX, s.pullY); ctx.stroke();
    ctx.shadowBlur = 0;

    // Trajectory dots
    var vx  = (dx / dist) * Math.min(dist, SLING_MAX_PULL) * SLING_POWER * Settings.velocityMult;
    var vy  = (dy / dist) * Math.min(dist, SLING_MAX_PULL) * SLING_POWER * Settings.velocityMult;
    var px  = obj.x, py = obj.y;
    var gravity = Physics.PHYSICS.GRAVITY * Settings.gravityMult;
    var friction = Physics.PHYSICS.FRICTION;

    for (var i = 0; i < 32; i++) {
      vy += gravity; vx *= friction; vy *= friction;
      px += vx; py += vy;
      if (px < 0 || px > this.W || py < 0 || py > this.floorY()) break;
      var alpha = (1 - i / 32) * power * 0.75;
      var dotR  = (1 - i / 32) * 4.5 * power + 1;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,80,' + alpha + ')';
      ctx.fill();
    }

    // Finger circle
    ctx.beginPath();
    ctx.arc(s.pullX, s.pullY, 10 + power * 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,200,60,' + (0.35 + power * 0.5) + ')';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawGrid() {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.strokeStyle = '#ffffff04';
    ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (var y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  }

  _drawStars() {
    var ctx = this.ctx;
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.phase += s.speed;
      var a = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(175,195,255,' + a + ')';
      ctx.fill();
    }
  }

  _drawSparks() {
    var ctx = this.ctx, sparks = this.sparks;
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      ctx.fillStyle   = s.color + Math.floor(s.life * 220).toString(16).padStart(2, '0');
      ctx.shadowColor = s.color;
      ctx.shadowBlur  = 5;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _buildNebulaOffscreen() {
    var oc = document.createElement('canvas');
    oc.width = this.W; oc.height = this.H;
    var nc = oc.getContext('2d');
    for (var i = 0; i < NEBULA_BLOBS.length; i++) {
      var b = NEBULA_BLOBS[i];
      var bx = b.rx * this.W, by = b.ry * this.H;
      var g = nc.createRadialGradient(bx, by, 0, bx, by, b.r);
      g.addColorStop(0, b.c); g.addColorStop(1, 'transparent');
      nc.fillStyle = g;
      nc.beginPath(); nc.arc(bx, by, b.r, 0, Math.PI * 2); nc.fill();
    }
    return oc;
  }

  _buildStars(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({ x: Math.random()*this.W, y: Math.random()*this.H, r: Math.random()*1.3, phase: Math.random()*Math.PI*2, speed: 0.008+Math.random()*0.018 });
    }
    return out;
  }
}

window.Game = Game;
window.Settings = Settings;
