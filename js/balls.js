// balls.js — Ball type definitions and behaviors

var BALL_TYPES = {
  BOUNCER:  'bouncer',
  EXPLODER: 'exploder',
  STICKY:   'sticky',
  SPLITTER: 'splitter',
  GRAVITY:  'gravity',
};

var BallSettings = {
  bouncer: {
    label: 'BOUNCER', color: '#1040a0', glow: '#4488ff',
    size: 15, velocity: 1.0, bounciness: 1.0,
  },
  exploder: {
    label: 'EXPLODER', color: '#8b1a00', glow: '#ff4400',
    size: 13, velocity: 1.0, bounciness: 0.8,
    blastRadius: 120, blastForce: 18,
  },
  sticky: {
    label: 'STICKY', color: '#1a6b00', glow: '#44ff44',
    size: 13, velocity: 1.0, bounciness: 0.1,
    stickyStrength: 0.85,
  },
  splitter: {
    label: 'SPLITTER', color: '#6b006b', glow: '#ff44ff',
    size: 14, velocity: 1.0, bounciness: 0.9,
    splitCount: 2,
  },
  gravity: {
    label: 'GRAV WELL', color: '#005555', glow: '#00ffee',
    size: 16, velocity: 1.0, bounciness: 0.7,
    gravRange: 140,  // outer pull radius (px)
    gravPull:  0.55, // base acceleration at range edge
  },
};

// ── Splitter children ─────────────────────────────────────────────────────────

function makeSplitChildren(parent, count) {
  var children = [];
  var bs = BallSettings.splitter;
  var childR = Math.max(5, parent.r * 0.65);
  for (var i = 0; i < count; i++) {
    var angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    var speed = Math.hypot(parent.vx, parent.vy) * 0.7 + 2;
    var child = new PhysObj(
      parent.x + Math.cos(angle) * (parent.r + childR + 2),
      parent.y + Math.sin(angle) * (parent.r + childR + 2),
      childR, parent.mass * 0.55, bs.color, bs.glow, 'SPL'
    );
    child.vx = Math.cos(angle) * speed;
    child.vy = Math.sin(angle) * speed;
    child.type         = BALL_TYPES.SPLITTER;
    child.isSplitChild = true;
    child.inFlight     = true;
    child.exploded     = false;
    child.hasStuck     = false;
    child.hasSplit     = false;
    child.stuckTo      = null;
    children.push(child);
  }
  return children;
}

// ── Gravity well — slingshot-through behavior ─────────────────────────────────
//
// Each frame the well is in flight:
//   • Objects within gravRange that haven't been "slung" yet get pulled in.
//   • Pull force grows as 1/dist² (inverse-square), capped so it's playable.
//   • Once an object reaches the well's core (dist < coreRadius), it is
//     "captured": its velocity is redirected outward from the well center,
//     boosted by an ejection multiplier, and marked as "slung by this well
//     instance" so it won't be pulled again until the well is fired again.

function applyGravityWell(well, objects) {
  var bs         = BallSettings.gravity;
  var range      = bs.gravRange;
  var basePull   = bs.gravPull;
  var coreRadius = well.r + 4; // dist at which ejection triggers

  // well._slungIds is a Set of object references already ejected this flight
  if (!well._slungIds) well._slungIds = [];

  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (obj === well) continue;
    if (obj.pinned || obj.stuckTo) continue;
    // Skip objects already ejected by this well instance
    if (_arrayHas(well._slungIds, obj)) continue;

    var dx   = well.x - obj.x;
    var dy   = well.y - obj.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 0.5 || dist > range) continue;

    var nx = dx / dist;
    var ny = dy / dist;

    if (dist <= coreRadius) {
      // ── EJECT ────────────────────────────────────────────────────────────
      // Preserve the incoming direction but flip it and add a big boost
      var inSpeed = Math.hypot(obj.vx, obj.vy);
      var ejectSpeed = Math.max(inSpeed * 1.8, 12); // at least 12px/frame

      // Eject direction: away from well center
      obj.vx = -nx * ejectSpeed;
      obj.vy = -ny * ejectSpeed;
      obj.inFlight = true;

      // Mark so this obj won't be re-pulled by this well flight
      well._slungIds.push(obj);

      // Spark burst at ejection point
      if (window.Physics) Physics.spawnSparks(window._gameSparks || [], obj.x, obj.y, '#00ffee', 14);
      if (window.Sound)   Sound.snap(0.7);

    } else {
      // ── PULL ─────────────────────────────────────────────────────────────
      // Inverse-square-ish: gets much stronger as dist decreases
      var pull = basePull * (range / dist) * (range / dist) * 0.04;
      pull = Math.min(pull, 3.0); // cap so it stays fun, not instant
      obj.vx += nx * pull;
      obj.vy += ny * pull;
      obj.inFlight = true; // keep it moving
    }
  }
}

function _arrayHas(arr, val) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === val) return true;
  return false;
}

// Called when a gravity well lands / stops flying so the next launch is fresh
function resetGravityWell(well) {
  well._slungIds = [];
}

// ── Exploder ──────────────────────────────────────────────────────────────────

function triggerExplosion(exploder, objects, sparks) {
  if (exploder.exploded) return;
  exploder.exploded  = true;
  exploder.dead      = true; // signals game.js to remove + respawn

  var bs     = BallSettings.exploder;
  var radius = bs.blastRadius;
  var force  = bs.blastForce;

  // Big layered burst — lots of shrapnel
  if (window.Physics) {
    Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ff6600', 70);
    Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ffcc00', 45);
    Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ffffff', 25);
    Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ff3300', 30);
  }
  // Shrapnel particles: extra fast, varied angles
  _spawnShrapnel(sparks, exploder.x, exploder.y, radius);

  if (window.Sound) Sound.thud(20);

  // Blast nearby objects outward
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (obj === exploder) continue;
    var dx   = obj.x - exploder.x;
    var dy   = obj.y - exploder.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 1 || dist > radius) continue;
    var strength = force * Math.pow(1 - dist / radius, 1.5); // more punch close in
    obj.vx += (dx / dist) * strength;
    obj.vy += (dy / dist) * strength;
    obj.inFlight = true;
  }
}

function _spawnShrapnel(sparks, x, y, radius) {
  // Extra large fast sparks that travel further
  if (!sparks) return;
  for (var i = 0; i < 20; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 4 + Math.random() * 10;
    sparks.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life:  1.0,
      decay: 0.012 + Math.random() * 0.018, // slower decay = travels further
      color: Math.random() < 0.5 ? '#ff8800' : '#ffee00',
      size:  2.5 + Math.random() * 3.5,
    });
  }
}

window.BALL_TYPES        = BALL_TYPES;
window.BallSettings      = BallSettings;
window.makeSplitChildren = makeSplitChildren;
window.applyGravityWell  = applyGravityWell;
window.resetGravityWell  = resetGravityWell;
window.triggerExplosion  = triggerExplosion;
