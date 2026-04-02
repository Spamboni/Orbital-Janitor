/**
 * objects.js
 * Game entity classes.  Each class knows how to draw itself and nothing else.
 * All physics / mutation is handled in physics.js.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function lightenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(r + amt, 255)},${Math.min(g + amt, 255)},${Math.min(b + amt, 255)})`;
}

// ── PhysObj ───────────────────────────────────────────────────────────────────

class PhysObj {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} r        radius
   * @param {number} mass
   * @param {string} color    hex, e.g. '#1040a0'
   * @param {string} glowColor hex, e.g. '#4488ff'
   * @param {string} label    short text drawn on the ball
   */
  constructor(x, y, r, mass, color, glowColor, label) {
    this.x         = x;
    this.y         = y;
    this.r         = r;
    this.mass      = mass;
    this.color     = color;
    this.glowColor = glowColor;
    this.label     = label;

    this.vx       = 0;
    this.vy       = 0;
    this.dragging = false;
    this.grabbed  = false;   // true while pointer is actively holding
    this.pulse    = Math.random() * Math.PI * 2;
    this.trail    = [];      // { x, y, a }[]

    // drag internals — set by ui.js
    this.ox = 0;
    this.oy = 0;
  }

  draw(ctx) {
    // ── trail ──────────────────────────────────────────────────────
    for (let i = 0; i < this.trail.length; i++) {
      const t     = this.trail[i];
      const frac  = i / this.trail.length;
      const alpha = t.a * frac;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.r * 0.45 * frac, 0, Math.PI * 2);
      ctx.fillStyle = this.glowColor + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }

    // ── outer glow ────────────────────────────────────────────────
    const glowR = this.r + (this.grabbed ? 10 : 4) + Math.sin(this.pulse) * 2;
    const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR * 2.2);
    grd.addColorStop(0, this.glowColor + '55');
    grd.addColorStop(1, this.glowColor + '00');
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowR * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // ── body ──────────────────────────────────────────────────────
    const bodyGrd = ctx.createRadialGradient(
      this.x - this.r * 0.3, this.y - this.r * 0.3, 0,
      this.x, this.y, this.r
    );
    bodyGrd.addColorStop(0, lightenHex(this.color, this.grabbed ? 120 : 75));
    bodyGrd.addColorStop(1, this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrd;
    ctx.fill();

    // ── stroke ────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.strokeStyle   = this.glowColor;
    ctx.lineWidth     = this.grabbed ? 2.5 : 1.8;
    ctx.shadowColor   = this.glowColor;
    ctx.shadowBlur    = this.grabbed ? 22 : 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── drag ring (dashed) ────────────────────────────────────────
    if (this.grabbed) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,80,0.7)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── velocity arrow ────────────────────────────────────────────
    const speed = Math.hypot(this.vx, this.vy);
    if (!this.dragging && speed > 0.9) {
      const scale = Math.min(speed * 3.5, 32);
      const nx  = this.vx / speed, ny = this.vy / speed;
      const tip = {
        x: this.x + nx * (this.r + scale),
        y: this.y + ny * (this.r + scale),
      };
      ctx.beginPath();
      ctx.moveTo(this.x + nx * this.r, this.y + ny * this.r);
      ctx.lineTo(tip.x, tip.y);
      ctx.strokeStyle = this.glowColor + 'bb';
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 0;
      ctx.stroke();
      // arrowhead
      const a = Math.atan2(ny, nx);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - Math.cos(a - 0.42) * 7, tip.y - Math.sin(a - 0.42) * 7);
      ctx.lineTo(tip.x - Math.cos(a + 0.42) * 7, tip.y - Math.sin(a + 0.42) * 7);
      ctx.closePath();
      ctx.fillStyle = this.glowColor + 'bb';
      ctx.fill();
    }

    // ── label ─────────────────────────────────────────────────────
    ctx.fillStyle     = '#ffffffbb';
    ctx.font          = "bold 8px 'Share Tech Mono', monospace";
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(this.label, this.x, this.y);
  }

  /** Returns true if point (px, py) is inside the pick radius. */
  hitTest(px, py) {
    return Math.hypot(px - this.x, py - this.y) < this.r + 7;
  }
}

// ── StaticObstacle ────────────────────────────────────────────────────────────

class StaticObstacle {
  /**
   * @param {number} x
   * @param {number} y
   * @param {'triangle'|'square'|'hexagon'} shape
   * @param {number} size   bounding half-size
   */
  constructor(x, y, shape, size) {
    this.x          = x;
    this.y          = y;
    this.shape      = shape;
    this.size       = size;
    this.hitRadius  = size * 1.15;   // circular approximation for physics
    this.phase      = Math.random() * Math.PI * 2;
  }

