(() => {
  const CAP = 4;
  const COLORS = ['#ff2e4d','#ff8a00','#ffe600','#1fe03a','#2ff3ff','#2e9bff',
                  '#4040ff','#8a3be0','#e02fe0','#ff84ff','#ff5e9a','#9b6b3a'];

  const $ = id => document.getElementById(id);
  const boardEl = $('board');

  let level = parseInt(localStorage.getItem('ws_level') || '1', 10) || 1;
  let tubes = [];
  let initial = [];
  let history = [];
  let moves = 0;
  let selected = null;
  let busy = false;
  let extraLeft = 1;
  let tubeEls = [];
  let SEG = 42;

  const clone = t => t.map(a => a.slice());
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Lógica ---------- */
  function genLevel(n) {
    const k = Math.min(3 + Math.floor((n - 1) / 2), COLORS.length);
    let t;
    do {
      const pool = [];
      for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) pool.push(c);
      shuffle(pool);
      t = [];
      for (let i = 0; i < k; i++) t.push(pool.slice(i * CAP, i * CAP + CAP));
    } while (t.some(isComplete));
    t.push([], []);
    return t;
  }
  const isComplete = t => t.length === CAP && t.every(c => c === t[0]);
  const top = t => t[t.length - 1];
  function topCount(t) { let n = 0; for (let i = t.length - 1; i >= 0 && t[i] === top(t); i--) n++; return n; }
  function canPour(a, b) {
    const A = tubes[a], B = tubes[b];
    return a !== b && A.length > 0 && B.length < CAP && (B.length === 0 || top(B) === top(A));
  }
  const isWon = () => tubes.every(t => t.length === 0 || isComplete(t));

  /* ---------- Montagem ---------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    tubeEls = [];
    const n = tubes.length;
    const W = Math.max(boardEl.clientWidth, 200);
    const Hh = Math.max(boardEl.clientHeight, 200);
    const gap = Math.max(6, Math.min(14, window.innerWidth * 0.016));
    let best = null;
    for (let r = 1; r <= 4; r++) {
      const pr = Math.ceil(n / r), rows = Math.ceil(n / pr);
      const segW = ((W - (pr - 1) * gap) / pr) * 0.82;
      const segH = (Hh - 22 - rows * 34) / (4 * rows + (rows - 1) * 0.5);
      const seg = Math.min(segW, segH, 84);
      if (!best || seg > best.seg) best = { seg, pr };
    }
    const perRow = best.pr;
    SEG = Math.max(20, Math.floor(best.seg));
    const tw = Math.floor(SEG / 0.82);
    document.documentElement.style.setProperty('--tw', tw + 'px');
    document.documentElement.style.setProperty('--seg', SEG + 'px');

    let row;
    for (let i = 0; i < n; i++) {
      if (i % perRow === 0) { row = document.createElement('div'); row.className = 'row'; boardEl.appendChild(row); }
      const el = document.createElement('div');
      el.className = 'tube';
      el.innerHTML = '<div class="glass"></div><div class="cork"></div>';
      el.addEventListener('click', () => onTube(i));
      row.appendChild(el);
      tubeEls.push(el);
    }
    tubes.forEach((_, i) => renderTube(i));
  }

  function renderTube(i, newCount = 0) {
    const t = tubes[i], el = tubeEls[i];
    const glass = el.querySelector('.glass');
    glass.innerHTML = '';
    t.forEach((c, idx) => {
      const s = document.createElement('div');
      s.className = 'seg';
      if (idx === t.length - 1) s.classList.add('top');
      if (idx >= t.length - newCount) s.classList.add('new');
      s.style.background = COLORS[c];
      glass.appendChild(s);
    });
    el.classList.toggle('done', isComplete(t));
    el.classList.toggle('selected', selected === i);
  }

  function updateHud() {
    $('levelNum').textContent = level;
    $('moves').textContent = moves;
    $('addLeft').textContent = extraLeft;
    $('btnAdd').disabled = extraLeft <= 0;
    $('btnUndo').disabled = history.length === 0;
    const total = Math.max(initial.length - 2, 1);
    const done = tubes.filter(isComplete).length;
    $('progTxt').textContent = done + '/' + total;
    $('progBar').style.width = Math.min(100, done / total * 100) + '%';
  }

  function startLevel(keepInitial = false) {
    if (!keepInitial) initial = genLevel(level);
    tubes = clone(initial);
    history = []; moves = 0; selected = null; busy = false; extraLeft = 1;
    $('modal').classList.add('hidden');
    buildBoard(); updateHud();
  }

  /* ---------- Interação ---------- */
  function onTube(i) {
    if (busy) return;
    if (selected === null) {
      if (tubes[i].length) { selected = i; renderTube(i); }
      return;
    }
    if (selected === i) { selected = null; renderTube(i); return; }
    if (canPour(selected, i)) { pour(selected, i); return; }
    const old = selected;
    selected = tubes[i].length ? i : null;
    renderTube(old); if (selected !== null) renderTube(i);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function pour(a, b) {
    busy = true;
    const fromEl = tubeEls[a], toEl = tubeEls[b];
    const color = top(tubes[a]);
    const count = Math.min(topCount(tubes[a]), CAP - tubes[b].length);

    history.push({ tubes: clone(tubes), moves });

    // geometria (tubo selecionado está 16px acima)
    const fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
    const H = fr.height, ang = 68 * Math.PI / 180;
    const dir = (tr.left + tr.width / 2) >= (fr.left + fr.width / 2) ? 1 : -1;
    const fcx = fr.left + fr.width / 2, fcy = fr.top + 16 + H / 2;
    const tcx = tr.left + tr.width / 2;
    const cx = tcx - dir * (H / 2) * Math.sin(ang);
    const cy = tr.top - 12 + (H / 2) * Math.cos(ang);

    fromEl.style.zIndex = 20;
    fromEl.style.transform = `translate(${cx - fcx}px,${cy - fcy}px) rotate(${dir * 68}deg)`;
    await wait(380);

    // atualiza estado + fluxo
    const surfaceFrom = tubes[b].length;
    for (let k = 0; k < count; k++) tubes[b].push(tubes[a].pop());
    selected = null;
    const stream = document.createElement('div');
    stream.className = 'stream';
    stream.style.background = COLORS[color];
    stream.style.color = COLORS[color];
    const glassH = tr.height;
    stream.style.height = (glassH - surfaceFrom * SEG + 4) + 'px';
    toEl.appendChild(stream);
    renderTube(a);
    renderTube(b, count);
    await wait(420);

    stream.remove();
    fromEl.style.transform = '';
    await wait(320);
    fromEl.style.zIndex = '';
    moves++;
    busy = false;
    updateHud();
    if (isWon()) win();
  }

  function undo() {
    if (busy || !history.length) return;
    const h = history.pop();
    tubes = h.tubes; moves = h.moves; selected = null;
    tubes.forEach((_, i) => renderTube(i));
    updateHud();
  }

  function addTube() {
    if (busy || extraLeft <= 0) return;
    extraLeft--;
    tubes.push([]);
    selected = null;
    buildBoard(); updateHud();
  }

  function win() {
    $('finalMoves').textContent = moves;
    level++;
    localStorage.setItem('ws_level', level);
    confetti();
    setTimeout(() => $('modal').classList.remove('hidden'), 500);
  }

  function confetti() {
    const box = $('confetti');
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      p.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
      p.style.animationDelay = Math.random() * .5 + 's';
      box.appendChild(p);
      setTimeout(() => p.remove(), 4500);
    }
  }

  /* ---------- Botões ---------- */
  $('btnUndo').onclick = undo;
  $('btnRestart').onclick = () => { if (!busy) startLevel(true); };
  $('btnAdd').onclick = addTube;
  $('btnSkip').onclick = () => { if (busy) return; level++; localStorage.setItem('ws_level', level); startLevel(); };
  $('btnNext').onclick = () => startLevel();

  let rt;
  window.addEventListener('orientationchange', () => setTimeout(() => { if (!busy) buildBoard(); }, 250));
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!busy) buildBoard(); }, 150); });

  startLevel();
})();
