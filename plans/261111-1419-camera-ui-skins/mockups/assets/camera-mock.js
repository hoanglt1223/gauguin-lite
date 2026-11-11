// Shared mockup engine: builds the camera screen from data; each skin only supplies CSS tokens.
(function () {
  const I = {
    flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    ratio: '<rect x="5" y="3" width="14" height="18" rx="2"/>',
    grid: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
    looks: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    flip: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    live: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    rotate: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 3h8"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    frame: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 17h18"/>',
    level: '<path d="M3 12h7M14 12h7"/><circle cx="12" cy="12" r="2"/>'
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
  const MODES = ['More', 'Night', 'Portrait', 'Photo', 'Video', 'Pro', 'Pano'];
  const MORE = ['Slow-mo', 'Time-lapse', 'Hyperlapse', 'Dual', 'Document', 'Moon', 'Long exposure', 'Color match', 'Motion photo', 'Astro', 'HDR', 'QR'];
  const LOOKS = ['Natural', 'Vivid', 'Classic', 'Mono', 'Warm film', 'Cool film', 'Fade', 'Noir'];
  const LOOK_CSS = ['none', 'saturate(1.4)', 'sepia(.25) contrast(1.1)', 'grayscale(1)', 'sepia(.4) saturate(1.2)', 'hue-rotate(-12deg) saturate(.9)', 'contrast(.85) brightness(1.08)', 'grayscale(1) contrast(1.4)'];
  const DIALS = [
    ['ISO', ['Auto', 50, 100, 200, 400, 800, 1600, 3200]],
    ['S', ['Auto', '1/4000', '1/1000', '1/250', '1/60', '1/15', '1/2', '2s']],
    ['EV', ['-2', '-1', '-0.3', '0', '+0.3', '+1', '+2']],
    ['WB', ['Auto', '2800K', '4000K', '5200K', '6500K', '8000K']],
    ['MF', ['Auto', '0.1m', '0.5m', '1m', '3m', 'Inf']]
  ];

  function build(root, opts) {
    const o = Object.assign({ name: 'Skin' }, opts);
    root.innerHTML = `
    <div class="phone" data-mode="Photo" data-orient="portrait">
      <div class="preview" role="img" aria-label="Camera preview"><div class="scene"></div>
        <div class="grid-ov"></div><div class="level-ov"></div>
        <div class="focus-ring"></div>
        <div class="rec-pill" aria-live="polite"><i></i><span>00:00</span></div>
        <div class="scene-chip">Food</div>
        <div class="zoom-ring" aria-hidden="true"><div class="ticks"></div><b>1.0x</b></div>
      </div>
      <header class="topbar">
        <button class="ic" data-act="flash" aria-label="Flash: auto">${svg('flash')}</button>
        <button class="ic" data-act="live" aria-label="Motion photo">${svg('live')}</button>
        <button class="ic" data-act="timer" aria-label="Timer off">${svg('timer')}</button>
        <button class="ic" data-act="ratio" aria-label="Aspect ratio 4:3">${svg('ratio')}</button>
        <button class="ic" data-act="looks" aria-label="Looks">${svg('looks')}</button>
        <button class="ic" data-act="settings" aria-label="Settings">${svg('settings')}</button>
      </header>
      <div class="lens" role="radiogroup" aria-label="Zoom">
        ${['0.6', '1', '2', '5'].map((z) => `<button role="radio" data-zoom="${z}" ${z === '1' ? 'aria-checked="true" class="on"' : 'aria-checked="false"'}>${z}${z === '1' ? 'x' : ''}</button>`).join('')}
      </div>
      <div class="looks-strip" aria-label="Looks">${LOOKS.map((l, i) => `<button data-look="${i}" class="${i ? '' : 'on'}"><span style="filter:${LOOK_CSS[i]}"></span>${l}</button>`).join('')}</div>
      <div class="pro-panel">
        <div class="pro-tabs">${DIALS.map((d, i) => `<button data-dial="${i}" class="${i ? '' : 'on'}"><small>${d[0]}</small><b>${d[1][Math.max(0, d[1].indexOf('0'))]}</b></button>`).join('')}</div>
        <div class="dial" tabindex="0" aria-label="Adjust value"><div class="dial-track"></div><div class="dial-needle"></div></div>
      </div>
      <nav class="modes" aria-label="Camera mode"><div class="modes-track">${MODES.map((m) => `<button data-mode="${m}" class="${m === 'Photo' ? 'on' : ''}">${m}</button>`).join('')}</div></nav>
      <footer class="bottom">
        <button class="thumb" data-act="review" aria-label="Open last photo"><span></span></button>
        <button class="shutter" aria-label="Take photo"><span class="core"></span></button>
        <button class="ic big" data-act="flip" aria-label="Switch camera">${svg('flip')}</button>
      </footer>
      <section class="sheet more-sheet" aria-label="More modes"><div class="grab"></div><h3>More modes</h3>
        <div class="more-grid">${MORE.map((m) => `<button><i>${svg('frame')}</i>${m}</button>`).join('')}</div></section>
      <section class="sheet settings-sheet" aria-label="Settings"><div class="grab"></div><h3>Settings</h3>
        ${[['Skin', o.name], ['Grid', 'Rule of thirds'], ['Level', 'On'], ['Frame & watermark', 'Off'], ['Shutter sound', 'On'], ['Save location', 'Off'], ['Composition hints', 'On'], ['Photo format', 'JPEG']].map((r) => `<div class="row"><span>${r[0]}</span><em>${r[1]}</em></div>`).join('')}
        <div class="row"><span>Volume keys</span><label class="sw"><input type="checkbox" checked><i></i></label></div>
        <a class="row link" href="index.html">Change skin →</a></section>
      <section class="review" aria-label="Review"><div class="review-img"></div>
        <div class="review-bar"><button class="ic" data-act="close-review" aria-label="Back to camera">${svg('close')}</button><span>Today 14:19 · 1x · f/1.8 · 1/120 · ISO 100</span><button class="ic" aria-label="More">${svg('more')}</button></div>
        <div class="review-actions"><button>Share</button><button>Edit</button><button>Retouch</button><button>Delete</button></div></section>
      <div class="flash-ov"></div>
    </div>
    <div class="ctrl"><button data-x="orient">${svg('rotate')} Landscape</button><button data-x="video">Video recording state</button><a href="index.html">All skins</a></div>`;
    wire(root.querySelector('.phone'), root);
  }

  function wire(p, root) {
    const $ = (s) => p.querySelector(s), $$ = (s) => p.querySelectorAll(s);
    const vib = (ms) => navigator.vibrate && navigator.vibrate(ms);
    const setMode = (m) => {
      if (m === 'More') { p.classList.add('show-more'); return; }
      p.dataset.mode = m; p.classList.remove('rec');
      $$('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      const on = $('.modes button.on');
      $('.modes-track').style.transform = `translateX(${-(on.offsetLeft + on.offsetWidth / 2)}px)`;
      $('.shutter').setAttribute('aria-label', m === 'Video' ? 'Start recording' : 'Take photo');
      p.classList.add('switching'); setTimeout(() => p.classList.remove('switching'), 280);
      vib(8);
    };
    $$('.modes button').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
    let sx = null;
    $('.preview').addEventListener('pointerdown', (e) => sx = e.clientX);
    $('.preview').addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) < 40) { const f = $('.focus-ring'), r = $('.preview').getBoundingClientRect(); f.style.left = e.clientX - r.left + 'px'; f.style.top = e.clientY - r.top + 'px'; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); return; }
      const list = [...$$('.modes button')].map((b) => b.dataset.mode).filter((m) => m !== 'More');
      const i = list.indexOf(p.dataset.mode) + (dx < 0 ? 1 : -1);
      if (list[i]) setMode(list[i]);
    });
    $$('.lens button').forEach((b) => {
      b.onclick = () => { $$('.lens button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); x.textContent = x.dataset.zoom + (x === b ? 'x' : ''); }); $('.scene').style.transform = `scale(${Math.max(1, b.dataset.zoom)})`; $('.zoom-ring b').textContent = Number(b.dataset.zoom).toFixed(1) + 'x'; vib(6); };
      let t; b.onpointerdown = () => t = setTimeout(() => p.classList.add('ring'), 350);
      b.onpointerup = b.onpointerleave = () => { clearTimeout(t); setTimeout(() => p.classList.remove('ring'), 1200); };
    });
    $('.shutter').onclick = () => {
      if (p.dataset.mode === 'Video') { toggleRec(); return; }
      p.classList.add('shoot'); vib(15);
      setTimeout(() => { p.classList.remove('shoot'); const t = $('.thumb'); t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }, 220);
    };
    let timer = null, sec = 0;
    function toggleRec() {
      const on = !p.classList.contains('rec');
      p.classList.toggle('rec', on); vib(on ? 20 : 10);
      $('.shutter').setAttribute('aria-label', on ? 'Stop recording' : 'Start recording');
      clearInterval(timer); sec = 0; $('.rec-pill span').textContent = '00:00';
      if (on) timer = setInterval(() => { sec++; $('.rec-pill span').textContent = `${String(sec / 60 | 0).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }, 1000);
    }
    $$('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'looks') p.classList.toggle('show-looks');
      if (a === 'settings') p.classList.add('show-settings');
      if (a === 'review') p.classList.add('show-review');
      if (a === 'close-review') p.classList.remove('show-review');
      if (a === 'flip') { p.classList.add('flipping'); setTimeout(() => p.classList.remove('flipping'), 400); }
      if (a === 'flash' || a === 'live' || a === 'timer') b.classList.toggle('active');
      vib(6);
    }));
    $$('.sheet .grab').forEach((g) => g.onclick = () => p.classList.remove('show-more', 'show-settings'));
    $$('.more-grid button').forEach((b) => b.onclick = () => p.classList.remove('show-more'));
    $$('.looks-strip button').forEach((b) => b.onclick = () => { $$('.looks-strip button').forEach((x) => x.classList.toggle('on', x === b)); $('.scene').style.filter = LOOK_CSS[b.dataset.look]; vib(5); });
    let dial = 0; const vals = DIALS.map((d) => Math.max(0, d[1].indexOf('0')));
    const track = $('.dial-track');
    const renderDial = () => { const v = DIALS[dial][1]; track.innerHTML = v.map((x, i) => `<span class="${i === vals[dial] ? 'on' : ''}">${x}</span>`).join(''); track.style.setProperty('--i', vals[dial]); $$('.pro-tabs button')[dial].querySelector('b').textContent = v[vals[dial]]; };
    $$('.pro-tabs button').forEach((b) => b.onclick = () => { dial = +b.dataset.dial; $$('.pro-tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderDial(); });
    const step = (d) => { vals[dial] = Math.min(DIALS[dial][1].length - 1, Math.max(0, vals[dial] + d)); renderDial(); vib(4); };
    $('.dial').addEventListener('wheel', (e) => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); });
    $('.dial').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
    let dx0 = null; $('.dial').onpointerdown = (e) => dx0 = e.clientX;
    $('.dial').onpointermove = (e) => { if (dx0 !== null && Math.abs(e.clientX - dx0) > 24) { step(e.clientX < dx0 ? 1 : -1); dx0 = e.clientX; } };
    $('.dial').onpointerup = () => dx0 = null;
    track.onclick = (e) => { const s = e.target.closest('span'); if (s) { vals[dial] = [...track.children].indexOf(s); renderDial(); } };
    renderDial();
    root.querySelector('[data-x="orient"]').onclick = () => { p.dataset.orient = p.dataset.orient === 'portrait' ? 'landscape' : 'portrait'; };
    root.querySelector('[data-x="video"]').onclick = () => { setMode('Video'); toggleRec(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') p.classList.remove('show-more', 'show-settings', 'show-review', 'show-looks'); });
    requestAnimationFrame(() => setMode('Photo'));
  }
  window.CameraMock = { build };
})();
