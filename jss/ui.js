/**
 * ui.js
 * Handles all DOM interaction:
 *  - HUD element updates (score, collisions, level)
 *  - Win/loss overlay
 *  - Reset button
 *  - Mouse + touch drag input → feeds into game state
 */

class UI {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {function}          opts.onReset     called when reset button clicked
   */
  constructor({ canvas, onReset }) {
    this.canvas  = canvas;
    this.onReset = onReset;

    // DOM refs
    this._scoreEl = document.getElementById('score');
    this._collEl  = document.getElementById('collisions');
    this._levelEl = document.getElementById('level');
    this._msgEl   = document.getElementById('message-overlay');
    this._msgText = document.getElementById('message-text');
    this._msgSub  = document.getElementById('message-sub');
    this._btnReset = document.getElementById('btn-reset');

    // Drag state — consumed by game.js
    this.drag = null; // { obj, offX, offY, history:[{x,y,t}] } | null

    this._bindEvents();
  }

  // ── Public setters (called by game.js) ─────────────────────────────────────

  setScore(n)       { this._scoreEl.textContent = n; }
  setCollisions(n)  { this._collEl.textContent  = n; }
  setLevel(n)       { this._levelEl.textContent = n; }

  showWin(bonusText) {
    this._msgText.textContent = 'DEBRIS CLEARED!';
    this._msgSub.textContent  = bonusText || '';
    this._msgEl.classList.add('show');
  }

  hideWin() {
    this._msgEl.classList.remove('show');
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  /**
   * Call once per frame from game.js, passing the current list of PhysObjs.
   * This allows UI to start a drag if the pointer is over an object.
   *
   * Drag state is written to this.drag and read in game.js.
   */
  attachObjects(objects) {
    this._objects = objects;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',  e => this._onDown(e));
    c.addEventListener('mousemove',  e => this._onMove(e));
    c.addEventListener('mouseup',    e => this._onUp(e));
    c.addEventListener('mouseleave', e => this._onUp(e));

    c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e); }, { passive: false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e); }, { passive: false });
    c.addEventListener('touchend',   e => { e.preventDefault(); this._onUp(e);   }, { passive: false });
    c.addEventListener('touchcancel',e => { e.preventDefault(); this._onUp(e);   }, { passive: false });

    this._btnReset.addEventListener('click', () => this.onReset());

    // Prevent context menu on long-press (mobile)
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  _getPos(e) {
    const rect  = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  _onDown(e) {
    if (!this._objects) return;
    const { x, y } = this._getPos(e);

    for (const obj of this._objects) {
      if (obj.hitTest(x, y)) {
        obj.dragging = true;
        obj.grabbed  = true;
        obj.vx = 0; obj.vy = 0;
        obj.ox = x - obj.x;
        obj.oy = y - obj.y;
        this.drag = {
          obj,
          history: [{ x, y, t: Date.now() }],
        };
        break;
      }
    }
  }

  _onMove(e) {
    if (!this.drag) return;
    const { x, y } = this._getPos(e);
    this.drag.obj.x = x - this.drag.obj.ox;
    this.drag.obj.y = y - this.drag.obj.oy;
    this.drag.history.push({ x, y, t: Date.now() });
    if (this.drag.history.length > 10) this.drag.history.shift();
  }

  _onUp(e) {
    if (!this.drag) return;
    const { obj, history } = this.drag;

    // Time-weighted fling velocity
    const vel = Physics.computeFlingVelocity(history);
    obj.vx      = vel.vx;
    obj.vy      = vel.vy;
    obj.dragging = false;
    obj.grabbed  = false;

    this.drag = null;
  }
}

window.UI = UI;