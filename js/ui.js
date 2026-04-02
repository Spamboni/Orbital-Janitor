// ui.js — HUD and overlay only (input handled by game.js slingshot system)

class UI {
  constructor(opts) {
    this.canvas  = opts.canvas;
    this.onReset = opts.onReset;

    this._scoreEl  = document.getElementById('score');
    this._collEl   = document.getElementById('collisions');
    this._levelEl  = document.getElementById('level');
    this._msgEl    = document.getElementById('message-overlay');
    this._msgText  = document.getElementById('message-text');
    this._msgSub   = document.getElementById('message-sub');
    this._btnReset = document.getElementById('btn-reset');

    this._btnReset.addEventListener('click', function() { opts.onReset(); });
    this.canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  setScore(n)      { this._scoreEl.textContent = n; }
  setCollisions(n) { this._collEl.textContent  = n; }
  setLevel(n)      { this._levelEl.textContent = n; }

  showWin(sub) {
    this._msgText.textContent = 'DEBRIS CLEARED!';
    this._msgSub.textContent  = sub || '';
    this._msgEl.classList.add('show');
  }

  hideWin() {
    this._msgEl.classList.remove('show');
  }

  // Called by game.js so UI knows which objects exist (not used for drag anymore)
  attachObjects(objects) {
    this._objects = objects;
  }
}

window.UI = UI;
