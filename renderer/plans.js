'use strict';

/** 长期计划：进度、里程碑提示、计划编辑器。 */
(function () {
  const MILESTONES = [20, 50, 75, 80, 90, 100];
  const POEMS = [
    { line: '长风破浪会有时，直挂云帆济沧海。', from: '李白' },
    { line: '路漫漫其修远兮，吾将上下而求索。', from: '屈原' },
    { line: '千淘万漉虽辛苦，吹尽狂沙始到金。', from: '刘禹锡' },
    { line: '会当凌绝顶，一览众山小。', from: '杜甫' },
    { line: '天行健，君子以自强不息。', from: '《周易》' },
    { line: '不积跬步，无以至千里。', from: '荀子' },
    { line: '山重水复疑无路，柳暗花明又一村。', from: '陆游' },
    { line: '纸上得来终觉浅，绝知此事要躬行。', from: '陆游' },
    { line: '大鹏一日同风起，扶摇直上九万里。', from: '李白' },
    { line: '咬定青山不放松，立根原在破岩中。', from: '郑燮' },
    { line: '行百里者半九十。', from: '《战国策》' },
    { line: '莫愁前路无知己，天下谁人不识君。', from: '高适' },
    { line: '宝剑锋从磨砺出，梅花香自苦寒来。', from: '《警世贤文》' },
    { line: '有志者事竟成，破釜沉舟，百二秦关终属楚。', from: '蒲松龄' },
  ];

  const pad = (value) => String(value).padStart(2, '0');
  const ymd = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseYmd = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year || 1970, (month || 1) - 1, day || 1);
  };
  const startOfDay = (date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  };
  const daysBetween = (from, to) =>
    Math.round((startOfDay(to) - startOfDay(from)) / 86400000);

  let deps = null;
  let editingId = null;
  let editorPrev = null;

  function classify(plan) {
    const start = parseYmd(plan.start);
    const end = parseYmd(plan.end);
    const span = Math.max(1, daysBetween(start, end) + 1);
    const crossYear = start.getFullYear() !== end.getFullYear();
    const crossMonth = crossYear || start.getMonth() !== end.getMonth();
    let key;
    if (crossYear || span > 120) key = 'long';
    else if (crossMonth || span > 21) key = 'medium';
    else key = 'short';
    const labels = {
      short: { name: '短期计划', meta: '跨周' },
      medium: { name: '中期计划', meta: '跨月' },
      long: { name: '长期计划', meta: '跨年' },
    };
    return { key, span, ...labels[key] };
  }

  function active(plans) {
    const today = ymd(startOfDay(new Date()));
    return plans
      .filter((plan) => plan.end >= today && Number(plan.progress) < 100)
      .sort((a, b) => a.end.localeCompare(b.end));
  }

  function visible(plan, state) {
    return state.calendars.find((calendar) => calendar.id === plan.calendarId)?.visible !== false;
  }

  function colorFor(plan, state) {
    return (
      state.calendars.find((calendar) => calendar.id === plan.calendarId)?.color || '#0A84FF'
    );
  }

  function planOnDay(plan, day) {
    const key = ymd(day);
    return plan.start <= key && plan.end >= key;
  }

  function randomPoem() {
    return POEMS[Math.floor(Math.random() * POEMS.length)];
  }

  function milestoneToast(plan, from, to) {
    const crossed = MILESTONES.filter((value) => value > from && value <= to);
    if (crossed.length === 0) return;
    const milestone = crossed[crossed.length - 1];
    const poem = randomPoem();
    deps.showToast(`「${poem.line}」 计划《${plan.title}》 ${milestone}%`, 5200);
  }

  function segmentHTML(plan, state, options = {}) {
    const color = colorFor(plan, state);
    const meta = classify(plan);
    const progress = Math.min(100, Math.max(0, Number(plan.progress) || 0));
    const classes = [
      'plan-chip',
      `plan-${meta.key}`,
      options.start ? 'is-start' : '',
      options.end ? 'is-end' : '',
      options.showTitle ? 'has-title' : '',
      progress >= 100 ? 'is-complete' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const start = parseYmd(plan.start);
    const end = parseYmd(plan.end);
    const tip = `${plan.title} · ${meta.name} · ${start.getMonth() + 1}月${start.getDate()}日 – ${
      end.getMonth() + 1
    }月${end.getDate()}日 · 进度 ${progress}%`;
    return `<button type="button" class="${classes}" data-plan-id="${plan.id}"
      style="--plan-color:${color};${options.style || ''}" title="${escapeAttr(tip)}">
      <span class="plan-progress" style="width:${progress}%"></span>
      ${options.showTitle ? `<span class="plan-label">${escapeHtml(plan.title)}</span>` : '<span class="plan-label plan-label-empty"></span>'}
      ${options.showTitle && options.wide ? `<span class="plan-percent">${progress}%</span>` : ''}
    </button>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => {
      switch (character) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function openEditor(planId, defaults = {}) {
    if (!deps) return;
    const state = deps.getState();
    const plan = planId ? state.plans.find((item) => item.id === planId) : null;
    editingId = plan ? plan.id : null;
    editorPrev = null;

    const overlay = document.getElementById('plan-overlay');
    const title = document.getElementById('plan-dialog-title');
    const startInput = document.getElementById('plan-start');
    const endInput = document.getElementById('plan-end');
    const calendarSelect = document.getElementById('plan-calendar');
    const progress = document.getElementById('plan-progress');
    const notes = document.getElementById('plan-notes');
    const progressLabel = document.getElementById('plan-progress-value');
    const typeLabel = document.getElementById('plan-type');
    const deleteBtn = document.getElementById('plan-delete');

    title.textContent = plan ? '编辑计划' : '新建计划';
    calendarSelect.innerHTML = state.calendars
      .map((calendar) => `<option value="${escapeAttr(calendar.id)}">${escapeHtml(calendar.name)}</option>`)
      .join('');

    const today = startOfDay(new Date());
    const start = plan ? plan.start : defaults.start || ymd(today);
    const end = plan ? plan.end : defaults.end || ymd(new Date(today.getTime() + 29 * 86400000));
    const selectedCalendar =
      plan?.calendarId || defaults.calendarId || state.settings.defaultCalendarId || state.calendars[0]?.id;

    document.getElementById('plan-title').value = plan?.title || '';
    startInput.value = start;
    endInput.value = end;
    calendarSelect.value = selectedCalendar;
    const selected = state.calendars.find((item) => item.id === selectedCalendar);
    document.getElementById('plan-calendar-dot').style.background =
      selected?.color || '#8E8E93';
    progress.value = String(plan?.progress ?? 0);
    progress.style.setProperty('--value', `${progress.value}%`);
    notes.value = plan?.notes || '';
    progressLabel.textContent = `${progress.value}%`;
    editorPrev = Number(progress.value);
    deleteBtn.classList.toggle('hidden', !plan);
    updateTypeLabel();

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      const input = document.getElementById('plan-title');
      input.focus();
      if (!plan) input.select();
    });
  }

  function closeEditor() {
    document.getElementById('plan-overlay').classList.add('hidden');
    editingId = null;
    editorPrev = null;
  }

  function updateTypeLabel() {
    const start = document.getElementById('plan-start').value;
    const end = document.getElementById('plan-end').value;
    const label = document.getElementById('plan-type');
    if (!start || !end || end < start) {
      label.textContent = '请选择有效的时间范围';
      label.dataset.kind = '';
      return;
    }
    const meta = classify({ start, end });
    label.textContent = `${meta.name} · ${meta.meta} · 共 ${meta.span} 天`;
    label.dataset.kind = meta.key;
  }

  function saveEditor() {
    const state = deps.getState();
    const title = document.getElementById('plan-title').value.trim();
    const start = document.getElementById('plan-start').value;
    const end = document.getElementById('plan-end').value;
    const calendarId = document.getElementById('plan-calendar').value;
    const progress = Number(document.getElementById('plan-progress').value);
    const notes = document.getElementById('plan-notes').value.trim();

    if (!title) {
      deps.showToast('给计划起个名字吧');
      document.getElementById('plan-title').focus();
      return;
    }
    if (!start || !end || end < start) {
      deps.showToast('结束日期不能早于开始日期');
      return;
    }

    let plan;
    let beforeProgress = 0;
    if (editingId) {
      plan = state.plans.find((item) => item.id === editingId);
      if (!plan) return closeEditor();
      beforeProgress = Number(plan.progress) || 0;
      Object.assign(plan, { title, start, end, calendarId, progress, notes });
    } else {
      plan = {
        id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        start,
        end,
        calendarId,
        progress,
        notes,
      };
      state.plans.push(plan);
    }

    state.settings.defaultCalendarId = calendarId;
    deps.saveState();
    deps.render();
    closeEditor();
    deps.showToast(`计划《${plan.title}》已保存`);
    if (progress > beforeProgress) milestoneToast(plan, beforeProgress, progress);
  }

  function deletePlan() {
    if (!editingId) return;
    const state = deps.getState();
    const plan = state.plans.find((item) => item.id === editingId);
    if (!plan) return closeEditor();
    deps.openConfirm({
      title: '删除计划？',
      text: `计划《${plan.title}》及其进度记录将被删除，此操作无法撤销。`,
      okLabel: '删除',
      onConfirm: () => {
        state.plans = state.plans.filter((item) => item.id !== plan.id);
        deps.saveState();
        deps.render();
        closeEditor();
        deps.showToast('已删除计划');
      },
    });
  }

  function init(dependencies) {
    deps = dependencies;
    document.getElementById('plan-save').addEventListener('click', saveEditor);
    document.getElementById('plan-cancel').addEventListener('click', closeEditor);
    document.getElementById('plan-delete').addEventListener('click', deletePlan);
    document.getElementById('plan-progress').addEventListener('input', (event) => {
      document.getElementById('plan-progress-value').textContent = `${event.target.value}%`;
      event.target.style.setProperty('--value', `${event.target.value}%`);
    });
    for (const id of ['plan-start', 'plan-end']) {
      document.getElementById(id).addEventListener('change', updateTypeLabel);
    }
    document.getElementById('plan-overlay').addEventListener('mousedown', (event) => {
      if (event.target.id === 'plan-overlay') closeEditor();
    });
    document.addEventListener('keydown', (event) => {
      if (document.getElementById('plan-overlay').classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveEditor();
      }
    });
  }

  function isOpen() {
    return !document.getElementById('plan-overlay').classList.contains('hidden');
  }

  function dailyReminder() {
    if (!deps) return;
    const state = deps.getState();
    if (!state.settings.plans?.reminders) return;
    const today = startOfDay(new Date());
    const soon = active(state.plans)
      .filter((plan) => {
        const end = parseYmd(plan.end);
        const days = daysBetween(today, end);
        return days >= 0 && days <= 7;
      })
      .filter((plan) => visible(plan, state))
      .sort((a, b) => a.end.localeCompare(b.end))[0];
    if (!soon) return;
    const days = daysBetween(today, parseYmd(soon.end));
    const poem = randomPoem();
    deps.showToast(
      `计划《${soon.title}》${days === 0 ? '今天截止' : `还有 ${days} 天`} · 当前 ${soon.progress}% · 「${poem.line}」`,
      6200
    );
  }

  window.Plans = {
    MILESTONES,
    POEMS,
    classify,
    active,
    visible,
    colorFor,
    planOnDay,
    segmentHTML,
    openEditor,
    closeEditor,
    isOpen,
    init,
    dailyReminder,
    randomPoem,
  };
})();
