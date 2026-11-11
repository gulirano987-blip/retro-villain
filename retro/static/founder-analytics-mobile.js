/* Аналитика учредителя на телефоне (макет «3б · Аналитика целиком», ноябрь 2026).
 *
 * Только показ: строка разделов, «Общая картина» недели сверху, свёрнутый
 * фильтр, компактная рассылка и свёрнутая таблица «По периодам». Неделя
 * берётся теми же запросами, что в кабинете (/api/founder/week, дивиденды,
 * прогноз), и считается той же логикой кабинета (FounderCabinetLogic) —
 * новых расчётов и запросов нет. На компьютере (≥ 901) ничего не делает. */
(() => {
  const $ = id => document.getElementById(id);
  const logic = globalThis.FounderCabinetLogic;
  const {num, sum, short, plural, dm} = logic;
  const phone = matchMedia('(max-width: 900px)');
  const state = {today: null, weekDate: null, dividends: null, forecast: null, started: false};

  function setText(id, value) { $(id).textContent = value; }
  function shiftDay(iso, days) {
    const value = new Date(iso + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  async function request(url) {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || 'Не удалось получить данные.');
    return body;
  }

  // ── «Общая картина» недели ────────────────────────────────────────────
  function renderWeek(week) {
    const totals = logic.weekTotals(week);
    const current = week.start <= state.today && state.today <= week.end;
    setText('fa-week-range', dm(week.start) + '–' + dm(week.end));
    setText('fa-week-current', current ? '· текущая' : '');
    $('fa-week-next').disabled = current || week.end >= state.today;
    setText('fa-week-total', short(totals.retro + totals.school));
    // Процент к прошлой неделе — только если сервер его прислал (сейчас — только демо).
    const compare = week.compare, change = $('fa-week-change');
    const percent = compare ? num(compare.percent) : null;
    change.hidden = percent === null;
    if (percent !== null) {
      change.textContent = (percent >= 0 ? '▲ ' : '▼ ') + Math.abs(percent) + '%';
      change.className = percent >= 0 ? 'is-up' : 'is-down';
    }
    const days = totals.days + ' ' + plural(totals.days, 'день', 'дня', 'дней');
    setText('fa-week-days', percent !== null ? 'к тем же ' + days + ' прошлой недели' : days + ' недели');
    setText('fa-k-retro', short(totals.retro));
    setText('fa-k-retro-sub', days + ' недели');
    setText('fa-k-ox', short(totals.school));
    setText('fa-k-ox-sub', week.orders_error ? 'чеки: ' + week.orders_error : days + ' недели');
    setText('fa-k-demo', short(totals.demo));
    setText('fa-k-demo-sub', totals.demoShare === null ? '' : totals.demoShare + '% выручки Retro');
    renderDividends(week);
  }

  function renderDividends(week) {
    const card = $('fa-k-div-card'), data = state.dividends;
    if (!data) { card.hidden = true; return; }
    const view = logic.dividendView(data);
    // Неделя дивидендов — текущая; для прошлой — запись из истории, если есть.
    const past = week && week.start !== data.start ? (data.history || []).find(item => item.start === week.start) : null;
    if (week && week.start !== data.start && !past) { card.hidden = true; return; }
    card.hidden = false;
    const target = past ? num(past.target) : view.target, collected = past ? num(past.collected) || 0 : view.collected;
    setText('fa-k-div', short(collected));
    setText('fa-k-div-sub', target === null ? 'цель не задана'
      : 'из ' + short(target) + (past ? '' : ' · ' + view.status.toLowerCase()));
    $('fa-k-div-bar').style.width = (target ? Math.min(100, collected / target * 100) : 0) + '%';
  }

  function renderForecast(data) {
    const month = data && data.month;
    if (!month) { setText('fa-k-month', '—'); setText('fa-k-month-sub', data && data.error ? data.error : ''); return; }
    const total = num(month.total), fact = num(month.fact);
    setText('fa-k-month', short(total));
    setText('fa-k-month-sub', 'факт ' + short(fact) + ' + прогноз ' + short(num(month.forecast)));
    $('fa-k-month-bar').style.width = (total ? Math.min(100, fact / total * 100) : 0) + '%';
  }

  function weekFailed(error) {
    ['fa-week-total', 'fa-k-retro', 'fa-k-ox', 'fa-k-demo'].forEach(id => setText(id, '—'));
    setText('fa-week-days', error.message);
    ['fa-k-retro-sub', 'fa-k-ox-sub', 'fa-k-demo-sub'].forEach(id => setText(id, ''));
    $('fa-week-change').hidden = true;
    renderDividends(null);
  }

  function loadWeek() {
    request('/api/founder/week?date=' + state.weekDate).then(week => {
      state.weekStart = week.start;
      renderWeek(week);
    }).catch(weekFailed);
  }

  async function startWeek() {
    if (state.started || !phone.matches) return;
    state.started = true;
    try {
      const config = await globalThis.RetroConfig;
      state.today = config.today;
    } catch (error) { state.today = new Date().toISOString().slice(0, 10); }
    state.weekDate = state.today;
    request('/api/founder/dividends/weekly').then(data => { state.dividends = data; renderDividends(null); }).catch(() => renderDividends(null));
    request('/api/founder/forecast?date=' + state.today).then(renderForecast).catch(error => renderForecast({error: error.message}));
    loadWeek();
  }

  // Переключатель недель: /api/founder/week принимает любую дату — прошлые недели доступны.
  $('fa-week-prev').addEventListener('click', () => {
    if (!state.weekStart) return;
    state.weekDate = shiftDay(state.weekStart, -7);
    loadWeek();
  });
  $('fa-week-next').addEventListener('click', () => {
    if (!state.weekStart) return;
    const next = shiftDay(state.weekStart, 7);
    state.weekDate = next > state.today ? state.today : next;
    loadWeek();
  });

  // ── Строка разделов: подсветка раздела, который сейчас на экране ──────
  const sectionLinks = [...document.querySelectorAll('.fa-sections a')];
  if (typeof IntersectionObserver === 'function') {
    const seen = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => seen.set(entry.target.id, entry.isIntersecting));
      const first = sectionLinks.find(link => seen.get(link.hash.slice(1)));
      if (!first) return;
      sectionLinks.forEach(link => {
        if (link === first) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
      });
    }, {rootMargin: '-120px 0px -55% 0px'});
    sectionLinks.forEach(link => { const target = $(link.hash.slice(1)); if (target) observer.observe(target); });
  }

  // ── Фильтр одной строкой; «Изменить» открывает ту же форму ────────────
  const GRANULARITY = {day: 'по дням', week: 'по неделям', month: 'по месяцам'};
  function filterSummary() {
    const start = $('start').value, end = $('end').value;
    setText('fa-filter-range', dm(start) + ' – ' + dm(end));
    const directions = [...document.querySelectorAll('input[name=direction]')];
    const checked = directions.filter(input => input.checked);
    const scope = checked.length === directions.length ? 'все направления'
      : checked.map(input => input.parentElement.textContent.trim()).join(', ') || 'направления не выбраны';
    setText('fa-filter-rest', '· ' + scope + ' · ' + GRANULARITY[$('granularity').value]);
  }
  $('fa-filter-open').addEventListener('click', () => {
    const open = !$('filters').classList.contains('fa-open');
    $('filters').classList.toggle('fa-open', open);
    $('fa-filter-open').setAttribute('aria-expanded', String(open));
  });
  $('filters').addEventListener('change', filterSummary);
  // Даты фильтра ставит founder.js без событий: сводку обновляем, когда меняется строка состояния.
  new MutationObserver(filterSummary).observe($('updated'), {childList: true, characterData: true, subtree: true});
  // Нажали «Показать» — форма сворачивается обратно в строку.
  $('filters').addEventListener('submit', () => {
    $('filters').classList.remove('fa-open');
    $('fa-filter-open').setAttribute('aria-expanded', 'false');
  });

  // ── Рассылка: форма и журнал — во весь экран ──────────────────────────
  const broadcast = document.querySelector('.broadcast-panel');
  function openBroadcast(mode) {
    broadcast.classList.remove('fa-writing', 'fa-journal');
    if (mode) broadcast.classList.add(mode);
    document.body.classList.toggle('fa-sheet-open', Boolean(mode));
    if (mode) broadcast.scrollTop = 0;
  }
  $('fa-broadcast-write').addEventListener('click', () => openBroadcast('fa-writing'));
  $('fa-broadcast-journal').addEventListener('click', () => openBroadcast('fa-journal'));
  $('fa-broadcast-close').addEventListener('click', () => openBroadcast(null));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('fa-sheet-open')) openBroadcast(null); });

  // ── «Выручка и брони по периодам» свёрнуто в строку ───────────────────
  $('fa-series-toggle').addEventListener('click', () => {
    const panel = document.querySelector('.series-table-panel');
    const open = !panel.classList.contains('fa-open');
    panel.classList.toggle('fa-open', open);
    $('fa-series-toggle').setAttribute('aria-expanded', String(open));
  });

  startWeek();
  phone.addEventListener('change', startWeek);
})();
