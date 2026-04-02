// sound.js — Web Audio API synthesized sound effects
// No external files. All sounds generated procedurally.

var Sound = (function() {

  var ctx = null;
  var enabled = true;

  // Lazy-init AudioContext on first user gesture (browser requirement)
  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        enabled = false;
      }
    }
    // Resume if suspended (mobile browsers suspend until gesture)
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ── Low-level helpers ──────────────────────────────────────────────────────

  function playTone(opts) {
    // opts: { type, freq, freq2, gain, attack, decay, duration, filterFreq, filterQ, detune }
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;

    var now = c.currentTime;
    var osc = c.createOscillator();
    var gainNode = c.createGain();

    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq || 440, now);
    if (opts.freq2) osc.frequency.exponentialRampToValueAtTime(opts.freq2, now + (opts.duration || 0.2));
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, now);

    var g = opts.gain || 0.3;
    var attack  = opts.attack  || 0.005;
    var decay   = opts.decay   || 0.1;
    var dur     = opts.duration || 0.2;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(g, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    if (opts.filterFreq) {
      var filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = opts.filterFreq;
      filter.Q.value = opts.filterQ || 1;
      osc.connect(filter);
      filter.connect(gainNode);
    } else {
      osc.connect(gainNode);
    }

    gainNode.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  function playNoise(opts) {
    // Filtered noise burst
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;

    var now      = c.currentTime;
    var duration = opts.duration || 0.15;
    var bufSize  = Math.ceil(c.sampleRate * duration);
    var buffer   = c.createBuffer(1, bufSize, c.sampleRate);
    var data     = buffer.getChannelData(0);
    for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

    var src    = c.createBufferSource();
    src.buffer = buffer;

    var filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.value = opts.filterFreq || 800;
    filter.Q.value = opts.filterQ || 2;

    var gainNode = c.createGain();
    var g = opts.gain || 0.2;
    gainNode.gain.setValueAtTime(g, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(c.destination);
    src.start(now);
    src.stop(now + duration);
  }

  // ── Sound definitions ──────────────────────────────────────────────────────

  // Elastic stretch: rising subtle creak as you pull back
  // Call repeatedly while dragging, with power 0..1
  var _stretchThrottle = 0;
  function stretch(power) {
    if (!enabled) return;
    var now = Date.now();
    // Throttle to every ~80ms to avoid audio spam
    if (now - _stretchThrottle < 80) return;
    _stretchThrottle = now;

    var c = getCtx(); if (!c) return;
    var t = c.currentTime;

    // Rubber band creak: noise burst + rising pitched tone
    playNoise({
      filterType: 'bandpass',
      filterFreq: 200 + power * 600,
      filterQ: 8,
      gain: 0.12 + power * 0.18,
      duration: 0.07,
    });
  }

  // Snap on release
  function snap(power) {
    if (!enabled) return;
    getCtx();
    // Sharp noise burst (the snap)
    playNoise({
      filterType: 'highpass',
      filterFreq: 1200 + power * 800,
      filterQ: 1,
      gain: 0.12 + power * 0.18,
      duration: 0.08,
    });
    // Quick low thud underneath
    playTone({
      type: 'sine',
      freq: 120,
      freq2: 40,
      gain: 0.25 + power * 0.2,
      attack: 0.001,
      decay: 0.12,
      duration: 0.14,
    });
  }

  // Ball-on-ball clink: bright metallic ping
  function clink(speed) {
    if (!enabled) return;
    getCtx();
    var s = Math.min(speed / 20, 1);
    // High metallic tone
    playTone({
      type: 'sine',
      freq: 900 + s * 400,
      freq2: 700,
      gain: 0.08 + s * 0.14,
      attack: 0.001,
      decay: 0.18 + s * 0.1,
      duration: 0.3,
    });
    // Slight overtone
    playTone({
      type: 'sine',
      freq: 1400 + s * 600,
      gain: 0.04 + s * 0.06,
      attack: 0.001,
      decay: 0.1,
      duration: 0.15,
    });
  }

  // Ball-on-wall click: sharp transient
  function wallClick(speed) {
    if (!enabled) return;
    getCtx();
    var s = Math.min(speed / 20, 1);
    playNoise({
      filterType: 'highpass',
      filterFreq: 2000 + s * 1000,
      filterQ: 0.8,
      gain: 0.08 + s * 0.1,
      duration: 0.05,
    });
    playTone({
      type: 'square',
      freq: 180 + s * 80,
      freq2: 80,
      gain: 0.06 + s * 0.08,
      attack: 0.001,
      decay: 0.06,
      duration: 0.08,
    });
  }

  // Ball-on-obstacle thud: dull low impact
  function thud(speed) {
    if (!enabled) return;
    getCtx();
    var s = Math.min(speed / 20, 1);
    // Low thud
    playTone({
      type: 'sine',
      freq: 80 + s * 60,
      freq2: 30,
      gain: 0.2 + s * 0.2,
      attack: 0.002,
      decay: 0.18 + s * 0.1,
      duration: 0.22,
    });
    // Mid noise component
    playNoise({
      filterType: 'lowpass',
      filterFreq: 300 + s * 200,
      filterQ: 1,
      gain: 0.1 + s * 0.1,
      duration: 0.1,
    });
  }

  // Win jingle
  function win() {
    if (!enabled) return;
    getCtx();
    var notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    for (var i = 0; i < notes.length; i++) {
      (function(freq, delay) {
        setTimeout(function() {
          playTone({ type: 'sine', freq: freq, gain: 0.15, attack: 0.01, decay: 0.3, duration: 0.35 });
        }, delay);
      })(notes[i], i * 80);
    }
  }

  return { stretch: stretch, snap: snap, clink: clink, wallClick: wallClick, thud: thud, win: win, getCtx: getCtx };

})();

window.Sound = Sound;