  draw(ctx, frame) {
    const glow = 0.28 + 0.14 * Math.sin(frame * 0.022 + this.phase);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowColor = 'rgba(100,190,255,0.65)';
    ctx.shadowBlur  = 14;

    ctx.beginPath();
    switch (this.shape) {
      case 'triangle':
        ctx.moveTo(0, -this.size);
        ctx.lineTo(this.size * 0.87,  this.size * 0.5);
        ctx.lineTo(-this.size * 0.87, this.size * 0.5);
        ctx.closePath();
        break;
      case 'square':
        ctx.rect(-this.size, -this.size, this.size * 2, this.size * 2);
        break;
      case 'hexagon':
      default:
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 - Math.PI / 6;
          const px = Math.cos(a) * this.size;
          const py = Math.sin(a) * this.size;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    ctx.fillStyle   = `rgba(55,100,190,${glow * 0.5})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(100,200,255,${0.5 + glow * 0.45})`;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ── TargetZone ────────────────────────────────────────────────────────────────

class TargetZone {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} r  radius
   */
  constructor(x, y, r) {
    this.x     = x;
    this.y     = y;
    this.r     = r;
    this.hit   = false;
    this.pulse = 0;
    this.flash = 0;  // flash amount on hit, 0-1
  }

  update() {
    this.pulse = (this.pulse + 0.025) % (Math.PI * 2);
    if (this.flash > 0) this.flash -= 0.022;
  }

  draw(ctx) {
    const p     = 0.5 + 0.5 * Math.sin(this.pulse);
    const color = this.hit ? '90,255,160' : '255,55,90';
    const r     = this.r * (1 + p * 0.18);

    // Outer glow gradient
    const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2.4);
    grd.addColorStop(0, `rgba(${color},${0.32 + p * 0.18})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 2.4, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Fill
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color},0.10)`;
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${color},${0.65 + p * 0.3})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = `rgba(${color},0.8)`;
    ctx.shadowBlur  = 12 + p * 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Crosshair
    ctx.strokeStyle = `rgba(${color},0.4)`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(this.x - r, this.y); ctx.lineTo(this.x + r, this.y);
    ctx.moveTo(this.x, this.y - r); ctx.lineTo(this.x, this.y + r);
    ctx.stroke();

    // Hit flash ring
    if (this.flash > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 40 * (1 - this.flash), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color},${this.flash * 0.7})`;
      ctx.lineWidth   = 3;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle     = `rgba(${color},0.7)`;
    ctx.font          = "bold 9px 'Share Tech Mono', monospace";
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'bottom';
    ctx.fillText('TARGET', this.x, this.y - r - 5);
  }

  /**
   * Returns true if obj overlaps the target zone.
   * @param {PhysObj} obj
   */
  overlaps(obj) {
    return Math.hypot(obj.x - this.x, obj.y - this.y) < this.r + obj.r * 0.55;
  }
}

// ── TargetBarrier ─────────────────────────────────────────────────────────────

class TargetBarrier {
  constructor(x, y, radius, thickness, gapHalfAngle, gapCenterAngle) {
    this.x              = x;
    this.y              = y;
    this.radius         = radius;
    this.thickness      = thickness      !== undefined ? thickness      : 14;
    this.gapHalfAngle   = gapHalfAngle   !== undefined ? gapHalfAngle   : Math.PI * 0.2;
    this.gapCenterAngle = gapCenterAngle !== undefined ? gapCenterAngle : 0;
  }

  draw(ctx) {
    var r   = this.radius + this.thickness / 2;
    var gc  = this.gapCenterAngle;
    var g   = this.gapHalfAngle;
    // Arc goes from (gap end) to (gap start) the long way around
    var arcStart = gc + g;
    var arcEnd   = gc - g + Math.PI * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(210,80,80,0.55)';
    ctx.lineWidth   = this.thickness;
    ctx.lineCap     = 'round';
    ctx.shadowColor = 'rgba(255,60,60,0.45)';
    ctx.shadowBlur  = 12;

    ctx.beginPath();
    ctx.arc(this.x, this.y, r, arcStart, arcEnd, false);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// Pin classes to window so game.js and ui.js can reference them as globals
window.PhysObj        = PhysObj;
window.StaticObstacle = StaticObstacle;
window.TargetZone     = TargetZone;
window.TargetBarrier  = TargetBarrier;
