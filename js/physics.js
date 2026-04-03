/**
 * physics.js
 * Pure physics engine — no DOM, no canvas, no rendering.
 * All functions operate on plain data objects.
 */

const PHYSICS = Object.freeze({
  GRAVITY:     0.38,
  FRICTION:    0.982,
  BOUNCE:      0.68,
  RESTITUTION: 0.88,   // coefficient of restitution for object-object collisions
  DRAG_SCALE:  14,     // pixels-per-ms → px-per-frame scaler for fling velocity
  DRAG_DAMPEN: 0.6,
});

/**
 * Integrate one physics step for a single object.
 * Mutates obj.x, obj.y, obj.vx, obj.vy, obj.trail.
 *
 * @param {PhysObj} obj
 * @param {number}  W   canvas width
 * @param {number}  H   canvas height
 * @param {Spark[]} sparks  array to push wall-hit sparks into
 */
function stepObject(obj, W, H, sparks, settings) {
  if (obj.dragging) return;
  var s = settings || {};
  var gravMult  = s.gravityMult  || 1.0;
  var bncMult   = s.bounceMult   || 1.0;
  var bounce    = Math.min(PHYSICS.BOUNCE * bncMult, 1.0);

  obj.vy += PHYSICS.GRAVITY * gravMult;
  obj.vx *= PHYSICS.FRICTION;
  obj.vy *= PHYSICS.FRICTION;

  obj.x += obj.vx;
  obj.y += obj.vy;

  // ── wall collisions ──────────────────────────────────────────────
  if (obj.x - obj.r < 0) {
    obj.x = obj.r;
    var spd1 = Math.abs(obj.vx);
    obj.vx = Math.abs(obj.vx) * bounce;
    spawnSparks(sparks, obj.x, obj.y, obj.glowColor, 5);
    if (spd1 > 1.5 && window.Sound) Sound.wallClick(spd1);
  }
  if (obj.x + obj.r > W) {
    obj.x = W - obj.r;
    var spd2 = Math.abs(obj.vx);
    obj.vx = -Math.abs(obj.vx) * bounce;
    spawnSparks(sparks, obj.x, obj.y, obj.glowColor, 5);
    if (spd2 > 1.5 && window.Sound) Sound.wallClick(spd2);
  }
  if (obj.y - obj.r < 0) {
    obj.y = obj.r;
    var spd3 = Math.abs(obj.vy);
    obj.vy = Math.abs(obj.vy) * bounce;
    if (spd3 > 1.5 && window.Sound) Sound.wallClick(spd3);
  }
  if (obj.y + obj.r > H) {
    obj.y = H - obj.r;
    var spd4 = Math.abs(obj.vy);
    obj.vy = -Math.abs(obj.vy) * bounce;
    if (spd4 > 1.5) {
      spawnSparks(sparks, obj.x, obj.y, obj.glowColor, 4);
      if (window.Sound) Sound.wallClick(spd4);
    }
  }

  // ── motion trail ─────────────────────────────────────────────────
  const speed = Math.hypot(obj.vx, obj.vy);
  if (speed > 1.5) {
    obj.trail.push({ x: obj.x, y: obj.y, a: Math.min(speed / 18, 0.5) });
    if (obj.trail.length > 14) obj.trail.shift();
  } else if (obj.trail.length) {
    obj.trail.shift();
  }

  obj.pulse += 0.05;
}

/**
 * Resolve elastic collision between two PhysObjs.
 * Returns true if a new collision contact was detected (for scoring).
 *
 * @param {PhysObj} a
 * @param {PhysObj} b
 * @param {Spark[]} sparks
 * @returns {boolean}
 */
