(() => {
  'use strict';

  const STORAGE_KEY = 'recall-toefl-v1';
  const TYPE_LABELS = { word: 'WORD', sentence: 'SENTENCE', mistake: 'MISTAKE' };
  const TYPE_KO = { word: '단어', sentence: '중요 문장', mistake: '오답' };
  const DAY = 86400000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const now = () => Date.now();
  const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let state = loadState();
  let studyQueue = [];
  let studyIndex = 0;
  let sessionAnswered = 0;
  let activeFilter = 'all';
  let pendingDelete = null;

  function defaultState() {
    return { version: 1, settings: { dailyGoal: 20 }, cards: [], history: [], studyDays: [] };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && Array.isArray(saved.cards) ? { ...defaultState(), ...saved, settings: { ...defaultState().settings, ...saved.settings } } : defaultState();
    } catch { return defaultState(); }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
  }

  function createCard(data) {
    return {
      id: uid(), type: data.type, prompt: data.prompt.trim(), answer: data.answer.trim(), note: data.note.trim(),
      tags: data.tags.map(tag => tag.trim()).filter(Boolean), createdAt: now(), updatedAt: now(),
      repetitions: 0, interval: 0, ease: 2.5, dueAt: now(), lastReviewedAt: null, reviewCount: 0
    };
  }

  function dueCards() {
    return state.cards.filter(card => card.dueAt <= now()).sort((a, b) => a.dueAt - b.dueAt || a.ease - b.ease);
  }

  function getTodayQueue() {
    return dueCards().slice(0, state.settings.dailyGoal);
  }

  function addDays(days) { return now() + Math.max(1, Math.ceil(days)) * DAY; }

  // SM-2: MASTER=5, SOSO=3, NOT AT ALL=1.
  function reviewCard(card, rating) {
    const quality = { master: 5, soso: 3, not: 1 }[rating];
    const old = { ...card };
    card.ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    if (quality < 3) {
      card.repetitions = 0;
      card.interval = 1;
      card.dueAt = addDays(1);
    } else {
      if (card.repetitions === 0) card.interval = 1;
      else if (card.repetitions === 1) card.interval = 6;
      else card.interval = Math.ceil(card.interval * card.ease);
      card.repetitions += 1;
      card.dueAt = addDays(card.interval);
    }
    card.lastReviewedAt = now();
    card.reviewCount += 1;
    card.updatedAt = now();
    state.history.push({ id: uid(), cardId: card.id, rating, quality, at: now(), intervalBefore: old.interval, intervalAfter: card.interval });
    if (!state.studyDays.includes(dayKey())) state.studyDays.push(dayKey());
    state.studyDays = state.studyDays.slice(-400);
  }

  function calculateStreak() {
    const days = new Set(state.studyDays);
    let cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY);
    let streak = 0;
    while (days.has(dayKey(cursor))) { streak += 1; cursor = new Date(cursor.getTime() - DAY); }
    return streak;
  }

  function formatDue(timestamp) {
    if (timestamp <= now()) return '오늘';
    const days = Math.ceil((timestamp - now()) / DAY);
    if (days === 1) return '내일';
    return `${days}일 후`;
  }

  function go(view) {
    $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view || (view === 'study' && el.dataset.view === 'today')));
    if (view === 'library') renderLibrary();
    if (view === 'stats') renderStats();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAll() {
    const due = getTodayQueue();
    $('#dueCount').textContent = due.length;
    $('#streakCount').textContent = calculateStreak();
    $('#todaySummary').textContent = state.cards.length ? (due.length ? `복습 ${due.length}장이 기다리고 있어요. 약 ${Math.max(2, Math.ceil(due.length * .45))}분이면 충분합니다.` : '오늘 예정된 복습을 모두 마쳤어요. 새 카드를 추가해도 좋아요.') : '첫 단어나 문장, 오답을 기록하면 오늘의 학습이 시작됩니다.';
    $('#startStudy').disabled = due.length === 0;
    $('#startStudy').style.opacity = due.length ? '1' : '.5';
    const counts = { word: 0, sentence: 0, mistake: 0 };
    state.cards.forEach(card => counts[card.type] += 1);
    const symbols = { word: 'Aa', sentence: '“”', mistake: '×' };
    $('#collectionSummary').replaceChildren(...Object.keys(counts).map(type => {
      const article = document.createElement('article'); article.className = 'collection-card';
      const left = document.createElement('div');
      const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = symbols[type];
      const title = document.createElement('h3'); title.textContent = TYPE_KO[type];
      const sub = document.createElement('p'); sub.textContent = TYPE_LABELS[type];
      left.append(icon, title, sub);
      const count = document.createElement('strong'); count.textContent = counts[type];
      article.append(left, count); return article;
    }));
    renderLibrary(); renderStats();
  }

  function renderLibrary() {
    const query = $('#searchInput').value.trim().toLowerCase();
    const cards = state.cards.filter(card => {
      const typeMatch = activeFilter === 'all' || card.type === activeFilter;
      const haystack = [card.prompt, card.answer, card.note, ...card.tags].join(' ').toLowerCase();
      return typeMatch && haystack.includes(query);
    }).sort((a, b) => b.createdAt - a.createdAt);
    const list = $('#libraryList'); list.replaceChildren();
    if (!cards.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      const b = document.createElement('b'); b.textContent = state.cards.length ? '검색 결과가 없어요.' : '아직 카드가 없어요.';
      const span = document.createElement('span'); span.textContent = state.cards.length ? '다른 검색어나 필터를 시도해보세요.' : '첫 학습 카드를 만들어 기억을 시작하세요.';
      empty.append(b, span); list.append(empty); return;
    }
    cards.forEach(card => {
      const row = document.createElement('article'); row.className = 'library-row';
      const type = document.createElement('span'); type.className = 'type-badge'; type.textContent = TYPE_LABELS[card.type];
      const prompt = document.createElement('h3'); prompt.textContent = card.prompt;
      const answer = document.createElement('p'); answer.className = 'library-answer'; answer.textContent = card.answer;
      const due = document.createElement('span'); due.className = 'due-label'; due.textContent = formatDue(card.dueAt);
      const actions = document.createElement('div'); actions.className = 'row-actions';
      const edit = document.createElement('button'); edit.className = 'icon-button'; edit.title = '수정'; edit.textContent = '✎'; edit.addEventListener('click', () => editCard(card.id));
      const del = document.createElement('button'); del.className = 'icon-button'; del.title = '삭제'; del.textContent = '×'; del.addEventListener('click', () => askDelete(card.id));
      actions.append(edit, del); row.append(type, prompt, answer, due, actions); list.append(row);
    });
  }

  function renderStats() {
    const masters = state.history.filter(item => item.rating === 'master').length;
    $('#totalCards').textContent = state.cards.length;
    $('#totalReviews').textContent = state.history.length;
    $('#masterRate').textContent = `${state.history.length ? Math.round(masters / state.history.length * 100) : 0}%`;
    $('#dailyGoal').value = state.settings.dailyGoal;
    $('#dailyGoalOutput').textContent = `${state.settings.dailyGoal}장`;
  }

  function startStudy() {
    studyQueue = getTodayQueue().map(card => card.id);
    studyIndex = 0; sessionAnswered = 0;
    if (!studyQueue.length) { toast('오늘 복습은 모두 끝났어요.'); return; }
    go('study'); showStudyCard();
  }

  function showStudyCard() {
    if (studyIndex >= studyQueue.length) { finishStudy(); return; }
    const card = state.cards.find(item => item.id === studyQueue[studyIndex]);
    if (!card) { studyIndex += 1; showStudyCard(); return; }
    $('#studyType').textContent = TYPE_LABELS[card.type];
    $('#studyTag').textContent = card.tags.slice(0, 2).join(' · ');
    $('#studyPrompt').textContent = card.prompt;
    $('#studyAnswer').textContent = card.answer;
    $('#studyNote').textContent = card.note;
    $('.prompt-face').hidden = false; $('.answer-face').hidden = true; $('#ratingPanel').hidden = true;
    $('#studyCard').setAttribute('aria-label', '정답 보기');
    $('#progressText').textContent = `${Math.min(studyIndex + 1, studyQueue.length)} / ${studyQueue.length}`;
    $('#progressBar').style.width = `${studyQueue.length ? sessionAnswered / studyQueue.length * 100 : 0}%`;
  }

  function revealAnswer() {
    if ($('.prompt-face').hidden) return;
    $('.prompt-face').hidden = true; $('.answer-face').hidden = false; $('#ratingPanel').hidden = false;
    $('#studyCard').setAttribute('aria-label', '정답이 표시됨');
  }

  function rate(rating) {
    const cardId = studyQueue[studyIndex];
    const card = state.cards.find(item => item.id === cardId);
    if (!card) return;
    reviewCard(card, rating); sessionAnswered += 1;
    // A failed card reappears after two other cards, once per failure.
    if (rating === 'not') studyQueue.splice(Math.min(studyIndex + 3, studyQueue.length), 0, cardId);
    studyIndex += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    showStudyCard();
  }

  function finishStudy() {
    $('#progressBar').style.width = '100%';
    toast(`${sessionAnswered}번의 복습을 완료했어요.`);
    saveState(); go('today');
  }

  function updateFormLabels(type) {
    const map = {
      word: ['단어 · 표현', '뜻 · 정답', '예: ubiquitous', '예: 어디에나 존재하는, 아주 흔한'],
      sentence: ['중요 문장', '해석 · 핵심 의미', '기억하고 싶은 문장을 입력하세요.', '문장의 해석이나 핵심 구조를 입력하세요.'],
      mistake: ['틀린 문제 · 질문', '정답 · 올바른 풀이', '틀린 문제나 질문을 입력하세요.', '정답과 올바른 접근을 입력하세요.']
    }[type];
    $('#promptLabel').textContent = map[0]; $('#answerLabel').textContent = map[1];
    $('#promptInput').placeholder = map[2]; $('#answerInput').placeholder = map[3];
  }

  function editCard(id) {
    const card = state.cards.find(item => item.id === id); if (!card) return;
    $('#editId').value = id; $(`input[name="type"][value="${card.type}"]`).checked = true;
    $('#promptInput').value = card.prompt; $('#answerInput').value = card.answer; $('#noteInput').value = card.note; $('#tagInput').value = card.tags.join(', ');
    $('#formTitle').textContent = '카드 수정하기'; $('#saveCard').firstChild.textContent = '변경 저장 '; $('#cancelEdit').hidden = false;
    updateFormLabels(card.type); go('add');
  }

  function clearForm() {
    $('#cardForm').reset(); $('#editId').value = ''; $('#formTitle').textContent = '새 카드 만들기';
    $('#saveCard').firstChild.textContent = '카드 저장 '; $('#cancelEdit').hidden = true; updateFormLabels('word');
  }

  function submitCard(event) {
    event.preventDefault();
    const data = { type: $('input[name="type"]:checked').value, prompt: $('#promptInput').value, answer: $('#answerInput').value, note: $('#noteInput').value, tags: $('#tagInput').value.split(',') };
    const id = $('#editId').value;
    if (id) {
      const card = state.cards.find(item => item.id === id);
      Object.assign(card, { ...data, prompt: data.prompt.trim(), answer: data.answer.trim(), note: data.note.trim(), tags: data.tags.map(t => t.trim()).filter(Boolean), updatedAt: now() });
      toast('카드를 수정했어요.');
    } else { state.cards.push(createCard(data)); toast('오늘 학습에 카드를 추가했어요.'); }
    clearForm(); saveState(); go('library');
  }

  function askDelete(id) { pendingDelete = id; $('#confirmDialog').showModal(); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2500); }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `recall-toefl-${dayKey()}.json`; link.click(); URL.revokeObjectURL(link.href);
    toast('백업 파일을 저장했어요.');
  }

  async function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.history)) throw new Error('invalid');
      state = { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } };
      saveState(); toast('학습 데이터를 복원했어요.');
    } catch { toast('올바른 RE:CALL 백업 파일이 아니에요.'); }
    event.target.value = '';
  }

  function init() {
    $('#todayDate').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()).toUpperCase();
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
    $$('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
    $('#startStudy').addEventListener('click', startStudy);
    $('#studyCard').addEventListener('click', revealAnswer);
    $('#studyCard').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revealAnswer(); } });
    $$('.rating').forEach(btn => btn.addEventListener('click', () => rate(btn.dataset.rating)));
    $('#cardForm').addEventListener('submit', submitCard); $('#cancelEdit').addEventListener('click', clearForm);
    $$('input[name="type"]').forEach(input => input.addEventListener('change', () => updateFormLabels(input.value)));
    $('#searchInput').addEventListener('input', renderLibrary);
    $$('.filter').forEach(btn => btn.addEventListener('click', () => { activeFilter = btn.dataset.filter; $$('.filter').forEach(b => b.classList.toggle('active', b === btn)); renderLibrary(); }));
    $('#dailyGoal').addEventListener('input', e => { $('#dailyGoalOutput').textContent = `${e.target.value}장`; });
    $('#dailyGoal').addEventListener('change', e => { state.settings.dailyGoal = Number(e.target.value); saveState(); toast('하루 학습량을 변경했어요.'); });
    $('#exportData').addEventListener('click', exportData); $('#importData').addEventListener('change', importData);
    $('#confirmDialog').addEventListener('click', e => {
      if (!e.target.value) return;
      if (e.target.value === 'confirm' && pendingDelete) { state.cards = state.cards.filter(c => c.id !== pendingDelete); state.history = state.history.filter(h => h.cardId !== pendingDelete); saveState(); toast('카드를 삭제했어요.'); }
      pendingDelete = null; $('#confirmDialog').close();
    });
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
