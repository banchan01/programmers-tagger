(async () => {
  // labels.json: { "<문제 id>": { t: 제목, l: 난이도, p: 섹션, c: [유형...] } }
  const problems = await fetch(chrome.runtime.getURL('labels.json')).then(r => r.json());
  const ID_RE = /\/learn\/courses\/30\/lessons\/(\d+)/;
  const SQL_SUB = ['SELECT', 'SUM, MAX, MIN', 'IS NULL', 'GROUP BY', 'JOIN', 'String, Date'];

  // ---------- 태그 표시 ----------
  function makeTags(id) {
    const p = problems[id];
    if (!p) return null;
    const box = document.createElement('span');
    box.className = 'pgc-tags';
    for (const t of p.c) {
      const s = document.createElement('span');
      s.className = 'pgc-tag' + (t === 'SQL' || SQL_SUB.includes(t) ? ' pgc-sql' : t === '기초' ? ' pgc-basic' : '');
      s.textContent = t;
      box.appendChild(s);
    }
    return box;
  }

  // 같은 요소가 다른 문제로 재사용돼도(페이지 이동) 태그를 새로 맞춘다
  function attach(el, id) {
    if (el.dataset.pgc === id) return;
    el.dataset.pgc = id;
    const next = el.nextElementSibling;
    if (next && next.classList.contains('pgc-tags')) next.remove();
    const box = makeTags(id);
    if (box) el.insertAdjacentElement('afterend', box);
  }

  function decorate() {
    // 문제 목록 등 문제로 가는 링크 옆에 표시 (필터 결과 목록은 직접 그리므로 제외)
    for (const a of document.querySelectorAll('a[href*="/lessons/"]')) {
      if (a.closest('.pgc-filter')) continue;
      const m = a.getAttribute('href').match(ID_RE);
      if (!m || !a.textContent.trim()) continue;
      attach(a, m[1]);
    }
    // 문제 풀이 화면 상단 제목 옆에 표시
    const title = document.querySelector('.challenge-title');
    const m = location.pathname.match(ID_RE);
    if (title && m) attach(title, m[1]);

    if (location.pathname.startsWith('/learn/challenges')) mountFilter();
  }

  // ---------- 유형 필터 (문제 목록 화면) ----------
  const counts = {};
  for (const p of Object.values(problems)) for (const t of p.c) counts[t] = (counts[t] || 0) + 1;
  const algoTags = Object.keys(counts).filter(t => t !== 'SQL' && !SQL_SUB.includes(t))
    .sort((a, b) => counts[b] - counts[a]);
  const sqlTags = ['SQL', ...SQL_SUB.filter(t => counts[t])];

  const state = { tags: new Set(), levels: new Set() };
  try {
    const saved = JSON.parse(sessionStorage.getItem('pgc-filter') || '{}');
    (saved.tags || []).forEach(t => counts[t] && state.tags.add(t));
    (saved.levels || []).forEach(l => state.levels.add(l));
  } catch (e) {}
  const save = () => {
    try { sessionStorage.setItem('pgc-filter', JSON.stringify({ tags: [...state.tags], levels: [...state.levels] })); } catch (e) {}
  };

  let panel = null;

  function mountFilter() {
    const table = document.querySelector('td.title')?.closest('table') || document.querySelector('th.title')?.closest('table');
    if (!table) return;
    const wrap = table.closest('[class*="ChallengesTableWrap"]') || table.parentElement.parentElement;
    wrap.dataset.pgcWrap = '1';
    if (panel && panel.isConnected && panel.nextElementSibling === wrap) return;
    if (!panel) panel = buildPanel();
    wrap.insertAdjacentElement('beforebegin', panel);
    render();
  }

  function chip(label, active, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pgc-chip' + (active ? ' on' : '') + extraClass;
    b.innerHTML = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function buildPanel() {
    const el = document.createElement('div');
    el.className = 'pgc-filter';
    el.innerHTML = `
      <div class="pgc-filter-head">
        <strong>유형으로 찾기</strong>
        <span class="pgc-hint">여러 개를 고르면 모두 해당하는 문제만 보여요</span>
        <button type="button" class="pgc-reset">초기화</button>
      </div>
      <div class="pgc-row" data-row="algo"></div>
      <div class="pgc-row" data-row="sql"></div>
      <div class="pgc-row" data-row="level"></div>
      <div class="pgc-result"></div>`;
    el.querySelector('.pgc-reset').addEventListener('click', () => {
      state.tags.clear(); state.levels.clear(); save(); render();
    });
    return el;
  }

  function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); save(); render(); }

  function render() {
    if (!panel) return;
    const fill = (row, tags) => {
      const box = panel.querySelector(`[data-row="${row}"]`);
      box.replaceChildren(...tags.map(t =>
        chip(`${t}<span class="pgc-n">${counts[t]}</span>`, state.tags.has(t), () => toggle(state.tags, t),
          row === 'sql' ? ' pgc-chip-sql' : '')));
    };
    fill('algo', algoTags);
    fill('sql', sqlTags);
    const lv = panel.querySelector('[data-row="level"]');
    lv.replaceChildren(...[0, 1, 2, 3, 4, 5].map(l =>
      chip(`Lv. ${l}`, state.levels.has(l), () => toggle(state.levels, l), ' pgc-chip-lv')));

    const filtering = state.tags.size > 0;
    document.documentElement.classList.toggle('pgc-filtering', filtering);
    panel.querySelector('.pgc-reset').hidden = !filtering && !state.levels.size;
    const result = panel.querySelector('.pgc-result');
    if (!filtering) {
      result.replaceChildren();
      const p = document.createElement('p');
      p.className = 'pgc-empty';
      p.textContent = '유형을 고르면 전체 문제 중 해당하는 문제를 모아 보여줘요.';
      result.appendChild(p);
      return;
    }

    const list = Object.entries(problems)
      .filter(([, p]) => [...state.tags].every(t => p.c.includes(t)))
      .filter(([, p]) => !state.levels.size || state.levels.has(p.l))
      .sort((a, b) => a[1].l - b[1].l || Number(b[0]) - Number(a[0]));

    const table = document.createElement('table');
    table.className = 'pgc-table';
    table.innerHTML = `<caption>${list.length}문제</caption>
      <thead><tr><th>제목</th><th>난이도</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const [id, p] of list) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const a = document.createElement('a');
      a.href = `/learn/courses/30/lessons/${id}`;
      a.textContent = p.t;
      const small = document.createElement('small');
      small.textContent = p.p;
      td1.append(a, makeTags(id), small);
      const td2 = document.createElement('td');
      td2.className = 'pgc-lv pgc-lv-' + p.l;
      td2.textContent = `Lv. ${p.l}`;
      tr.append(td1, td2);
      tbody.appendChild(tr);
    }
    if (!list.length) tbody.innerHTML = '<tr><td colspan="2" class="pgc-empty">조건에 맞는 문제가 없어요.</td></tr>';
    table.appendChild(tbody);
    result.replaceChildren(table);
  }

  // ---------- 유형 가리기 설정 ----------
  function applyHide(hide) { document.documentElement.classList.toggle('pgc-hide', !!hide); }
  chrome.storage.sync.get({ hide: false }, v => applyHide(v.hide));
  chrome.storage.onChanged.addListener(c => { if (c.hide) applyHide(c.hide.newValue); });

  decorate();
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(decorate, 100);
  }).observe(document.body, { childList: true, subtree: true });
})();