function resolveCollision(a, b, sparks) {
  const dx   = b.x - a.x;
  const dy   = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (dist >= minD || dist === 0) {
    // Objects are no longer overlapping — clear contact flag
    a._contactWith = a._contactWith || new Set();
    b._contactWith = b._contactWith || new Set();
    a._contactWith.delete(b);
    b._contactWith.delete(a);
    return false;
  }

  // Separate
  const overlap = (minD - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * (overlap + 0.5);
  a.y -= ny * (overlap + 0.5);
  b.x += nx * (overlap + 0.5);
  b.y += ny * (overlap + 0.5);

  // Impulse
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const dot = dvx * nx + dvy * ny;
  if (dot > 0) return false; // already separating

  const impulse = (-(1 + PHYSICS.RESTITUTION) * dot) / (1 / a.mass + 1 / b.mass);
  a.vx += (impulse / a.mass) * nx;
  a.vy += (impulse / a.mass) * ny;
  b.vx -= (impulse / b.mass) * nx;
  b.vy -= (impulse / b.mass) * ny;

  // Only count & spark once per contact onset
  a._contactWith = a._contactWith || new Set();
  b._contactWith = b._contactWith || new Set();
  if (a._contactWith.has(b)) return false;
  a._contactWith.add(b);
  b._contactWith.add(a);

  spawnSparks(sparks, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 12);
  if (window.Sound) Sound.clink(Math.hypot(a.vx - b.vx, a.vy - b.vy));
  return true; // new contact — caller should increment collision count
}

/**
 * Bounce a PhysObj off a circular static obstacle.
 * @param {PhysObj}      obj
 * @param {StaticObstacle} obs
 * @param {Spark[]}      sparks
 */
function bounceOffObstacle(obj, obs, sparks) {
  const dx   = obj.x - obs.x;
  const dy   = obj.y - obs.y;
  const dist = Math.hypot(dx, dy);
  const minD = obs.hitRadius + obj.r;

  if (dist >= minD || dist === 0) return false;

  const overlap = minD - dist;
  const nx = dx / dist;
  const ny = dy / dist;
  obj.x += nx * (overlap + 1);
  obj.y += ny * (overlap + 1);

  const dot = obj.vx * nx + obj.vy * ny;
  if (dot < 0) {
    obj.vx -= 2 * dot * nx * PHYSICS.BOUNCE;
    obj.vy -= 2 * dot * ny * PHYSICS.BOUNCE;
    spawnSparks(sparks, obj.x, obj.y, obj.glowColor, 6);
    if (window.Sound) Sound.thud(Math.abs(dot));
  }
  return true;
}

/**
 * Bounce a PhysObj off the ring barrier around the target zone.
 * The barrier is a thick ring with a gap on one side (right, ~0°).
 *
 * @param {PhysObj} obj
 * @param {object}  barrier  { x, y, radius, thickness, gapHalfAngle }
 */
function bounceOffBarrier(obj, barrier) {
  const dx   = obj.x - barrier.x;
  const dy   = obj.y - barrier.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // Support arbitrary gap center angle (default 0 = right, -PI/2 = up)
  const gapCenter = (barrier.gapCenterAngle !== undefined) ? barrier.gapCenterAngle : 0;
  const g = barrier.gapHalfAngle;

  // Compute angular difference from gap center
  var diff = angle - gapCenter;
  // Normalize to -PI..PI
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const inGap = Math.abs(diff) < g;
  if (inGap) return;

  const outerR = barrier.radius + barrier.thickness + obj.r;
  const innerR = barrier.radius - obj.r;
  const nx = dx / dist, ny = dy / dist;

  // Outside of ring
  if (dist < outerR && dist > barrier.radius) {
    const overlap = outerR - dist;
    obj.x += nx * (overlap + 1);
    obj.y += ny * (overlap + 1);
    const dot = obj.vx * nx + obj.vy * ny;
    if (dot < 0) { obj.vx -= 2 * dot * nx * PHYSICS.BOUNCE; obj.vy -= 2 * dot * ny * PHYSICS.BOUNCE; }
  }

  // Inside of ring
  if (dist > innerR && dist < barrier.radius) {
    const overlap = dist - innerR;
    obj.x -= nx * (overlap + 1);
    obj.y -= ny * (overlap + 1);
    const dot = obj.vx * nx + obj.vy * ny;
    if (dot > 0) { obj.vx -= 2 * dot * nx * PHYSICS.BOUNCE; obj.vy -= 2 * dot * ny * PHYSICS.BOUNCE; }
  }
}

// ── Sparks ─────────────────────────────────────────────────────────────────

/**
 * Push new spark particles into the sparks array.
 * @param {Spark[]} sparks
 * @param {number}  x
 * @param {number}  y
 * @param {string}  color  hex string e.g. '#ff8844'
 * @param {number}  [n=10]
 */
function spawnSparks(sparks, x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 4;
    sparks.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life:  1.0,
      decay: 0.038 + Math.random() * 0.04,
      color,
      size:  1.5 + Math.random() * 2,
    });
  }
}

/**
 * Step all sparks one frame; remove dead ones.
 * @param {Spark[]} sparks  mutated in place
 */
function stepSparks(sparks) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x  += s.vx;
    s.y  += s.vy;
    s.vy += 0.08;
    s.vx *= 0.97;
    s.vy *= 0.97;
    s.life -= s.decay;
    if (s.life <= 0) sparks.splice(i, 1);
  }
}

/**
 * Compute fling velocity from a pointer-history array.
 * @param  {{ x:number, y:number, t:number }[]} history
 * @returns {{ vx:number, vy:number }}
 */
function computeFlingVelocity(history) {
  if (history.length < 2) return { vx: 0, vy: 0 };
  const now = Date.now();
  const recent = history.filter(h => now - h.t < 80);
  const ref  = recent.length >= 2 ? recent[0] : history[0];
  const last = history[history.length - 1];
  const dt   = Math.max(last.t - ref.t, 16);
  return {
    vx: ((last.x - ref.x) / dt) * PHYSICS.DRAG_SCALE * PHYSICS.DRAG_DAMPEN,
    vy: ((last.y - ref.y) / dt) * PHYSICS.DRAG_SCALE * PHYSICS.DRAG_DAMPEN,
  };
}

// Assign to window so subsequent scripts can access it as a global
window.Physics = {
  PHYSICS,
  stepObject,
  resolveCollision,
  bounceOffObstacle,
  bounceOffBarrier,
  spawnSparks,
  stepSparks,
  computeFlingVelocity,
};
