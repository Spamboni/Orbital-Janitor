// ui.js — HUD, settings panel, overlays

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
    this._settingsBtn   = document.getElementById('btn-settings');
    this._settingsPanel = document.getElementById('settings-panel');

    var self = this;
    this._btnReset.addEventListener('click', function() { opts.onReset(); });
    this._settingsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      self._toggleSettings();
    });

    // Close panel when tapping outside
    document.addEventListener('click', function(e) {
      if (!self._settingsPanel.contains(e.target) && e.target !== self._settingsBtn) {
        self._settingsPanel.classList.remove('open');
      }
    });

    this._bindSliders();
    this.canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  _toggleSettings() {
    this._settingsPanel.classList.toggle('open');
  }

  _bindSliders() {
    function bindSlider(id, labelId, settingKey, fmt) {
      var slider = document.getElementById(id);
      var label  = document.getElementById(labelId);
      if (!slider || !label) return;
      slider.addEventListener('input', function() {
        var val = parseFloat(slider.value);
        if (window.Settings) Settings[settingKey] = val;
        label.textContent = fmt(val);
      });
      // Set initial display
      if (window.Settings) label.textContent = fmt(Settings[settingKey]);
    }

    bindSlider('slider-velocity', 'val-velocity', 'velocityMult', function(v){ return Math.round(v * 100) + '%'; });
    bindSlider('slider-bounce',   'val-bounce',   'bounceMult',   function(v){ return Math.round(v * 100) + '%'; });
    bindSlider('slider-gravity',  'val-gravity',  'gravityMult',  function(v){ return Math.round(v * 100) + '%'; });
  }

  setScore(n)      { this._scoreEl.textContent = n; }
  setCollisions(n) { this._collEl.textContent  = n; }
  setLevel(n)      { this._levelEl.textContent = n; }

  showWin(sub) {
    this._msgText.textContent = 'DEBRIS CLEARED!';
    this._msgSub.textContent  = sub || '';
    this._msgEl.classList.add('show');
  }

  hideWin() { this._msgEl.classList.remove('show'); }
  attachObjects(objects) { this._objects = objects; }
}

window.UI = UI;
