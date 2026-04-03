// game.js — Main game controller

var SLING_MIN_OFFSET = 10;
var SLING_MAX_PULL   = 180;
var SLING_POWER      = 0.38;
var FLOOR_MARGIN     = 150;

var Settings = {
  gravityMult: 1.0,
};

// Ball spawn positions — evenly spaced, kept away from edges
function getSpawnX(index, total, W) {
  var margin = 0.10;
  var step   = (1.0 - margin * 2) / (total - 1);
  return (margin + step * index) * W;
}

// Target definition
var TARGET = {
  rx: 0.50, ry: 0.10,
  r:  30,
  barrierR: 70, barrierThickness: 13,
  barrierGap: Math.PI * 0.26,
  barrierGapAngle: -Math.PI / 2,
};

// Obstacle definitions (relative coords)
var OBSTACLES = [
  { rx: 0.22, ry: 0.50, shape: 'triangle', size: 26 },
  { rx: 0.75, ry: 0.42, shape: 'square',   size: 23 },
  { rx: 0.50, ry: 0.30, shape: 'hexagon',  size: 28 },
];

var NEBULA_BLOBS = [
  { rx: 0.15, ry: 0.10, r: 180, c: '#0a1a4a' },
  { rx: 0.85, ry: 0.22, r: 150, c: '#1a0a30' },
  { rx: 0.50, ry: 0.55, r: 200, c: '#080a20' },
];

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    // Resize FIRST so W/H are correct before _initLevel
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;

    this.score      = 0;
    this.level      = 1;
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

  floorY() { return this.H - FLOOR_MARGIN; }

  _makeBall(type, xFrac) {
    var bs  = BallSettings[type];
    var r   = bs.size;
    var x   = xFrac * this.W;
    var y   = this.floorY() - r;
    var obj = new PhysObj(x, y, r, r / 10, bs.color, bs.glow, bs.label.slice(0,3));
    obj.type     = type;
    obj.inFlight = false;
    obj.pinned   = false;
    // Type-specific state
    obj.exploded    = false;
    obj.hasStuck    = false;
    obj.hasSplit    = false;
    obj.stuckTo     = null;
    return obj;
  }

  _initLevel() {
    var self  = this;
    var W     = this.W;
    var types = [
      BALL_TYPES.BOUNCER,
      BALL_TYPES.EXPLODER,
      BALL_TYPES.STICKY,
      BALL_TYPES.SPLITTER,
      BALL_TYPES.GRAVITY,
    ];

    this.objects = types.map(function(type, i) {
      var x  = getSpawnX(i, types.length, W);
      var bs = BallSettings[type];
      var r  = bs.size;
      var y  = self.floorY() - r;
      var obj = new PhysObj(x, y, r, r / 10, bs.color, bs.glow, bs.label.slice(0, 3));
      obj.type     = type;
      obj.inFlight = false;
      obj.pinned   = false;
      obj.exploded = false;
      obj.hasStuck = false;
      obj.hasSplit = false;
      obj.stuckTo  = null;
      return obj;
    });

    this.obstacles = OBSTACLES.map(function(d) {
      return new StaticObstacle(d.rx * self.W, d.ry * self.floorY(), d.shape, d.size);
    });

    var tx = TARGET.rx * this.W;
    var ty = TARGET.ry * this.floorY() + TARGET.r + TARGET.barrierR;
    this.target  = new TargetZone(tx, ty, TARGET.r);
    this.barrier = new TargetBarrier(tx, ty, TARGET.barrierR, TARGET.barrierThickness,
                                     TARGET.barrierGap, TARGET.barrierGapAngle);

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

  _spawnFallingExploder() {
    var bs  = BallSettings.exploder;
    var r   = bs.size;
    // Drop from a random x near the top, above visible area
    var x   = (0.2 + Math.random() * 0.6) * this.W;
    var obj = new PhysObj(x, -r * 3, r, r / 10, bs.color, bs.glow, 'EXP');
    obj.type     = BALL_TYPES.EXPLODER;
    obj.inFlight = true;  // falling counts as in-flight
    obj.pinned   = false;
    obj.exploded = false;
    obj.dead     = false;
    obj.hasStuck = false;
    obj.hasSplit = false;
    obj.stuckTo  = null;
    // Give it a small random horizontal nudge
    obj.vx = (Math.random() - 0.5) * 3;
    obj.vy = 2;
    this.objects.push(obj);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _bindInput() {
    var self   = this;
    var canvas = this.canvas;

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function isUIElement(t) {
      if (!t) return false;
      var tag = t.tagName || '';
      if (tag === 'BUTTON' || tag === 'INPUT') return true;
      if (t.closest) {
        if (t.closest('#hud-overlay')) return true;
        if (t.closest('#settings-panel')) return true;
      }
      return false;
    }

    function onDown(e) {
      if (isUIElement(e.target)) return;
      e.preventDefault();
      if (window.Sound) Sound.getCtx();

      var pos  = getPos(e);
      var best = null, bestDist = 9999;

      for (var i = 0; i < self.objects.length; i++) {
        var obj = self.objects[i];
        if (obj.inFlight || obj.stuckTo || obj.exploded) continue;
        var dx = pos.x - obj.x;
        var dy = pos.y - obj.y;
        if (Math.abs(dx) < obj.r * 2.8 && dy >= -obj.r) {
          var dist = Math.hypot(dx, dy);
          if (dist < bestDist) { bestDist = dist; best = obj; }
        }
      }

      if (best) {
        best.vx = 0; best.vy = 0;
        best.pinned = true;
        self.sling = { obj: best, anchorX: best.x, anchorY: best.y, pullX: pos.x, pullY: pos.y };
      }
    }

    function onMove(e) {
      e.preventDefault();
      if (!self.sling) return;
      var pos = getPos(e);
      self.sling.pullX = pos.x;
      self.sling.pullY = pos.y;
      var dx = self.sling.anchorX - pos.x;
      var dy = self.sling.anchorY - pos.y;
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
      var dx  = s.anchorX - s.pullX;
      var dy  = s.anchorY - s.pullY;
      var dist = Math.hypot(dx, dy);

      if (dist > SLING_MIN_OFFSET) {
        var bs    = BallSettings[obj.type] || BallSettings.bouncer;
        var power = Math.min(dist, SLING_MAX_PULL) * SLING_POWER * bs.velocity * Settings.velocityMult;
        // Settings.velocityMult may not exist if old, default 1
        if (!Settings.velocityMult) Settings.velocityMult = 1.0;
        power = Math.min(dist, SLING_MAX_PULL) * SLING_POWER * (bs.velocity || 1.0);
        obj.vx = (dx / dist) * power;
        obj.vy = (dy / dist) * power;
        obj.inFlight = true;
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

    // --- Gravity wells pull/sling other objects ---
    // Expose sparks globally so balls.js can reference them
    window._gameSparks = this.sparks;
    for (i = 0; i < this.objects.length; i++) {
      var gw = this.objects[i];
      if (gw.type === BALL_TYPES.GRAVITY && gw.inFlight) {
        applyGravityWell(gw, this.objects);
      }
      // Reset slung list when gravity well comes to rest
      if (gw.type === BALL_TYPES.GRAVITY && !gw.inFlight && gw._slungIds && gw._slungIds.length > 0) {
        resetGravityWell(gw);
      }
    }

    // --- Physics step ---
    for (i = 0; i < this.objects.length; i++) {
      var obj = this.objects[i];
      if (obj.stuckTo) {
        // Follow whatever it's stuck to
        obj.x = obj.stuckTo.x + (obj._stickOffX || 0);
        obj.y = obj.stuckTo.y + (obj._stickOffY || 0);
        continue;
      }
      if (!obj.pinned) {
        var bs = BallSettings[obj.type] || BallSettings.bouncer;
        var physSettings = {
          gravityMult:  Settings.gravityMult || 1.0,
          bounceMult:   bs.bounciness || 1.0,
        };
        Physics.stepObject(obj, this.W, floorY, this.sparks, physSettings);
      }
      // Re-enable grabbing once slow enough
      if (obj.inFlight && Math.abs(obj.vy) < 1.2 && Math.abs(obj.vx) < 1.2) {
        obj.inFlight = false;
      }
    }

    this.target.update();
    Physics.stepSparks(this.sparks);

    // --- Object–object collisions ---
    var toAdd = []; // new balls spawned by splitter
    for (i = 0; i < this.objects.length; i++) {
      for (j = i + 1; j < this.objects.length; j++) {
        var a = this.objects[i];
        var b = this.objects[j];
        var hit = Physics.resolveCollision(a, b, this.sparks);
        if (hit) {
          this.collisions++;
          this.ui.setCollisions(this.collisions);
          // Exploder
          if (a.type === BALL_TYPES.EXPLODER && !a.exploded) triggerExplosion(a, this.objects, this.sparks);
          if (b.type === BALL_TYPES.EXPLODER && !b.exploded) triggerExplosion(b, this.objects, this.sparks);
          // Sticky
          this._tryStick(a, b);
          this._tryStick(b, a);
          // Splitter — only split mid-air
          if (a.type === BALL_TYPES.SPLITTER && !a.hasSplit && !a.isSplitChild && a.inFlight) {
            a.hasSplit = true;
            var kids = makeSplitChildren(a, BallSettings.splitter.splitCount);
            toAdd = toAdd.concat(kids);
          }
          if (b.type === BALL_TYPES.SPLITTER && !b.hasSplit && !b.isSplitChild && b.inFlight) {
            b.hasSplit = true;
            var kids2 = makeSplitChildren(b, BallSettings.splitter.splitCount);
            toAdd = toAdd.concat(kids2);
          }
        }
      }
    }
    // Add any split children
    for (i = 0; i < toAdd.length; i++) this.objects.push(toAdd[i]);

    // --- Remove dead exploders and respawn a fresh one dropping from above ---
    var deadIdx = -1;
    for (i = 0; i < this.objects.length; i++) {
      if (this.objects[i].dead) { deadIdx = i; break; }
    }
    if (deadIdx >= 0) {
      this.objects.splice(deadIdx, 1);
      this._spawnFallingExploder();
    }

    // --- Object–obstacle ---
    for (i = 0; i < this.obstacles.length; i++) {
      for (j = 0; j < this.objects.length; j++) {
        var o = this.objects[j];
        if (o.stuckTo) continue;
        var obsHit = Physics.bounceOffObstacle(o, this.obstacles[i], this.sparks);
        if (obsHit && o.type === BALL_TYPES.EXPLODER && !o.exploded) {
          triggerExplosion(o, this.objects, this.sparks);
        }      }
    }

    // --- Object–barrier ---
    for (i = 0; i < this.objects.length; i++) {
      if (!this.objects[i].stuckTo) Physics.bounceOffBarrier(this.objects[i], this.barrier);
    }

    // --- Win check (debris = first BOUNCER ball) ---
    if (!this.won) {
      var debris = this.objects[0]; // bouncer is always index 0
      var tdx = debris.x - this.target.x;
      var tdy = debris.y - this.target.y;
      if (Math.hypot(tdx, tdy) < this.target.r + debris.r) {
        this._triggerWin();
      }
    }

    if (this.won && this.winTimer > 0) {
      this.winTimer--;
      if (this.winTimer === 0) {
        this.level++;
        this.ui.setLevel(this.level);
        this.collisions = 0;
        this._initLevel();
      }
    }

    this._draw();
    requestAnimationFrame(this._loop);
  }

  _tryStick(sticky, other) {
    if (sticky.type !== BALL_TYPES.STICKY) return;
    if (sticky.stuckTo || other.stuckTo) return;
    // Stick to the object it hit
    sticky.stuckTo     = other;
    sticky._stickOffX  = sticky.x - other.x;
    sticky._stickOffY  = sticky.y - other.y;
    sticky.vx = 0; sticky.vy = 0;
    sticky.inFlight = false;
    if (window.Sound) Sound.thud(8);
  }

  _triggerWin() {
    this.won = true; this.winTimer = 160;
    var bonus = Math.max(0, 10 - this.collisions) * 50;
    this.score += 100 + bonus;
    this.ui.setScore(this.score);
    this.target.hit = true; this.target.flash = 1;
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#00ff88', 55);
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#ffffff', 25);
    this.ui.showWin(bonus > 0 ? '+' + bonus + ' BONUS' : '');
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

    // Draw gravity well range rings
    for (var g = 0; g < this.objects.length; g++) {
      var wo = this.objects[g];
      if (wo.type === BALL_TYPES.GRAVITY && wo.inFlight) {
        this._drawGravityRange(wo);
      }
    }

    this._drawFloor(floorY);
    this.barrier.draw(ctx);
    this.target.draw(ctx);
    for (var i = 0; i < this.obstacles.length; i++) this.obstacles[i].draw(ctx, this.frame);
    for (var j = 0; j < this.objects.length;   j++) this._drawBall(this.objects[j]);

    if (this.sling) this._drawSling();
    this._drawSparks();
  }

  _drawBall(obj) {
    if (obj.dead || obj.exploded) return;

    var ctx   = this.ctx;
    var bs    = BallSettings[obj.type] || BallSettings.bouncer;
    var pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.06 + obj.r);

    // Type indicator ring for non-bouncers
    if (obj.type !== BALL_TYPES.BOUNCER) {
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.r + 4 + pulse * 2, 0, Math.PI * 2);
      ctx.strokeStyle = bs.glow + '66';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    // Ball body
    obj.draw(ctx);

    // Type label below ball
    ctx.fillStyle    = bs.glow + 'aa';
    ctx.font         = "8px 'Share Tech Mono', monospace";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(bs.label, obj.x, obj.y + obj.r + 3);
  }

  _drawGravityRange(well) {
    var ctx   = this.ctx;
    var bs    = BallSettings.gravity;
    var range = bs.gravRange;
    var pulse = 0.4 + 0.3 * Math.sin(this.frame * 0.04);
    ctx.beginPath();
    ctx.arc(well.x, well.y, range, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,255,238,' + pulse * 0.35 + ')';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawFloor(floorY) {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,180,255,0.55)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur  = 10;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.fillStyle    = 'rgba(0,140,200,0.22)';
    ctx.font         = "9px 'Share Tech Mono', monospace";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('▼  PULL DOWN TO AIM  ▼', W / 2, floorY + 6);
    ctx.restore();
  }

  _drawSling() {
    var ctx   = this.ctx;
    var s     = this.sling;
    var obj   = s.obj;
    var dx    = s.anchorX - s.pullX;
    var dy    = s.anchorY - s.pullY;
    var dist  = Math.hypot(dx, dy);
    if (dist < SLING_MIN_OFFSET) return;
    var power = Math.min(dist, SLING_MAX_PULL) / SLING_MAX_PULL;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,60,' + (0.45 + power * 0.5) + ')';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ffcc30';
    ctx.shadowBlur  = 8;
    ctx.beginPath(); ctx.moveTo(obj.x - obj.r * 0.5, obj.y); ctx.lineTo(s.pullX, s.pullY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(obj.x + obj.r * 0.5, obj.y); ctx.lineTo(s.pullX, s.pullY); ctx.stroke();
    ctx.shadowBlur = 0;

    // Trajectory preview
    var bs   = BallSettings[obj.type] || BallSettings.bouncer;
    var vx   = (dx / dist) * Math.min(dist, SLING_MAX_PULL) * SLING_POWER * (bs.velocity || 1.0);
    var vy   = (dy / dist) * Math.min(dist, SLING_MAX_PULL) * SLING_POWER * (bs.velocity || 1.0);
    var px   = obj.x, py = obj.y;
    var grav = Physics.PHYSICS.GRAVITY * (Settings.gravityMult || 1.0);
    var fric = Physics.PHYSICS.FRICTION;
    for (var i = 0; i < 34; i++) {
      vy += grav; vx *= fric; vy *= fric;
      px += vx; py += vy;
      if (px < 0 || px > this.W || py < 0 || py > this.floorY()) break;
      var alpha = (1 - i / 34) * power * 0.75;
      ctx.beginPath();
      ctx.arc(px, py, (1 - i / 34) * 4.5 * power + 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,80,' + alpha + ')';
      ctx.fill();
    }

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
      out.push({ x: Math.random()*this.W, y: Math.random()*this.H,
                 r: Math.random()*1.3, phase: Math.random()*Math.PI*2,
                 speed: 0.008+Math.random()*0.018 });
    }
    return out;
  }
}

window.Game = Game;
window.Settings = Settings;
