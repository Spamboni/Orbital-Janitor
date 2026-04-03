// ui.js — HUD + tabbed settings panel

class UI {
  constructor(opts) {
    this.canvas  = opts.canvas;
    this.onReset = opts.onReset;

    this._scoreEl       = document.getElementById('score');
    this._collEl        = document.getElementById('collisions');
    this._levelEl       = document.getElementById('level');
    this._msgEl         = document.getElementById('message-overlay');
    this._msgText       = document.getElementById('message-text');
    this._msgSub        = document.getElementById('message-sub');
    this._btnReset      = document.getElementById('btn-reset');
    this._settingsBtn   = document.getElementById('btn-settings');
    this._settingsPanel = document.getElementById('settings-panel');

    var self = this;

    function doReset(e) { e.preventDefault(); e.stopPropagation(); opts.onReset(); }
    this._btnReset.addEventListener('click',    doReset);
    this._btnReset.addEventListener('touchend', doReset);

    function openSettings(e) {
      e.preventDefault();
      e.stopPropagation();
      // Build panel lazily so BallSettings is guaranteed to exist
      if (!self._panelBuilt) {
        self._buildPanel();
        self._panelBuilt = true;
      }
      self._toggleSettings();
    }
    this._settingsBtn.addEventListener('click',    openSettings);
    this._settingsBtn.addEventListener('touchend', openSettings);

    function closeIfOutside(e) {
      if (!self._settingsPanel.classList.contains('open')) return;
      if (!self._settingsPanel.contains(e.target) && e.target !== self._settingsBtn) {
        self._settingsPanel.classList.remove('open');
      }
    }
    document.addEventListener('click',      closeIfOutside);
    document.addEventListener('touchstart', closeIfOutside, { passive: true });

    this._panelBuilt = false;
    this.canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  _toggleSettings() {
    this._settingsPanel.classList.toggle('open');
  }

  _buildPanel() {
    var panel = this._settingsPanel;
    panel.innerHTML = '';

    // Title
    var title = document.createElement('div');
    title.className   = 'settings-title';
    title.textContent = 'PHYSICS SETTINGS';
    panel.appendChild(title);

    // Tab bar
    var tabBar = document.createElement('div');
    tabBar.className = 'tab-bar';
    panel.appendChild(tabBar);

    // Tab content container
    var tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    panel.appendChild(tabContent);

    var tabs = [
      { id: 'global',   label: '🌍 GLOBAL' },
      { id: 'bouncer',  label: '⚪ BOUNCE'  },
      { id: 'exploder', label: '💥 EXPLODE' },
      { id: 'sticky',   label: '🟢 STICKY'  },
      { id: 'splitter', label: '🟣 SPLIT'   },
      { id: 'gravity',  label: '🔵 GRAVITY' },
    ];

    var self = this;
    var panes = {};

    tabs.forEach(function(t, idx) {
      // Tab button
      var btn = document.createElement('button');
      btn.className   = 'tab-btn' + (idx === 0 ? ' active' : '');
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      tabBar.appendChild(btn);

      function activateTab(e) {
        e.preventDefault(); e.stopPropagation();
        tabBar.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        Object.keys(panes).forEach(function(k){ panes[k].style.display = 'none'; });
        panes[t.id].style.display = 'block';
      }
      btn.addEventListener('click',    activateTab);
      btn.addEventListener('touchend', activateTab);

      // Pane
      var pane = document.createElement('div');
      pane.className    = 'tab-pane';
      pane.style.display = idx === 0 ? 'block' : 'none';
      tabContent.appendChild(pane);
      panes[t.id] = pane;

      // Build sliders for each tab
      if (t.id === 'global') {
        self._addSlider(pane, 'Gravity', 'Settings', 'gravityMult', 0.3, 2.0, 0.05,
          function(v){ return Math.round(v*100)+'%'; });
      } else {
        var bs = BallSettings[t.id];
        self._addSlider(pane, 'Size (radius)', 'BallSettings.' + t.id, 'size', 6, 30, 1,
          function(v){ return v + 'px'; }, t.id);
        self._addSlider(pane, 'Velocity', 'BallSettings.' + t.id, 'velocity', 0.3, 3.0, 0.05,
          function(v){ return Math.round(v*100)+'%'; }, t.id);
        self._addSlider(pane, 'Bounciness', 'BallSettings.' + t.id, 'bounciness', 0.0, 2.0, 0.05,
          function(v){ return Math.round(v*100)+'%'; }, t.id);

        if (t.id === 'exploder') {
          self._addSlider(pane, 'Blast Radius', 'BallSettings.exploder', 'blastRadius', 40, 250, 5,
            function(v){ return v + 'px'; }, 'exploder');
          self._addSlider(pane, 'Blast Force', 'BallSettings.exploder', 'blastForce', 4, 40, 1,
            function(v){ return v; }, 'exploder');
        }
        if (t.id === 'sticky') {
          self._addSlider(pane, 'Stick Strength', 'BallSettings.sticky', 'stickyStrength', 0.1, 1.0, 0.05,
            function(v){ return Math.round(v*100)+'%'; }, 'sticky');
        }
        if (t.id === 'splitter') {
          self._addSlider(pane, 'Split Count', 'BallSettings.splitter', 'splitCount', 1, 5, 1,
            function(v){ return v + ' balls'; }, 'splitter');
        }
        if (t.id === 'gravity') {
          self._addSlider(pane, 'Pull Range', 'BallSettings.gravity', 'gravRange', 50, 280, 5,
            function(v){ return v + 'px'; }, 'gravity');
          self._addSlider(pane, 'Pull Strength', 'BallSettings.gravity', 'gravPull', 0.05, 2.0, 0.05,
            function(v){ return v.toFixed(2); }, 'gravity');
        }
      }
    });

    // Reset defaults button
    var resetBtn = document.createElement('button');
    resetBtn.className   = 'settings-reset-btn';
    resetBtn.textContent = 'RESET ALL DEFAULTS';
    function resetDefaults(e) {
      e.preventDefault();
      Settings.gravityMult = 1.0;
      BallSettings.bouncer.size  = 15; BallSettings.bouncer.velocity  = 1.0; BallSettings.bouncer.bounciness  = 1.0;
      BallSettings.exploder.size = 13; BallSettings.exploder.velocity = 1.0; BallSettings.exploder.bounciness = 0.8;
      BallSettings.exploder.blastRadius = 120; BallSettings.exploder.blastForce = 18;
      BallSettings.sticky.size   = 13; BallSettings.sticky.velocity   = 1.0; BallSettings.sticky.bounciness   = 0.1;
      BallSettings.sticky.stickyStrength = 0.85;
      BallSettings.splitter.size = 14; BallSettings.splitter.velocity = 1.0; BallSettings.splitter.bounciness = 0.9;
      BallSettings.splitter.splitCount = 2;
      BallSettings.gravity.size  = 16; BallSettings.gravity.velocity  = 1.0; BallSettings.gravity.bounciness  = 0.7;
      BallSettings.gravity.gravRange = 140; BallSettings.gravity.gravPull = 0.6;
      self._buildPanel(); // rebuild to show fresh values
    }
    resetBtn.addEventListener('click',    resetDefaults);
    resetBtn.addEventListener('touchend', resetDefaults);
    panel.appendChild(resetBtn);
  }

  _addSlider(container, label, objPath, key, min, max, step, fmt, ballType) {
    var row = document.createElement('div');
    row.className = 'setting-row';

    var labelDiv = document.createElement('div');
    labelDiv.className = 'setting-label';

    var nameSpan = document.createElement('span');
    nameSpan.textContent = label.toUpperCase();

    var valSpan = document.createElement('span');
    valSpan.className = 'setting-val';

    // Get current value
    var target = (ballType) ? BallSettings[ballType] : Settings;
    var current = target[key];
    valSpan.textContent = fmt(current);

    labelDiv.appendChild(nameSpan);
    labelDiv.appendChild(valSpan);

    var slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = min;
    slider.max   = max;
    slider.step  = step;
    slider.value = current;

    slider.addEventListener('input', function() {
      var v = parseFloat(slider.value);
      if (ballType) BallSettings[ballType][key] = v;
      else Settings[key] = v;
      valSpan.textContent = fmt(v);
    });

    row.appendChild(labelDiv);
    row.appendChild(slider);
    container.appendChild(row);
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
