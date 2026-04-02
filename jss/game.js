// game.js — Main game controller

const LEVELS = [
  {
    objects: [
      { x: 160, y: 180, r: 15, mass: 2.0, color: '#1040a0', glow: '#4488ff', label: 'DBR' },
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

const NEBULA_BLOBS = [
  { x: 120, y:  80, r: 190, c: '#0a1a4a' },
  { x: 660, y: 120, r: 150, c: '#1a0a30' },
  { x: 400, y: 450, r: 210, c: '#080a20' },
  { x: 730, y: 400, r: 140, c: '#0a1530' },
];

class Game {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.W       = canvas.width;
    this.H       = canvas.height;
    this.score     = 0;
    this.level     = 1;
    this._levelIdx = 0;
    this.collisions = 0;
    this.won        = false;
    this.winTimer   = 0;
    this.frame      = 0;
    this.objects   = [];
    this.obstacles = [];
    this.sparks    = [];
    this.target    = null;
    this.barrier   = null;
    this.stars           = this._buildStars(170);
    this.nebulaOffscreen = this._buildNebulaOffscreen();
    this.ui = new UI({ canvas: canvas, onReset: () => this._resetRound() });
    this._initLevel();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initLevel() {
    var def = LEVELS[this._levelIdx % LEVELS.length];
    var self = this;
    this.objects = def.objects.map(function(d) {
      return new PhysObj(d.x, d.y, d.r, d.mass, d.color, d.glow, d.label);
    });
    this.obstacles = def.obstacles.map(function(d) {
      return new StaticObstacle(d.x, d.y, d.shape, d.size);
    });
    this.target  = new TargetZone(def.targetX, def.targetY, def.targetR);
    this.barrier = new TargetBarrier(def.targetX, def.targetY, def.barrierR, def.barrierThickness, def.barrierGap);
    this.sparks     = [];
    this.won        = false;
    this.winTimer   = 0;
    this.collisions = 0;
    this.ui.attachObjects(this.objects);
    this.ui.hideWin();
    this.ui.setCollisions(0);
  }

  _resetRound() { this._initLevel(); }

  _loop() {
    this.frame++;
    var i, j;

    for (i = 0; i < this.objects.length; i++) {
      Physics.stepObject(this.objects[i], this.W, this.H, this.sparks);
    }
    this.target.update();
    Physics.stepSparks(this.sparks);

    for (i = 0; i < this.objects.length; i++) {
      for (j = i + 1; j < this.objects.length; j++) {
        var hit = Physics.resolveCollision(this.objects[i], this.objects[j], this.sparks);
        if (hit) { this.collisions++; this.ui.setCollisions(this.collisions); }
      }
    }

    for (i = 0; i < this.obstacles.length; i++) {
      for (j = 0; j < this.objects.length; j++) {
        Physics.bounceOffObstacle(this.objects[j], this.obstacles[i], this.sparks);
      }
    }

    for (i = 0; i < this.objects.length; i++) {
      Physics.bounceOffBarrier(this.objects[i], this.barrier);
    }

    if (!this.won && this.target.overlaps(this.objects[0])) {
      this._triggerWin();
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
    this.won      = true;
    this.winTimer = 150;
    var bonus = Math.max(0, 10 - this.collisions) * 50;
    this.score += 100 + bonus;
    this.ui.setScore(this.score);
    this.target.hit   = true;
    this.target.flash = 1;
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#00ff88', 50);
    Physics.spawnSparks(this.sparks, this.target.x, this.target.y, '#ffffff', 25);
    this.ui.showWin(bonus > 0 ? '+' + bonus + ' EFFICIENCY BONUS' : '');
  }

  _draw() {
    var ctx = this.ctx, W = this.W, H = this.H, frame = this.frame;
    ctx.fillStyle = '#030a18';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.nebulaOffscreen, 0, 0);
    this._drawGrid();
    this._drawStars();
    this.barrier.draw(ctx);
    this.target.draw(ctx);
    for (var i = 0; i < this.obstacles.length; i++) this.obstacles[i].draw(ctx, frame);
    for (var j = 0; j < this.objects.length;   j++) this.objects[j].draw(ctx);
    this._drawSparks();
  }

  _drawGrid() {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.strokeStyle = '#ffffff05';
    ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (var y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  }

  _drawStars() {
    var ctx = this.ctx;
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.phase += s.speed;
      var a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase));
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
      var g = nc.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'transparent');
      nc.fillStyle = g;
      nc.beginPath(); nc.arc(b.x, b.y, b.r, 0, Math.PI * 2); nc.fill();
    }
    return oc;
  }

  _buildStars(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({ x: Math.random()*this.W, y: Math.random()*this.H, r: Math.random()*1.25, phase: Math.random()*Math.PI*2, speed: 0.008+Math.random()*0.018 });
    }
    return out;
  }
}

window.Game = Game;
