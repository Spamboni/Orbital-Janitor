// balls.js — Ball type definitions, behaviors, and per-ball settings

// ── Ball type constants ───────────────────────────────────────────────────────
var BALL_TYPES = {
  BOUNCER:  'bouncer',
  EXPLODER: 'exploder',
  STICKY:   'sticky',
  SPLITTER: 'splitter',
  GRAVITY:  'gravity',
};

// ── Default per-ball settings ─────────────────────────────────────────────────
var BallSettings = {
  bouncer: {
    label:      'BOUNCER',
    color:      '#1040a0',
    glow:       '#4488ff',
    size:       15,
    velocity:   1.0,
    bounciness: 1.0,
  },
  exploder: {
    label:       'EXPLODER',
    color:       '#8b1a00',
    glow:        '#ff4400',
    size:        13,
    velocity:    1.0,
    bounciness:  0.8,
    blastRadius: 120,   // px
    blastForce:  18,    // velocity added to nearby objects
  },
  sticky: {
    label:      'STICKY',
    color:      '#1a6b00',
    glow:       '#44ff44',
    size:       13,
    velocity:   1.0,
    bounciness: 0.1,
    stickyStrength: 0.85, // how much velocity is killed on stick (0-1)
  },
  splitter: {
    label:      'SPLITTER',
    color:      '#6b006b',
    glow:       '#ff44ff',
    size:       14,
    velocity:   1.0,
    bounciness: 0.9,
    splitCount: 2,    // how many children spawn on first hit
  },
  gravity: {
    label:       'GRAVITY WELL',
    color:       '#005555',
    glow:        '#00ffee',
    size:        16,
    velocity:    1.0,
    bounciness:  0.7,
    gravRange:   140,  // px — outer influence radius
    gravPull:    0.6,  // acceleration toward well per frame at range
  },
};

// ── Ball behavior helpers ─────────────────────────────────────────────────────

// Returns a list of { x, y, r, mass, color, glow, label, type } for spawning
// child balls when a splitter hits something.
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
      childR,
      parent.mass * 0.55,
      bs.color,
      bs.glow,
      'SPL'
    );
    child.vx = Math.cos(angle) * speed;
    child.vy = Math.sin(angle) * speed;
    child.type      = BALL_TYPES.SPLITTER;
    child.isSplitChild = true; // children don't split again
    children.push(child);
  }
  return children;
}

// Apply gravity-well pull to all other objects each frame
function applyGravityWell(well, objects) {
  var bs = BallSettings.gravity;
  var range = bs.gravRange;
  var pull  = bs.gravPull;

  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (obj === well || obj.pinned || obj.stuckTo) continue;

    var dx   = well.x - obj.x;
    var dy   = well.y - obj.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 1 || dist > range) continue;

    // Pull strengthens as objects get closer
    var strength = pull * (1 - dist / range) * 2.5;
    obj.vx += (dx / dist) * strength;
    obj.vy += (dy / dist) * strength;

    // If close enough, stick to the well
    if (dist < well.r + obj.r + 4) {
      obj.stuckTo  = well;
      obj.vx       = 0;
      obj.vy       = 0;
    }
  }
}

// Trigger explosion: push all nearby objects outward
function triggerExplosion(exploder, objects, sparks) {
  if (exploder.exploded) return;
  exploder.exploded = true;

  var bs     = BallSettings.exploder;
  var radius = bs.blastRadius;
  var force  = bs.blastForce;

  // Big spark burst
  if (window.Physics) Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ff6600', 60);
  if (window.Physics) Physics.spawnSparks(sparks, exploder.x, exploder.y, '#ffcc00', 30);
  if (window.Sound)   Sound.thud(20);

  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (obj === exploder) continue;
    var dx   = obj.x - exploder.x;
    var dy   = obj.y - exploder.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 1 || dist > radius) continue;
    var strength = force * (1 - dist / radius);
    obj.vx += (dx / dist) * strength;
    obj.vy += (dy / dist) * strength;
  }
}

window.BALL_TYPES   = BALL_TYPES;
window.BallSettings = BallSettings;
window.makeSplitChildren  = makeSplitChildren;
window.applyGravityWell   = applyGravityWell;
window.triggerExplosion   = triggerExplosion;
