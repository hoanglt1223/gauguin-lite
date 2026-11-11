// Clickable editor mock. Builds identical DOM for both skins; skins differ only by CSS tokens.
(function () {
  const I = {
    auto: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    adjust: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18" fill="currentColor"/>',
    looks: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
    crop: '<path d="M6 2v16h16M2 6h16v16"/>',
    retouch: '<path d="M4 20l9-9M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
    masks: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
    color: '<path d="M3 20C8 20 9 4 14 4s4 8 7 8"/>',
    export: '<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    hist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
  const T = (en, vi) => document.documentElement.lang === 'vi' ? vi : en;

  const CATS = [['auto','Auto','Tự động'],['adjust','Adjust','Chỉnh'],['looks','Looks','Bộ lọc'],['crop','Crop','Cắt'],
    ['retouch','Retouch','Sửa ảnh'],['masks','Masks','Vùng chọn'],['color','Color','Màu'],['export','Export','Xuất']];
  const ADJ = { exposure:['Exposure','Phơi sáng',-100,100], brilliance:['Brilliance','Rực rỡ',-100,100], highlights:['Highlights','Vùng sáng',-100,100],
    shadows:['Shadows','Vùng tối',-100,100], contrast:['Contrast','Tương phản',-100,100], saturation:['Saturation','Bão hòa',-100,100],
    vibrance:['Vibrance','Sống động',-100,100], warmth:['Warmth','Nhiệt độ',-100,100], tint:['Tint','Sắc độ',-100,100],
    sharpness:['Sharpness','Độ nét',0,100], noise:['Noise','Khử nhiễu',0,100], vignette:['Vignette','Viền tối',-100,100] };
  const LOOKS = [['Original','Gốc',''],['Vivid','Rực','saturate(1.4) contrast(1.1)'],['Warm','Ấm','sepia(.25) saturate(1.2)'],['Cool','Lạnh','hue-rotate(-12deg) saturate(.9)'],
    ['Mono','Đen trắng','grayscale(1) contrast(1.1)'],['Fade','Phai','contrast(.8) brightness(1.1)'],['Film','Phim','sepia(.15) contrast(1.15) saturate(.85)'],['Match','Khớp màu','hue-rotate(8deg) saturate(1.15)']];
  const RET = [['remove','Remove','Xóa vật'],['heal','Spot','Vết'],['skin','Skin','Da'],['redeye','Red-eye','Mắt đỏ'],['teeth','Teeth','Răng'],['eyes','Eyes','Mắt'],['reshape','Reshape','Chỉnh dáng']];

  const st = { tool: 'adjust', adj: 'exposure', v: Object.fromEntries(Object.keys(ADJ).map(k => [k, 0])), look: 0, lookAmt: 100,
    straighten: 0, zoom: 1, px: 0, py: 0, hist: [{ en: 'Open', vi: 'Mở' }], at: 0, bs: 40 };

  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="phone" id="ph" data-tool="adjust">
    <div class="canvas" id="cv" aria-label="${T('Photo, pinch to zoom, long-press to compare','Ảnh, chụm để phóng, nhấn giữ để so sánh')}" role="img">
      <div class="photo edit" id="img"></div><div class="photo orig" id="orig"></div>
      <div class="split-bar"><i></i></div><div class="crop-frame" id="crop"></div><canvas class="paint" id="paint"></canvas>
      <div class="brush-cursor" id="bc"></div><span class="badge before">${T('Original','Ảnh gốc')}</span>
    </div>
    <div class="ed-top">
      <button class="ic" aria-label="${T('Cancel','Hủy')}">${svg('close')}</button>
      <button class="ic" id="undo" aria-label="${T('Undo','Hoàn tác')}">${svg('undo')}</button>
      <button class="ic" id="redo" aria-label="${T('Redo','Làm lại')}">${svg('redo')}</button>
      <span class="sp"><span class="raw" title="RAW develop">RAW</span></span>
      <button class="ic" id="hbtn" aria-label="${T('History','Lịch sử')}">${svg('hist')}</button>
      <button class="ic" id="cmp" aria-label="${T('Hold to compare','Giữ để so sánh')}">${svg('compare')}</button>
      <button class="pill primary" id="done">${T('Done','Xong')}</button>
    </div>
    <div class="dock">
      <section class="panel" data-p="auto"><div class="val">${T('Auto applied: exposure, contrast, WB','Đã tự động: phơi sáng, tương phản, cân bằng trắng')}</div>
        <div class="chips"><button class="on">${T('Auto','Tự động')}</button><button>${T('Auto tone','Tông tự động')}</button><button>${T('Auto WB','CB trắng')}</button><button>${T('Undo Auto','Bỏ tự động')}</button></div></section>
      <section class="panel" data-p="adjust"><div class="val" id="aval"></div>
        <div class="ruler" id="ruler" tabindex="0" role="slider" aria-valuemin="-100" aria-valuemax="100"><div class="ruler-track" id="rt"></div><i class="ruler-zero"></i><div class="ruler-fill" id="rf"></div><i class="ruler-needle"></i></div>
        <div class="chips" id="achips">${Object.entries(ADJ).map(([k,a]) => `<button data-a="${k}">${T(a[0],a[1])}</button>`).join('')}</div></section>
      <section class="panel" data-p="looks"><div class="val" id="lval"></div>
        <div class="ruler" id="lruler" tabindex="0" role="slider" aria-label="${T('Intensity','Cường độ')}"><div class="ruler-track"></div><i class="ruler-needle"></i></div>
        <div class="looks" id="looks">${LOOKS.map((l,i) => `<button data-l="${i}"><span style="filter:${l[2]||'none'}" class="photo-thumb"></span>${T(l[0],l[1])}</button>`).join('')}</div></section>
      <section class="panel" data-p="crop"><div class="val" id="sval">0.0°</div>
        <div class="ruler" id="sruler" tabindex="0" role="slider" aria-label="${T('Straighten','Làm thẳng')}"><div class="ruler-track" id="srt"></div><i class="ruler-zero"></i><i class="ruler-needle"></i></div>
        <div class="chips" id="aspect"><button class="on" data-r="14px">${T('Free','Tự do')}</button><button data-r="14px 14px">${T('Original','Gốc')}</button><button data-r="14px 40px">1:1</button><button data-r="14px 60px">4:5</button><button data-r="60px 14px">16:9</button><button>${T('Rotate','Xoay')}</button><button>${T('Flip','Lật')}</button><button>${T('Perspective','Phối cảnh')}</button></div></section>
      <section class="panel" data-p="retouch"><div class="results" id="res" hidden>${[1,2,3,4].map(n => `<button data-n="${n}" ${n===1?'class="on"':''}>#${n}</button>`).join('')}</div>
        <div class="val" id="rval">${T('Brush over object · or tap to select','Tô lên vật thể · hoặc chạm để chọn')}</div>
        <div class="chips"><button id="bsz">${T('Size','Cỡ')} 40</button><button>${T('Hardness','Độ cứng')} 50%</button><button>${T('Tap-select','Chạm chọn')}</button><button id="gen" class="on">${T('Remove','Xóa')} ▸</button></div>
        <div class="chips">${RET.map((r,i) => `<button ${i?'':'class="on"'}>${T(r[1],r[2])}</button>`).join('')}</div></section>
      <section class="panel" data-p="masks"><div class="val">${T('Mask 1 · Sky (AI) · Exposure −20','Vùng 1 · Bầu trời (AI) · Phơi sáng −20')}</div>
        <div class="mask-list"><button class="on">${T('Sky','Trời')}</button><button>${T('Subject','Chủ thể')}</button><button>${T('Background','Nền')}</button><button>${T('Brush','Cọ')}</button><button>${T('Linear','Tuyến tính')}</button><button>${T('Radial','Tròn')}</button><button>+ ${T('Invert','Đảo')}</button></div>
        <div class="chips"><button>${T('Add','Thêm')}</button><button>${T('Subtract','Trừ')}</button><button>${T('Show overlay','Hiện lớp phủ')}</button><button>${T('Adjust','Chỉnh')}</button></div></section>
      <section class="panel" data-p="color">
        <div class="seg" id="cseg" style="margin:0 12px"><button class="on" data-c="curve">${T('Curves','Đường cong')}</button><button data-c="hsl">HSL</button><button data-c="grade">${T('Grade','Phân màu')}</button></div>
        <div data-c="curve" class="curve-box"><svg viewBox="0 0 300 110" id="csvg"><path d="M0 110L300 0" stroke="rgba(255,255,255,.2)"/><path id="cpath" stroke="currentColor"/><circle id="cpt" r="7" cx="150" cy="55"/></svg></div>
        <div data-c="hsl" hidden><div class="hsl-dots">${['#ff3b30','#ff9500','#ffcc00','#34c759','#5ac8fa','#007aff','#af52de','#ff2d55'].map((c,i) => `<button aria-label="color ${i}" ${i?'':'class="on"'}><i style="--c:${c}"></i></button>`).join('')}</div><div class="chips"><button class="on">${T('Hue','Sắc')}</button><button>${T('Saturation','Bão hòa')}</button><button>${T('Luminance','Độ sáng')}</button></div></div>
        <div data-c="grade" hidden class="wheels">${[['Shadows','Tối'],['Midtones','Trung'],['Highlights','Sáng']].map(w => `<div><div class="wheel"><b></b></div><div class="wheel-l">${T(w[0],w[1])}</div></div>`).join('')}</div></section>
      <section class="panel" data-p="export"><div class="chips"><button id="exp" class="on">${T('Save copy…','Lưu bản sao…')}</button><button>${T('Share','Chia sẻ')}</button><button>${T('Copy edits','Sao chép chỉnh')}</button></div></section>
      <nav class="cats" id="cats" role="tablist">${CATS.map(c => `<button role="tab" data-t="${c[0]}">${svg(c[0])}${T(c[1],c[2])}</button>`).join('')}</nav>
    </div>
    <div class="sheet history-sheet" role="dialog" aria-label="History"><div class="grab" data-close></div><h3>${T('History','Lịch sử')}</h3><ul class="history" id="hl"></ul></div>
    <div class="sheet export-sheet" role="dialog" aria-label="Export"><div class="grab" data-close></div><h3>${T('Export','Xuất ảnh')}</h3>
      <div class="seg"><button class="on">JPEG</button><button>HEIF</button><button>PNG</button><button>DNG</button></div>
      <div class="seg"><button class="on">${T('Full','Gốc')}</button><button>4096</button><button>2048</button><button>1080</button></div>
      <div class="row">${T('Quality','Chất lượng')}<em>92</em></div>
      <label class="row sw">${T('Strip location & metadata','Xóa vị trí & metadata')}<input type="checkbox" checked><i></i></label>
      <label class="row sw">${T('Keep original (non-destructive)','Giữ ảnh gốc')}<input type="checkbox" checked><i></i></label>
      <button class="pill primary" style="width:100%;min-height:48px;margin-top:16px" data-close>${T('Save','Lưu')}</button></div>
    <div class="toast" id="toast"></div>
  </div>`;

  const $ = s => app.querySelector(s), $$ = s => [...app.querySelectorAll(s)];
  const ph = $('#ph'), img = $('#img'), orig = $('#orig');
  const buzz = ms => navigator.vibrate && navigator.vibrate(ms);
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1400); };
  $$('.photo-thumb').forEach(s => s.style.background = getComputedStyle(img).backgroundImage);

  function render() {
    const v = st.v, L = LOOKS[st.look][2];
    img.style.filter = `brightness(${1 + v.exposure / 200 + v.shadows / 600}) contrast(${1 + v.contrast / 200 - v.highlights / 800}) saturate(${1 + (v.saturation + v.vibrance / 2) / 100}) sepia(${Math.max(0, v.warmth) / 250}) hue-rotate(${v.tint / 5 - Math.min(0, v.warmth) / 6}deg) ${st.lookAmt && L ? L : ''}`;
    const tf = `translate(${st.px}px,${st.py}px) scale(${st.zoom * (1 + Math.abs(st.straighten) / 40)}) rotate(${st.straighten}deg)`;
    img.style.transform = orig.style.transform = tf;
    const a = ADJ[st.adj], val = v[st.adj];
    $('#aval').textContent = `${T(a[0], a[1])}  ${val > 0 ? '+' : ''}${val}`;
    $('#rt').style.transform = `translateX(${-val * 2}px)`;
    const rf = $('#rf'); rf.style.width = Math.abs(val) * 0.6 + 'px'; rf.style.marginLeft = val < 0 ? -Math.abs(val) * 0.6 + 'px' : 0;
    $('#ruler').setAttribute('aria-valuenow', val); $('#ruler').setAttribute('aria-label', T(a[0], a[1]));
    $$('#achips button').forEach(b => { b.classList.toggle('on', b.dataset.a === st.adj); b.classList.toggle('dirty', v[b.dataset.a] !== 0); });
    $$('#looks button').forEach((b, i) => b.classList.toggle('on', i === st.look));
    $('#lval').textContent = `${T(LOOKS[st.look][0], LOOKS[st.look][1])}  ${st.lookAmt}`;
    $('#sval').textContent = st.straighten.toFixed(1) + '°'; $('#srt').style.transform = `translateX(${-st.straighten * 18}px)`;
    $('#hl').innerHTML = st.hist.map((h, i) => `<li class="${i > st.at ? 'future' : ''}" data-h="${i}"><span>${T(h.en, h.vi)}</span><em>${i === st.at ? '●' : ''}</em></li>`).slice().reverse().join('');
  }
  function commit(en, vi) { st.hist = st.hist.slice(0, st.at + 1); st.hist.push({ en, vi, snap: JSON.stringify(st.v) }); st.at = st.hist.length - 1; render(); }
  function jump(i) { st.at = Math.max(0, Math.min(st.hist.length - 1, i)); const s = st.hist[st.at].snap; Object.keys(st.v).forEach(k => st.v[k] = 0); if (s) Object.assign(st.v, JSON.parse(s)); render(); buzz(8); }

  function setTool(t) {
    if (t === 'export') { ph.classList.add('show-export'); }
    st.tool = t; ph.dataset.tool = t;
    $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.p === t));
    $$('#cats button').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
    if (t === 'auto') { Object.assign(st.v, { exposure: 12, contrast: 8, shadows: 18, highlights: -14, vibrance: 10 }); commit('Auto', 'Tự động'); toast(T('Auto applied', 'Đã tự động')); }
    buzz(5);
  }
  $('#cats').onclick = e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.t); };
  $('#achips').onclick = e => { const b = e.target.closest('button'); if (b) { st.adj = b.dataset.a; render(); } };
  $('#looks').onclick = e => { const b = e.target.closest('button'); if (b) { st.look = +b.dataset.l; st.lookAmt = 100; commit('Look: ' + LOOKS[st.look][0], 'Bộ lọc: ' + LOOKS[st.look][1]); } };
  $('#aspect').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.r) { $$('#aspect button').forEach(x => x.classList.toggle('on', x === b)); $('#crop').style.inset = b.dataset.r; } };
  $('#cseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#cseg button').forEach(x => x.classList.toggle('on', x === b)); $$('.panel[data-p=color] > div[data-c]').forEach(d => d.hidden = d.dataset.c !== b.dataset.c); };
  $('#undo').onclick = () => jump(st.at - 1); $('#redo').onclick = () => jump(st.at + 1);
  $('#hbtn').onclick = () => ph.classList.add('show-history');
  $('#hl').onclick = e => { const li = e.target.closest('li'); if (li) jump(+li.dataset.h); };
  $('#exp').onclick = () => ph.classList.add('show-export');
  $('#done').onclick = () => toast(T('Saved as copy · original kept', 'Đã lưu bản sao · giữ ảnh gốc'));
  app.addEventListener('click', e => { if (e.target.closest('[data-close]')) { ph.classList.remove('show-export', 'show-history'); if (st.tool === 'export') setTool('adjust'); } });

  // Ruler dial: drag = 2px per step, snap + haptic at zero, double-tap resets.
  function ruler(el, get, set, step, label) {
    let x0 = null, v0 = 0, lastTap = 0;
    el.onpointerdown = e => { x0 = e.clientX; v0 = get(); el.setPointerCapture(e.pointerId); };
    el.onpointermove = e => { if (x0 === null) return; let v = Math.round((v0 - (e.clientX - x0) / 2) / step) * step; const old = get(); set(v); if ((old !== 0) && get() === 0) buzz(10); render(); };
    el.onpointerup = () => { if (x0 !== null && get() !== v0) commit(label() + ' ' + get(), label() + ' ' + get()); x0 = null;
      const now = Date.now(); if (now - lastTap < 300) { set(0); commit(label() + ' reset', label() + ' đặt lại'); buzz(15); } lastTap = now; };
    el.onkeydown = e => { const d = { ArrowLeft: -step, ArrowRight: step }[e.key]; if (d) { set(get() + d); render(); e.preventDefault(); } };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  ruler($('#ruler'), () => st.v[st.adj], v => st.v[st.adj] = clamp(v, ADJ[st.adj][2], 100), 1, () => ADJ[st.adj][0]);
  ruler($('#lruler'), () => st.lookAmt, v => st.lookAmt = clamp(v, 0, 100), 1, () => 'Intensity');
  ruler($('#sruler'), () => st.straighten, v => st.straighten = clamp(v, -45, 45), .5, () => 'Straighten');

  // Curve point drag
  const cpt = $('#cpt'), cpath = $('#cpath');
  const drawCurve = () => cpath.setAttribute('d', `M0 110 Q${cpt.getAttribute('cx')} ${cpt.getAttribute('cy') * 2 - 55} 300 0`);
  drawCurve();
  cpt.onpointerdown = e => { cpt.setPointerCapture(e.pointerId); cpt.onpointermove = m => { const r = $('#csvg').getBoundingClientRect();
    cpt.setAttribute('cx', clamp((m.clientX - r.left) / r.width * 300, 20, 280)); cpt.setAttribute('cy', clamp((m.clientY - r.top) / r.height * 110, 5, 105)); drawCurve();
    st.v.contrast = Math.round((55 - cpt.getAttribute('cy')) * 1.2); render(); }; };
  cpt.onpointerup = () => { cpt.onpointermove = null; commit('Curve', 'Đường cong'); };

  // Canvas gestures: long-press compare, wheel/pinch zoom, drag pan, brush paint in retouch/masks.
  const cv = $('#cv'), pc = $('#paint'), bc = $('#bc'); let lp, painting = false, pan = null;
  pc.width = 360; pc.height = 480; const g = pc.getContext('2d');
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (st.tool === 'retouch' || st.tool === 'masks') { painting = true; g.fillStyle = st.tool === 'masks' ? 'rgba(255,59,48,.35)' : 'rgba(255,214,10,.4)'; g.beginPath(); g.arc(x, y, st.bs / 2, 0, 7); g.fill(); return; }
    lp = setTimeout(() => { ph.classList.add('comparing'); buzz(12); }, 280); pan = { x: e.clientX - st.px, y: e.clientY - st.py };
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; bc.style.left = x + 'px'; bc.style.top = y + 'px';
    if (painting) { g.beginPath(); g.arc(x, y, st.bs / 2, 0, 7); g.fill(); }
    else if (pan && st.zoom > 1) { clearTimeout(lp); st.px = e.clientX - pan.x; st.py = e.clientY - pan.y; render(); }
  });
  const end = () => { clearTimeout(lp); ph.classList.remove('comparing'); pan = null; if (painting) { painting = false; $('#rval').textContent = T('Selection ready — tap Remove', 'Đã chọn — chạm Xóa'); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointerleave', end);
  cv.addEventListener('wheel', e => { e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY < 0 ? 1.1 : .9), 1, 8); if (st.zoom === 1) st.px = st.py = 0; render(); }, { passive: false });
  cv.addEventListener('dblclick', () => { st.zoom = st.zoom > 1 ? 1 : 2.5; st.px = st.py = 0; render(); });
  const cmp = $('#cmp'); cmp.onpointerdown = () => ph.classList.add('comparing'); cmp.onpointerup = cmp.onpointerleave = () => ph.classList.remove('comparing');

  // Object removal: generate 4 candidates, compare with draggable before/after split.
  $('#gen').onclick = () => { g.clearRect(0, 0, 360, 480); $('#res').hidden = false; ph.classList.add('split'); cv.style.setProperty('--split', '50%');
    $('#rval').textContent = T('4 results · drag split · tap to pick', '4 kết quả · kéo thanh chia · chạm để chọn'); commit('Remove object', 'Xóa vật thể'); buzz(20); };
  $('#res').onclick = e => { const b = e.target.closest('button'); if (b) $$('#res button').forEach(x => x.classList.toggle('on', x === b)); };
  $('.split-bar').onpointerdown = e => { e.stopPropagation(); const bar = e.currentTarget; bar.setPointerCapture(e.pointerId);
    bar.onpointermove = m => { const r = cv.getBoundingClientRect(); cv.style.setProperty('--split', clamp((m.clientX - r.left) / r.width * 100, 0, 100) + '%'); }; };
  $('.split-bar').onpointerup = e => e.currentTarget.onpointermove = null;
  $('#bsz').onclick = () => { st.bs = st.bs >= 80 ? 20 : st.bs + 20; ph.style.setProperty('--bs', st.bs + 'px'); $('#bsz').textContent = T('Size', 'Cỡ') + ' ' + st.bs; };

  // Horizontal swipe on the panel area switches tool.
  let sx = null; $('.dock').addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
  $('.dock').addEventListener('touchend', e => { if (sx === null || e.target.closest('.ruler,.chips,.looks,.cats,.results')) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) { const i = CATS.findIndex(c => c[0] === st.tool); setTool(CATS[clamp(i + (dx < 0 ? 1 : -1), 0, CATS.length - 2)][0]); } });

  document.getElementById('orient')?.addEventListener('click', () => ph.dataset.orient = ph.dataset.orient === 'landscape' ? '' : 'landscape');
  document.getElementById('lang')?.addEventListener('click', () => { document.documentElement.lang = document.documentElement.lang === 'vi' ? 'en' : 'vi'; location.hash = document.documentElement.lang; location.reload(); });
  setTool('adjust'); render();
})();
