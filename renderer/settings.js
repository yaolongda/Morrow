'use strict';

/** 设置中心：通用、工作时间、外观、显示、计划、关于。 */
(function () {
  const HOME_URL = 'https://github.com/yaolongda/Morrow';
  const RELEASES_URL = 'https://github.com/yaolongda/Morrow/releases';
  let deps = null;
  let current = 'general';
  let overrideMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let info = null;
  let planFilter = 'active';
  let batchStart = '';
  let batchEnd = '';
  let capturingShortcut = '';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
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
  const startOfWeek = (date, weekStart) => {
    const result = startOfDay(date);
    const start = [0, 1, 6].includes(Number(weekStart)) ? Number(weekStart) : 1;
    result.setDate(result.getDate() - ((result.getDay() - start + 7) % 7));
    return result;
  };
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  const addMonths = (date, months) => {
    const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
    return result;
  };

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

  function ensureDefaults(state) {
    if (!state.settings.plans) state.settings.plans = { reminders: true };
    if (!state.settings.display) {
      state.settings.display = {
        lunar: true,
        solarTerms: true,
        almanac: false,
        zodiac: false,
        weekNumbers: false,
      };
    }
    if (!state.settings.workHours) state.settings.workHours = Workday.defaults();
    if (!state.settings.widgets) {
      state.settings.widgets = { smartSort: true, breathing: true, suggestions: true };
    }
    return state;
  }

  function open(section = 'general') {
    current = section;
    if (section === 'plans') planFilter = 'active';
    const overlay = $('#settings-overlay');
    overlay.classList.remove('hidden');
    $$('.settings-nav button').forEach((button) => {
      button.classList.toggle('active', button.dataset.section === current);
    });
    render();
    if (!info) {
      deps.getAppInfo().then((value) => {
        info = value;
        if (current === 'about') render();
        const version = $('#settings-version');
        if (version) version.textContent = `v${value.version}`;
      });
    }
  }

  function close() {
    $('#settings-overlay').classList.add('hidden');
  }

  function isOpen() {
    return !$('#settings-overlay').classList.contains('hidden');
  }

  function render(preserveScroll = false) {
    const state = ensureDefaults(deps.getState());
    const titles = {
      general: '通用',
      schedule: '工作时间',
      appearance: '外观',
      display: '显示',
      plans: '计划',
      trash: '回收站',
      about: '关于',
    };
    $('#settings-title').textContent = titles[current] || '设置';
    $$('.settings-nav button').forEach((button) => {
      button.classList.toggle('active', button.dataset.section === current);
    });
    const content = $('#settings-content');
    const scrollTop = content.scrollTop;
    if (current === 'general') content.innerHTML = generalHTML(state);
    else if (current === 'schedule') content.innerHTML = scheduleHTML(state);
    else if (current === 'appearance') content.innerHTML = appearanceHTML(state);
    else if (current === 'display') content.innerHTML = displayHTML(state);
    else if (current === 'plans') content.innerHTML = plansHTML(state);
    else if (current === 'trash') content.innerHTML = trashHTML(state);
    else content.innerHTML = aboutHTML(state);
    content.scrollTop = preserveScroll ? scrollTop : 0;
  }

  function row(label, control, hint = '') {
    return `<div class="set-row">
      <div class="set-row-text"><span class="set-label">${label}</span>${
        hint ? `<span class="set-hint">${hint}</span>` : ''
      }</div>
      <div class="set-control">${control}</div>
    </div>`;
  }

  function toggle(path, checked) {
    return `<label class="set-switch"><input type="checkbox" data-path="${path}" ${
      checked ? 'checked' : ''
    }><span class="set-switch-track"></span></label>`;
  }

  function segmented(options, active, attribute) {
    return `<div class="set-segmented">${options
      .map(
        (option) =>
          `<button type="button" ${attribute}="${option.value}" class="${
            option.value === active ? 'active' : ''
          }">${option.label}</button>`
      )
      .join('')}</div>`;
  }

  function generalHTML(state) {
    const weekOptions = [
      { value: 1, label: '周一' },
      { value: 0, label: '周日' },
      { value: 6, label: '周六' },
    ];
    return `
      <div class="set-group">
        <div class="set-group-title">日历</div>
        ${row(
          '每周起始日',
          segmented(weekOptions, Number(state.settings.weekStart), 'data-weekstart'),
          '影响月历、年历与小组件的列顺序'
        )}
        ${row('显示侧边栏', toggle('sidebarVisible', state.settings.sidebarVisible !== false))}
      </div>
      <div class="set-group">
        <div class="set-group-title">数据</div>
        ${row(
          '配置备份',
          `<div class="set-button-row"><button class="set-btn" data-action="export">导出配置…</button><button class="set-btn" data-action="import">导入配置…</button></div>`,
          '包含全部日历、日程、计划、设置与小组件布局'
        )}
        ${row(
          '数据文件夹',
          '<button class="set-btn" data-action="open-data">打开文件夹</button>',
          '所有数据仅保存在本机'
        )}
      </div>
      <div class="set-group">
        <div class="set-group-title">自定义快捷键</div>
        ${[
          ['today', '回到今天'],
          ['day', '日视图'],
          ['week', '周视图'],
          ['month', '月视图'],
          ['year', '年视图'],
          ['newPlan', '新建计划'],
          ['prev', '上一个时间范围'],
          ['next', '下一个时间范围'],
        ]
          .map(([action, label]) =>
            row(
              label,
              `<button type="button" class="shortcut-key" data-shortcut="${action}">${escapeHtml(
                state.settings.shortcuts?.[action] || ''
              )}</button>`,
              '点击后按下新按键'
            )
          )
          .join('')}
        <p class="set-hint">Ctrl+N / Ctrl+F / Ctrl+, / Ctrl+Z 等组合键保持不变；按键冲突时以后设置的为准。</p>
      </div>`;
  }

  function workHoursHTML(state) {
    const workHours = Workday.normalize(state.settings.workHours);
    const schedule = Schedule.normalize(state.settings.schedule);
    const templates = Array.isArray(state.settings.shiftTemplates)
      ? state.settings.shiftTemplates
      : [];
    const field = (path, value, label) =>
      `<label class="work-time-field"><span>${label}</span><input type="time" class="set-time" data-worktime="${path}" value="${value}"></label>`;

    let fields = '';
    if (workHours.mode === 'split') {
      fields = `<div class="work-time-grid">
        ${field('morning.start', workHours.morning.start, '上午上班')}
        ${field('morning.end', workHours.morning.end, '午休开始')}
        ${field('afternoon.start', workHours.afternoon.start, '下午上班')}
        ${field('afternoon.end', workHours.afternoon.end, '下班')}
      </div>
      <p class="set-hint">午休时会有一个轻量庆祝，真正下班时的庆祝会更完整。</p>`;
    } else if (workHours.mode === 'full') {
      fields = `<div class="work-time-grid">
        ${field('full.start', workHours.full.start, '上班')}
        ${field('full.end', workHours.full.end, '下班')}
      </div>
      <p class="set-hint">中午不单独下班，只在一天结束时庆祝。</p>`;
    } else {
      fields = `<div class="work-time-grid">
        ${field('night.start', workHours.night.start, '夜班开始')}
        ${field('night.end', workHours.night.end, '夜班结束')}
      </div>
      <p class="set-hint">结束时间早于开始时间时，按跨午夜处理。</p>`;
    }

    return `
      <div class="set-group">
        <div class="set-group-title">上下班时间</div>
        <div class="set-row">
          <div class="set-row-label"><strong>班次</strong><span>决定倒计时和下班的庆祝时刻</span></div>
          <div class="set-control">${segmented(
            [
              { value: 'split', label: '上午 + 下午' },
              { value: 'full', label: '全天' },
              { value: 'night', label: '夜班' },
            ],
            workHours.mode,
            'data-workmode'
          )}</div>
        </div>
        ${fields}
        <div class="set-row">
          <div class="set-row-label"><strong>启用上下班提醒</strong><span>今天小组件会显示上班倒计时</span></div>
          <div class="set-control">${toggle('workHours.enabled', workHours.enabled)}</div>
        </div>
        <div class="set-row">
          <div class="set-row-label"><strong>午间小庆祝</strong><span>午休时轻轻提醒一句</span></div>
          <div class="set-control">${toggle('workHours.lunch', workHours.lunch)}</div>
        </div>
        <div class="set-row">
          <div class="set-row-label"><strong>下班庆祝</strong><span>下班时播放动画，并送一句诗</span></div>
          <div class="set-control">${toggle('workHours.off', workHours.off)}</div>
        </div>
        <div class="set-row">
          <div class="set-row-label"><strong>播放粒子动画</strong><span>关掉后仍保留庆祝文字与诗句</span></div>
          <div class="set-control">${toggle('workHours.animation', workHours.animation)}</div>
        </div>
      </div>
      <div class="set-group">
        <div class="set-group-title">班次模板</div>
        <div class="set-row">
          <div class="set-row-label"><strong>应用模板</strong><span>一键切换常用班次</span></div>
          <div class="set-control shift-template-control">
            <select class="set-select" id="shift-template-select">
              <option value="">选择模板…</option>
              ${templates
                .map(
                  (template) =>
                    `<option value="${escapeHtml(template.id)}">${escapeHtml(
                      template.name
                    )}</option>`
                )
                .join('')}
            </select>
            <button type="button" class="mini-btn" data-shift-apply>应用</button>
            <button type="button" class="mini-btn" data-shift-delete>删除</button>
          </div>
        </div>
        <div class="set-row">
          <div class="set-row-label"><strong>保存当前设置</strong><span>把当前班次与时间存成模板</span></div>
          <div class="set-control shift-template-save">
            <input id="shift-template-name" maxlength="20" placeholder="例如：A 班">
            <button type="button" class="mini-btn" data-shift-save>保存模板</button>
          </div>
        </div>
        ${
          templates.length
            ? ''
            : '<p class="set-hint">还没有模板。调整好班次后，给它起个名字保存，下次就能一键切换。</p>'
        }
      </div>
      <div class="set-group">
        <div class="set-group-title">法定节假日</div>
        <div class="set-row">
          <div class="set-row-label"><strong>同步中国法定节假日</strong><span>放假自动休息，调休补班日自动上班</span></div>
          <div class="set-control">${toggle('schedule.followHolidays', schedule.followHolidays)}</div>
        </div>
        <div class="set-row">
          <div class="set-row-label"><strong>扩展节假日数据</strong><span>导入社区维护的 JSON，不必等新版本</span></div>
          <div class="set-control shift-template-control">
            <button type="button" class="mini-btn" data-action="import-holidays">导入 JSON…</button>
            <button type="button" class="mini-btn" data-action="reset-holidays">恢复内置</button>
          </div>
        </div>
        <p class="set-hint">内置 2024–2026 年放假与调休安排；已导入自定义 ${
          Object.keys(state.settings.holidayData || {}).length
        } 条。下方「特殊日期」优先级更高：把某天点成「补班」，就是加班不放假。</p>
      </div>`;
  }

  function scheduleHTML(state) {
    const schedule = Schedule.normalize(state.settings.schedule);
    const weekStart = [0, 1, 6].includes(Number(state.settings.weekStart))
      ? Number(state.settings.weekStart)
      : 1;
    const needsAnchor = ['bigSmall', 'threeOne', 'satHalfBigSmall'].includes(schedule.preset);
    const anchor =
      schedule.alternate?.anchor || schedule.cycle?.anchor || ymd(startOfDay(new Date()));
    const anchorLabel =
      schedule.preset === 'threeOne'
        ? '循环起始日'
        : '大周起始周';
    const anchorHint =
      schedule.preset === 'threeOne'
        ? '从这一天开始，按「上 3 休 1」循环'
        : '以这一天所在的周作为大周（双休）';
    const stats = Schedule.monthStats(
      schedule,
      overrideMonth.getFullYear(),
      overrideMonth.getMonth(),
      weekStart
    );

    const presetButtons = Schedule.PRESETS.map(
      (preset) => `<button type="button" class="preset-card ${
        preset.id === schedule.preset ? 'active' : ''
      }" data-preset="${preset.id}">
        <strong>${preset.name}</strong>
        <span>${preset.description}</span>
      </button>`
    ).join('');

    const customGrid =
      schedule.preset === 'custom'
        ? `<div class="set-group">
            <div class="set-group-title">自定义每一周</div>
            <div class="weekday-config">
              ${[0, 1, 2, 3, 4, 5, 6]
                .map((day) => {
                  const type = schedule.restWeekdays.includes(day)
                    ? 'rest'
                    : schedule.halfWeekdays.includes(day)
                      ? 'half'
                      : 'work';
                  return `<button type="button" class="weekday-toggle ${type}" data-weekday="${day}">
                    <span>${Schedule.WEEKDAY_LABELS[day]}</span>
                    <em>${type === 'rest' ? '休息' : type === 'half' ? '半天' : '工作'}</em>
                  </button>`;
                })
                .join('')}
            </div>
            <p class="set-hint">点击切换：工作 → 半天 → 休息。</p>
          </div>`
        : '';

    return `
      <div class="set-group">
        <div class="set-group-title">休息规则</div>
        <div class="preset-grid">${presetButtons}</div>
        ${
          needsAnchor
            ? `<div class="anchor-row">
                <span>${anchorLabel}</span>
                <input type="date" id="schedule-anchor" value="${anchor}">
                <span class="set-hint">${anchorHint}</span>
              </div>`
            : ''
        }
        <div class="schedule-summary">
          <span class="schedule-rule">${Schedule.describe(schedule, weekStart)}</span>
          <span class="schedule-stats">${overrideMonth.getFullYear()} 年 ${
            overrideMonth.getMonth() + 1
          } 月 · 工作 ${stats.work} 天 · 休息 ${stats.rest} 天${
            stats.half ? ` · 半天 ${stats.half} 天` : ''
          }</span>
        </div>
        ${
          schedule.preset === 'monthlyFive'
            ? '<p class="set-hint">先以周日为固定休息，再在下方日历中把另外 4 天点成「休息」，即可组成月休五天。</p>'
            : ''
        }
      </div>
      ${customGrid}
      ${workHoursHTML(state)}
      <div class="set-group">
        <div class="set-group-title">特殊日期</div>
        <div class="batch-override">
          <input type="date" id="batch-start" value="${
            batchStart || ymd(startOfDay(new Date()))
          }" aria-label="批量开始日期">
          <span>至</span>
          <input type="date" id="batch-end" value="${
            batchEnd || batchStart || ymd(startOfDay(new Date()))
          }" aria-label="批量结束日期">
          <div class="batch-override-actions">
            <button type="button" data-batch-override="work">补班</button>
            <button type="button" data-batch-override="rest">休息</button>
            <button type="button" data-batch-override="half">半天</button>
            <button type="button" data-batch-override="clear">清除</button>
          </div>
        </div>
        <div class="override-head">
          <button class="mini-arrow" data-override-nav="-1" aria-label="上个月">‹</button>
          <strong>${overrideMonth.getFullYear()} 年 ${overrideMonth.getMonth() + 1} 月</strong>
          <button class="mini-arrow" data-override-nav="1" aria-label="下个月">›</button>
        </div>
        <div class="override-weekdays">${Array.from({ length: 7 }, (_, index) => {
          const day = (weekStart + index) % 7;
          return `<span>${Schedule.WEEKDAY_LABELS[day].replace('周', '')}</span>`;
        }).join('')}</div>
        <div class="override-grid">${overrideCalendarHTML(state, schedule, weekStart)}</div>
        <div class="override-legend">
          <span><i class="dot rest"></i>休息</span>
          <span><i class="dot half"></i>半天</span>
          <span><i class="dot work"></i>补班</span>
          <span class="set-hint">点击日期切换；带圆点表示自定义覆盖</span>
        </div>
      </div>`;
  }

  function overrideCalendarHTML(state, schedule, weekStart) {
    const first = new Date(overrideMonth.getFullYear(), overrideMonth.getMonth(), 1);
    const gridStart = startOfWeek(first, weekStart);
    const today = ymd(startOfDay(new Date()));
    const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    return cells
      .map((date) => {
        const key = ymd(date);
        const outside = date.getMonth() !== overrideMonth.getMonth();
        const type = Schedule.dayType(schedule, date, weekStart);
        const overridden = Boolean(schedule.overrides[key]);
        const holiday = Holidays.info(key);
        const typeText = type === 'rest' ? '休息' : type === 'half' ? '半天' : '工作';
        const holidayClass =
          holiday?.type === 'holiday'
            ? 'is-holiday'
            : holiday?.type === 'workday'
              ? 'is-makeup'
              : '';
        return `<button type="button" class="override-day ${type} ${
          outside ? 'outside' : ''
        } ${overridden ? 'overridden' : ''} ${holidayClass} ${
          key === today ? 'today' : ''
        }"
          data-override-date="${key}" title="${date.getMonth() + 1}月${date.getDate()}日 · ${
            holiday ? `${holiday.name} · ` : ''
          }${typeText}">
          <span>${date.getDate()}</span>
          ${overridden ? '<i></i>' : ''}
        </button>`;
      })
      .join('');
  }

  function appearanceHTML(state) {
    const appearance = state.settings.appearance;
    const background = appearance.background;
    return `
      <div class="set-group">
        <div class="set-group-title">主题</div>
        <div class="theme-grid">
          ${Object.entries(Appearance.THEMES)
            .map(
              ([key, theme]) => `<button type="button" class="theme-card ${
                appearance.theme === key ? 'active' : ''
              }" data-theme="${key}">
                <span class="theme-preview theme-${key}"></span>
                <strong>${theme.name}</strong>
              </button>`
            )
            .join('')}
        </div>
        ${row(
          '强调色',
          `<div class="accent-row">
            ${Appearance.ACCENTS.map(
              (color) =>
                `<button type="button" class="accent-dot ${
                  appearance.accent.toLowerCase() === color.toLowerCase() ? 'active' : ''
                }" data-accent="${color}" style="--color:${color}" aria-label="${color}"></button>`
            ).join('')}
            <label class="accent-custom"><input type="color" id="accent-custom" value="${
              appearance.accent
            }"></label>
          </div>`,
          '用于今天高亮、按钮与小组件强调色'
        )}
      </div>
      <div class="set-group">
        <div class="set-group-title">字体与材质</div>
        ${row(
          '字体',
          `<select class="set-select" data-path="appearance.font">${Object.entries(Appearance.FONTS)
            .map(
              ([key, font]) =>
                `<option value="${key}" ${
                  appearance.font === key ? 'selected' : ''
                }>${font.name}</option>`
            )
            .join('')}</select>`
        )}
        ${row(
          '窗口材质',
          `<select class="set-select" data-path="appearance.material">
            <option value="none" ${appearance.material === 'none' ? 'selected' : ''}>标准白底</option>
            <option value="mica" ${appearance.material === 'mica' ? 'selected' : ''}>Mica（云母）</option>
            <option value="acrylic" ${appearance.material === 'acrylic' ? 'selected' : ''}>亚克力（Acrylic）</option>
          </select>`,
          'Windows 11 的 Mica / 亚克力需要重启窗口后效果更稳定'
        )}
        ${row(
          '面板不透明度',
          `<div class="range-row"><input type="range" data-appearance="panelOpacity" min="60" max="100" step="1" value="${Math.round(
            (appearance.panelOpacity ?? 0.92) * 100
          )}"><span class="range-value">${Math.round((appearance.panelOpacity ?? 0.92) * 100)}%</span></div>`
        )}
        ${row(
          '毛玻璃模糊',
          `<div class="range-row"><input type="range" data-appearance="glass" min="0" max="30" step="1" value="${
            appearance.glass ?? 8
          }"><span class="range-value">${appearance.glass ?? 8}px</span></div>`,
          '工具栏、侧边栏和弹窗的背景模糊'
        )}
      </div>
      <div class="set-group">
        <div class="set-group-title">背景图片</div>
        <div class="background-row">
          <div class="background-preview ${
            background?.dataUrl ? 'has-image' : ''
          }" style="${
            background?.dataUrl ? `background-image:url(&quot;${background.dataUrl}&quot;)` : ''
          }">${background?.dataUrl ? '' : '未选择图片'}</div>
          <div class="background-actions">
            <button class="set-btn" data-action="pick-background">选择图片…</button>
            ${
              background?.dataUrl
                ? '<button class="set-btn" data-action="clear-background">移除</button>'
                : ''
            }
            <span class="set-hint">会压缩后保存在本机配置中</span>
          </div>
        </div>
        <input type="file" id="background-file" accept="image/*" hidden>
        ${
          background?.dataUrl
            ? `
          ${row('图片不透明度', `<div class="range-row"><input type="range" data-background="opacity" min="5" max="100" step="1" value="${Math.round(
            (background.opacity ?? 0.45) * 100
          )}"><span class="range-value">${Math.round(
            (background.opacity ?? 0.45) * 100
          )}%</span></div>`)}
          ${row('图片模糊', `<div class="range-row"><input type="range" data-background="blur" min="0" max="30" step="1" value="${
            background.blur ?? 0
          }"><span class="range-value">${background.blur ?? 0}px</span></div>`)}
          ${row('图片暗化', `<div class="range-row"><input type="range" data-background="dim" min="0" max="70" step="1" value="${Math.round(
            (background.dim ?? 0.2) * 100
          )}"><span class="range-value">${Math.round(
            (background.dim ?? 0.2) * 100
          )}%</span></div>`)}`
            : ''
        }
      </div>
      <div class="set-actions"><button class="set-btn" data-action="reset-appearance">恢复默认外观</button></div>`;
  }

  function displayHTML(state) {
    const display = state.settings.display;
    const plans = state.settings.plans;
    const brief = Almanac.briefOf(new Date());
    const today = new Date();
    const term = Almanac.termOf(today);
    const nextTerm = (() => {
      const key = ymd(today);
      let list = Almanac.termsForYear(today.getFullYear());
      let next = list.find((item) => item.date >= key);
      if (!next) next = Almanac.termsForYear(today.getFullYear() + 1)[0];
      return next;
    })();
    return `
      <div class="set-group">
        <div class="set-group-title">今日信息</div>
        ${row('显示农历日期', toggle('display.lunar', display.lunar), '月视图、周/日标题与小组件')}
        ${row('显示二十四节气', toggle('display.solarTerms', display.solarTerms), '节气当天以强调色显示')}
        ${row('显示黄历宜忌', toggle('display.almanac', display.almanac), '建除十二神与宜忌，仅作文化参考')}
        ${row('显示星座运势', toggle('display.zodiac', display.zodiac), '本地生成，仅供娱乐')}
        ${row('显示 ISO 周数', toggle('display.weekNumbers', display.weekNumbers === true), '月视图左侧与周视图标题显示周数')}
      </div>
      <div class="set-group">
        <div class="set-group-title">小组件</div>
        ${row(
          '即将到来智能排序',
          toggle('widgets.smartSort', state.settings.widgets?.smartSort !== false),
          '按准备、冲突、计划节点与临近程度排序；关闭后按时间'
        )}
        ${row(
          '临近下班呼吸动画',
          toggle('widgets.breathing', state.settings.widgets?.breathing !== false),
          '只在距离下班 1 小时内出现，可随时关闭'
        )}
        ${row(
          '节奏与摸鱼建议',
          toggle('widgets.suggestions', state.settings.widgets?.suggestions !== false),
          '只在组件里陈述，不会修改你的任何设置'
        )}
      </div>
      <div class="set-group">
        <div class="set-group-title">计划</div>
        ${row('在月视图显示计划', toggle('plans.showInMonth', plans.showInMonth !== false))}
        ${row('在周/日视图显示计划', toggle('plans.showInWeek', plans.showInWeek !== false))}
        ${row('计划进度提醒', toggle('plans.reminders', plans.reminders !== false), '临近截止时用一句古诗提醒你')}
      </div>
      <div class="set-group">
        <div class="set-group-title">今日预览</div>
        <div class="brief-preview">
          <div class="brief-preview-date">${today.getMonth() + 1}月${today.getDate()}日</div>
          ${display.lunar && brief.lunar ? `<div>${brief.lunar.text} · ${brief.lunar.yearGanZhi}年</div>` : ''}
          ${
            display.solarTerms
              ? `<div class="brief-preview-line">${
                  term ? `今日 ${term}` : `下一个节气 ${nextTerm.name} · ${nextTerm.date.slice(5).replace('-', '/')}`
                }</div>`
              : ''
          }
          ${
            display.almanac
              ? `<div class="brief-preview-line"><span class="brief-yi">宜</span>${brief.yi
                  .slice(0, 3)
                  .join(' · ')}<span class="brief-ji">忌</span>${brief.ji.slice(0, 3).join(' · ')}</div>`
              : ''
          }
          ${
            display.zodiac
              ? `<div>${brief.zodiac.sign} <span class="stars">${brief.zodiac.stars}</span> · ${brief.zodiac.luckyColor} · 数字 ${brief.zodiac.luckyNumber}</div>`
              : ''
          }
        </div>
      </div>`;
  }

  function plansHTML(state) {
    const active = Plans.active(state.plans).filter((plan) => !plan.archived);
    const done = state.plans
      .filter((plan) => !plan.archived && !active.some((item) => item.id === plan.id))
      .sort((a, b) => b.end.localeCompare(a.end));
    const archived = state.plans
      .filter((plan) => plan.archived)
      .sort((a, b) => b.end.localeCompare(a.end));
    const lists = { active, done, archived };
    const list = lists[planFilter] || active;

    const tab = (id, label, count) =>
      `<button type="button" class="plan-filter-tab ${
        planFilter === id ? 'active' : ''
      }" data-plan-filter="${id}">${label}<em>${count}</em></button>`;

    return `
      <div class="set-group">
        <div class="set-group-title">计划类型</div>
        <div class="plan-type-explain">
          <div><span class="plan-dot short"></span><strong>短期 · 跨周</strong><p>3 周以内，适合迭代、冲刺、短期研发任务。</p></div>
          <div><span class="plan-dot medium"></span><strong>中期 · 跨月</strong><p>3 周至 4 个月，适合项目阶段、季度目标。</p></div>
          <div><span class="plan-dot long"></span><strong>长期 · 跨年</strong><p>超过 4 个月或跨年，适合年度计划与长期项目。</p></div>
        </div>
        <p class="set-hint">计划会以浅色的进度条横跨日历日期；在编辑器中拖动进度，经过 20 / 50 / 75 / 80 / 90 / 100% 时会用一句励志古诗提示。</p>
        <button class="set-btn primary" data-action="new-plan">新建计划…</button>
      </div>
      <div class="set-group">
        <div class="set-group-title">我的计划</div>
        <div class="plan-filter-tabs">
          ${tab('active', '进行中', active.length)}
          ${tab('done', '已完成', done.length)}
          ${tab('archived', '已归档', archived.length)}
        </div>
        ${
          list.length
            ? `<div class="settings-plan-list">${list
                .slice(0, 20)
                .map((plan) => {
                  const meta = Plans.classify(plan);
                  const color = Plans.colorFor(plan, state);
                  const progress = Plans.effectiveProgress(plan);
                  return `<div class="settings-plan-row" data-plan-id="${plan.id}">
                    <span class="settings-plan-dot" style="--color:${color}"></span>
                    <span class="settings-plan-main"><strong>${escapeHtml(plan.title)}</strong><em>${meta.name} · ${plan.start.slice(5).replace('-', '/')} – ${plan.end.slice(5).replace('-', '/')}</em></span>
                    <span class="settings-plan-progress">${progress}%</span>
                    <button type="button" class="plan-archive-btn" data-plan-archive="${plan.id}">${
                      plan.archived ? '恢复' : '归档'
                    }</button>
                    ${
                      plan.repeat && plan.repeat !== 'none'
                        ? `<button type="button" class="plan-archive-btn" data-plan-next="${plan.id}">下一期</button>`
                        : ''
                    }
                  </div>`;
                })
                .join('')}</div>`
            : `<p class="set-hint">${
                planFilter === 'archived'
                  ? '还没有归档的计划。'
                  : planFilter === 'done'
                    ? '还没有完成的计划。'
                    : '还没有进行中的计划。给自己定一个跨周、跨月或跨年的目标吧。'
              }</p>`
        }
      </div>`;
  }

  function trashHTML(state) {
    const entries = state.trash || [];
    const kindLabels = {
      event: '日程',
      plan: '计划',
      occurrence: '单次日程',
      'series-split': '重复日程',
    };
    if (entries.length === 0) {
      return `
        <div class="set-group">
          <div class="set-group-title">回收站</div>
          <p class="trash-empty">回收站是空的。</p>
          <p class="set-hint">删除的日程和计划会在这里保留 30 天，可以随时恢复。</p>
        </div>`;
    }
    return `
      <div class="set-group">
        <div class="set-group-title">回收站 · ${entries.length} 项</div>
        <p class="set-hint">删除的日程和计划会保留 30 天。恢复「单次日程」会把那一天重新加回重复系列。</p>
        <div class="trash-list">
          ${entries
            .map((entry) => {
              const deleted = new Date(entry.deletedAt);
              const dateText = Number.isNaN(deleted.getTime())
                ? ''
                : `${deleted.getMonth() + 1}/${deleted.getDate()} 删除`;
              const title =
                entry.title ||
                entry.item?.title ||
                entry.meta?.occurrenceDate ||
                '未命名';
              return `<div class="trash-row" data-trash-id="${escapeHtml(entry.id)}">
                <span class="trash-kind">${escapeHtml(kindLabels[entry.kind] || '项目')}</span>
                <span class="trash-main">
                  <strong>${escapeHtml(title)}</strong>
                  <em>${escapeHtml(dateText)}${
                    entry.kind === 'occurrence' && entry.meta?.occurrenceDate
                      ? ` · ${escapeHtml(entry.meta.occurrenceDate)}`
                      : ''
                  }</em>
                </span>
                <button type="button" class="trash-action" data-trash-restore>恢复</button>
                <button type="button" class="trash-action danger" data-trash-purge>彻底删除</button>
              </div>`;
            })
            .join('')}
        </div>
        <button type="button" class="trash-empty-btn" data-trash-empty>清空回收站</button>
      </div>`;
  }

  function restoreTrashEntry(id) {
    const state = ensureDefaults(deps.getState());
    const entry = (state.trash || []).find((item) => item.id === id);
    if (!entry) return;
    deps.recordHistory?.('恢复回收站项目');
    if (entry.kind === 'event' || entry.kind === 'plan') {
      if (!entry.item) return;
      if (
        !state.calendars.some((calendar) => calendar.id === entry.item.calendarId) &&
        state.calendars[0]
      ) {
        entry.item.calendarId = state.calendars[0].id;
      }
      const list = entry.kind === 'event' ? state.events : state.plans;
      if (!list.some((item) => item.id === entry.item.id)) list.push(entry.item);
    } else if (entry.kind === 'occurrence') {
      const event = state.events.find((item) => item.id === entry.meta?.eventId);
      if (event?.recurrence) {
        event.recurrence.exceptions = (event.recurrence.exceptions || []).filter(
          (date) => date !== entry.meta?.occurrenceDate
        );
      }
    } else if (entry.kind === 'series-split') {
      if (!entry.item) return;
      const series = state.events.find((item) => item.id === entry.meta?.seriesId);
      if (series) Object.assign(series, entry.item);
      else state.events.push(entry.item);
    }
    state.trash = state.trash.filter((item) => item.id !== id);
    state.events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    deps.onChange({ rerender: true });
    render();
    deps.showToast('已从回收站恢复');
  }

  function aboutHTML(state) {
    return `
      <div class="about">
        <img class="about-logo" src="../assets/icon.png" alt="朝暮图标">
        <h3 class="about-name">朝暮 <span>Morrow</span></h3>
        <p class="about-slogan">朝朝暮暮，皆有安排。</p>
        <p class="about-desc">一款参考 macOS 日历设计的 Windows 桌面日历。四种视图、长期计划、四种可拖拽小组件，所有数据只保存在本机。</p>
        <div class="about-meta">
          <span>版本 ${info ? info.version : '1.2.1'}</span>
          <span>Windows 10 / 11 · x64</span>
          <span>MIT License</span>
        </div>
        <div class="about-links">
          <button class="set-btn primary" data-action="homepage">打开项目主页</button>
          <button class="set-btn" data-action="releases">检查更新</button>
          <button class="set-btn" data-action="open-data">数据文件夹</button>
        </div>
        <div class="about-credits">
          <p>设计与实现：yaolongda</p>
          <p>Electron 45 · 原生 HTML / CSS / JavaScript</p>
          <p>${HOME_URL}</p>
        </div>
        <p class="about-fineprint">参考 Apple Calendar 与 macOS Sonoma 桌面小组件。本项目为独立实现，与 Apple 无关。</p>
      </div>`;
  }

  function handleAction(action) {
    if (action === 'export') deps.exportConfig();
    else if (action === 'import') deps.importConfig();
    else if (action === 'open-data') deps.openDataFolder();
    else if (action === 'new-plan') {
      close();
      deps.openPlanEditor(null);
    } else if (action === 'pick-background') $('#background-file').click();
    else if (action === 'clear-background') {
      const state = ensureDefaults(deps.getState());
      state.settings.appearance.background = null;
      deps.onChange({ soft: true });
      render();
    } else if (action === 'reset-appearance') {
      const state = ensureDefaults(deps.getState());
      state.settings.appearance = {
        theme: 'classic',
        accent: '#FF3B30',
        font: 'system',
        material: 'none',
        panelOpacity: 0.94,
        glass: 8,
        background: null,
      };
      deps.onChange({ soft: true });
      render();
    } else if (action === 'import-holidays') deps.importHolidays?.();
    else if (action === 'reset-holidays') {
      const state = ensureDefaults(deps.getState());
      state.settings.holidayData = {};
      Holidays.setCustom({});
      deps.onChange({ rerender: true });
      render();
      deps.showToast('已恢复内置节假日数据');
    } else if (action === 'homepage') deps.openExternal(HOME_URL);
    else if (action === 'releases') deps.openExternal(RELEASES_URL);
  }

  function bind() {
    $('#settings-overlay').addEventListener('mousedown', (event) => {
      if (event.target.id === 'settings-overlay') close();
    });
    $('#settings-close').addEventListener('click', close);
    $$('.settings-nav button').forEach((button) => {
      button.addEventListener('click', () => {
        current = button.dataset.section;
        render();
      });
    });

    const content = $('#settings-content');
    content.addEventListener('click', (event) => {
      const shortcutButton = event.target.closest('[data-shortcut]');
      if (shortcutButton) {
        capturingShortcut = shortcutButton.dataset.shortcut;
        shortcutButton.textContent = '按下新按键…';
        shortcutButton.classList.add('capturing');
        return;
      }
      const restore = event.target.closest('[data-trash-restore]');
      if (restore) {
        const row = restore.closest('[data-trash-id]');
        if (row) restoreTrashEntry(row.dataset.trashId);
        return;
      }
      const purge = event.target.closest('[data-trash-purge]');
      if (purge) {
        const row = purge.closest('[data-trash-id]');
        if (!row) return;
        const state = ensureDefaults(deps.getState());
        state.trash = (state.trash || []).filter((item) => item.id !== row.dataset.trashId);
        deps.onChange({ soft: true });
        render();
        deps.showToast('已彻底删除');
        return;
      }
      const emptyTrash = event.target.closest('[data-trash-empty]');
      if (emptyTrash) {
        const state = ensureDefaults(deps.getState());
        const count = (state.trash || []).length;
        if (count === 0) return;
        const clear = () => {
          deps.recordHistory?.('清空回收站');
          state.trash = [];
          deps.onChange({ soft: true });
          render();
          deps.showToast('回收站已清空');
        };
        if (deps.openConfirm) {
          deps.openConfirm({
            title: '清空回收站？',
            text: `将永久删除回收站中的 ${count} 个项目，此操作无法撤销。`,
            okLabel: '清空',
            onConfirm: clear,
          });
        } else {
          clear();
        }
        return;
      }
      const actionNode = event.target.closest('[data-action]');
      if (actionNode) {
        handleAction(actionNode.dataset.action);
        return;
      }
      const week = event.target.closest('[data-weekstart]');
      if (week) {
        const state = ensureDefaults(deps.getState());
        state.settings.weekStart = Number(week.dataset.weekstart);
        deps.onChange({ rerender: true });
        render();
        return;
      }
      const workMode = event.target.closest('[data-workmode]');
      if (workMode) {
        const state = ensureDefaults(deps.getState());
        state.settings.workHours = Workday.normalize({
          ...state.settings.workHours,
          mode: workMode.dataset.workmode,
        });
        deps.onChange({ rerender: true });
        render();
        return;
      }
      const preset = event.target.closest('[data-preset]');
      if (preset) {
        const state = ensureDefaults(deps.getState());
        const schedule = Schedule.normalize(state.settings.schedule);
        state.settings.schedule = Schedule.applyPreset(preset.dataset.preset, schedule, {
          anchor:
            schedule.alternate?.anchor || schedule.cycle?.anchor || ymd(startOfDay(new Date())),
        });
        deps.onChange({ rerender: true });
        render();
        return;
      }
      const weekday = event.target.closest('[data-weekday]');
      if (weekday) {
        const state = ensureDefaults(deps.getState());
        const schedule = Schedule.normalize(state.settings.schedule);
        const day = Number(weekday.dataset.weekday);
        const type = schedule.restWeekdays.includes(day)
          ? 'rest'
          : schedule.halfWeekdays.includes(day)
            ? 'half'
            : 'work';
        schedule.restWeekdays = schedule.restWeekdays.filter((value) => value !== day);
        schedule.halfWeekdays = schedule.halfWeekdays.filter((value) => value !== day);
        if (type === 'work') schedule.halfWeekdays.push(day);
        else if (type === 'half') schedule.restWeekdays.push(day);
        schedule.preset = 'custom';
        state.settings.schedule = schedule;
        deps.onChange({ rerender: true });
        render();
        return;
      }
      const nav = event.target.closest('[data-override-nav]');
      if (nav) {
        overrideMonth = addMonths(overrideMonth, Number(nav.dataset.overrideNav));
        render();
        return;
      }
      const over = event.target.closest('[data-override-date]');
      if (over) {
        const state = ensureDefaults(deps.getState());
        const schedule = Schedule.normalize(state.settings.schedule);
        const key = over.dataset.overrideDate;
        const date = parseYmd(key);
        const weekStart = [0, 1, 6].includes(Number(state.settings.weekStart))
          ? Number(state.settings.weekStart)
          : 1;
        const baseType = Schedule.dayType(
          { ...schedule, overrides: {} },
          date,
          weekStart
        );
        const current = schedule.overrides[key] || null;
        let next;
        if (current === null) next = baseType === 'rest' ? 'work' : 'rest';
        else if (current === 'rest') next = 'half';
        else if (current === 'half') next = 'work';
        else next = null;
        if (next) schedule.overrides[key] = next;
        else delete schedule.overrides[key];
        state.settings.schedule = schedule;
        deps.onChange({ rerender: true });
        render();
        return;
      }
      const theme = event.target.closest('.theme-card[data-theme]');
      if (theme) {
        const state = ensureDefaults(deps.getState());
        state.settings.appearance.theme = theme.dataset.theme;
        deps.onChange({ soft: true });
        render();
        return;
      }
      const accent = event.target.closest('[data-accent]');
      if (accent) {
        const state = ensureDefaults(deps.getState());
        state.settings.appearance.accent = accent.dataset.accent;
        deps.onChange({ soft: true });
        render();
        return;
      }
      const shiftApply = event.target.closest('[data-shift-apply]');
      if (shiftApply) {
        const state = ensureDefaults(deps.getState());
        const select = $('#shift-template-select');
        const template = (state.settings.shiftTemplates || []).find(
          (item) => item.id === select?.value
        );
        if (!template) {
          deps.showToast('先选择一个班次模板');
          return;
        }
        state.settings.workHours = Workday.normalize(template.workHours);
        deps.onChange({ rerender: true });
        render();
        deps.showToast(`已切换到「${template.name}」`);
        return;
      }
      const shiftDelete = event.target.closest('[data-shift-delete]');
      if (shiftDelete) {
        const state = ensureDefaults(deps.getState());
        const select = $('#shift-template-select');
        if (!select?.value) {
          deps.showToast('先选择要删除的模板');
          return;
        }
        state.settings.shiftTemplates = (state.settings.shiftTemplates || []).filter(
          (item) => item.id !== select.value
        );
        deps.onChange({ rerender: true });
        render();
        deps.showToast('已删除班次模板');
        return;
      }
      const shiftSave = event.target.closest('[data-shift-save]');
      if (shiftSave) {
        const state = ensureDefaults(deps.getState());
        const name = ($('#shift-template-name')?.value || '').trim();
        if (!name) {
          deps.showToast('给模板起个名字吧');
          return;
        }
        const templates = state.settings.shiftTemplates || [];
        const existing = templates.find((item) => item.name === name);
        const workHours = Workday.normalize(state.settings.workHours);
        if (existing) existing.workHours = workHours;
        else
          templates.push({
            id: `shift-${Date.now().toString(36)}`,
            name: name.slice(0, 20),
            workHours,
          });
        state.settings.shiftTemplates = templates.slice(-20);
        deps.onChange({ rerender: true });
        render();
        deps.showToast(`已保存班次模板「${name}」`);
        return;
      }
      const batch = event.target.closest('[data-batch-override]');
      if (batch) {
        const startValue = $('#batch-start')?.value;
        const endValue = $('#batch-end')?.value;
        const start = parseYmd(startValue);
        const end = parseYmd(endValue);
        if (!startValue || !endValue || Number.isNaN(start.getTime()) || end < start) {
          deps.showToast('请选择有效的日期范围');
          return;
        }
        const span = Math.round((startOfDay(end) - startOfDay(start)) / 86400000) + 1;
        if (span > 366) {
          deps.showToast('一次最多批量修改 366 天');
          return;
        }
        batchStart = startValue;
        batchEnd = endValue;
        const state = ensureDefaults(deps.getState());
        const schedule = Schedule.normalize(state.settings.schedule);
        deps.recordHistory?.('批量修改特殊日期');
        for (let index = 0; index < span; index += 1) {
          const key = ymd(addDays(start, index));
          if (batch.dataset.batchOverride === 'clear') delete schedule.overrides[key];
          else schedule.overrides[key] = batch.dataset.batchOverride;
        }
        state.settings.schedule = schedule;
        deps.onChange({ rerender: true });
        render();
        deps.showToast(`已更新 ${span} 天的特殊日期`);
        return;
      }
      const planFilterButton = event.target.closest('[data-plan-filter]');
      if (planFilterButton) {
        planFilter = planFilterButton.dataset.planFilter;
        render(true);
        return;
      }
      const nextCycle = event.target.closest('[data-plan-next]');
      if (nextCycle) {
        const state = ensureDefaults(deps.getState());
        const plan = state.plans.find((item) => item.id === nextCycle.dataset.planNext);
        if (!plan) return;
        const months =
          plan.repeat === 'quarterly' ? 3 : plan.repeat === 'yearly' ? 12 : 1;
        const startDate = addMonths(parseYmd(plan.start), months);
        const endDate = addMonths(parseYmd(plan.end), months);
        const start = ymd(startDate);
        const end = ymd(endDate);
        if (state.plans.some((item) => item.title === plan.title && item.start === start)) {
          deps.showToast('下一期计划已经存在');
          return;
        }
        deps.recordHistory?.('创建下一期计划');
        state.plans.push({
          ...plan,
          id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          start,
          end,
          progress: 0,
          archived: false,
          milestonesSeen: [],
          reminders: [],
        });
        deps.onChange({ rerender: true });
        render(true);
        deps.showToast(`已创建《${plan.title}》的下一期`);
        return;
      }
      const archiveButton = event.target.closest('[data-plan-archive]');
      if (archiveButton) {
        const state = ensureDefaults(deps.getState());
        const plan = state.plans.find((item) => item.id === archiveButton.dataset.planArchive);
        if (!plan) return;
        deps.recordHistory?.(plan.archived ? '恢复计划' : '归档计划');
        plan.archived = !plan.archived;
        deps.onChange({ rerender: true });
        render(true);
        deps.showToast(plan.archived ? '计划已归档' : '计划已恢复');
        return;
      }
      const plan = event.target.closest('[data-plan-id]');
      if (plan) {
        close();
        deps.openPlanEditor(plan.dataset.planId);
      }
    });

    content.addEventListener('change', (event) => {
      const input = event.target;
      if (input.id === 'batch-start') {
        batchStart = input.value;
        if (!batchEnd || batchEnd < batchStart) batchEnd = batchStart;
      } else if (input.id === 'batch-end') {
        batchEnd = input.value;
      }
      if (input.id === 'schedule-anchor') {
        const state = ensureDefaults(deps.getState());
        const schedule = Schedule.normalize(state.settings.schedule);
        const anchor = input.value;
        if (schedule.alternate) schedule.alternate.anchor = anchor;
        if (schedule.cycle) schedule.cycle.anchor = anchor;
        state.settings.schedule = schedule;
        deps.onChange({ rerender: true });
        render();
        return;
      }
      if (input.id === 'accent-custom') {
        const state = ensureDefaults(deps.getState());
        state.settings.appearance.accent = input.value;
        deps.onChange({ soft: true });
        render();
        return;
      }
      if (input.id === 'background-file' && input.files?.[0]) {
        importBackground(input.files[0]);
        return;
      }
      if (input.dataset.path === 'sidebarVisible') {
        const state = ensureDefaults(deps.getState());
        state.settings.sidebarVisible = input.checked;
        deps.onChange({ rerender: false, sidebar: true });
        return;
      }
      if (input.type === 'checkbox' && input.dataset.path) {
        const state = ensureDefaults(deps.getState());
        const path = input.dataset.path.split('.');
        let target = state.settings;
        for (let index = 0; index < path.length - 1; index += 1) {
          target = target[path[index]];
        }
        target[path[path.length - 1]] = input.checked;
        deps.onChange({ rerender: true });
        render(true);
      }
    });

    content.addEventListener('input', (event) => {
      const input = event.target;
      if (input.dataset.appearance) {
        const state = ensureDefaults(deps.getState());
        const key = input.dataset.appearance;
        const value = key === 'panelOpacity' ? Number(input.value) / 100 : Number(input.value);
        state.settings.appearance[key] = value;
        const label = input.closest('.range-row')?.querySelector('.range-value');
        if (label) label.textContent = key === 'panelOpacity' ? `${input.value}%` : `${input.value}px`;
        deps.onChange({ soft: true });
        return;
      }
      if (input.dataset.background) {
        const state = ensureDefaults(deps.getState());
        const background = state.settings.appearance.background;
        if (!background) return;
        const key = input.dataset.background;
        const value =
          key === 'opacity' || key === 'dim' ? Number(input.value) / 100 : Number(input.value);
        background[key] = value;
        const label = input.closest('.range-row')?.querySelector('.range-value');
        if (label) label.textContent = key === 'blur' ? `${input.value}px` : `${input.value}%`;
        deps.onChange({ soft: true });
      }
    });

    // 字体等 select 需要单独处理
    content.addEventListener('change', (event) => {
      const workTime = event.target.closest('[data-worktime]');
      if (workTime) {
        const [group, key] = workTime.dataset.worktime.split('.');
        const state = ensureDefaults(deps.getState());
        const workHours = Workday.normalize(state.settings.workHours);
        if (workHours[group]) workHours[group][key] = workTime.value;
        state.settings.workHours = Workday.normalize(workHours);
        deps.onChange({ soft: true });
        render();
        return;
      }
      const select = event.target.closest('.set-select[data-path]');
      if (!select) return;
      const state = ensureDefaults(deps.getState());
      const path = select.dataset.path.split('.');
      let target = state.settings;
      for (let index = 0; index < path.length - 1; index += 1) {
        target = target[path[index]];
      }
      target[path[path.length - 1]] = select.value;
      deps.onChange({ soft: true });
      render();
    });

    document.addEventListener(
      'keydown',
      (event) => {
        if (!capturingShortcut) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          capturingShortcut = '';
          render(true);
          return;
        }
        if (
          !/^[a-z0-9]$/i.test(event.key) &&
          !/^Arrow(Left|Right|Up|Down)$/.test(event.key)
        ) {
          return;
        }
        const state = ensureDefaults(deps.getState());
        if (!state.settings.shortcuts) state.settings.shortcuts = {};
        state.settings.shortcuts[capturingShortcut] =
          event.key.length === 1 ? event.key.toLowerCase() : event.key;
        capturingShortcut = '';
        deps.onChange({ rerender: true });
        render(true);
      },
      true
    );
  }

  async function importBackground(file) {
    const state = ensureDefaults(deps.getState());
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });
      const maxWidth = 2200;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', 0.84);
      state.settings.appearance.background = {
        dataUrl: compressed,
        opacity: 0.4,
        blur: 4,
        dim: 0.22,
      };
      deps.onChange({ soft: true });
      render();
    } catch {
      deps.showToast('无法读取这张图片');
    }
  }

  function init(dependencies) {
    deps = dependencies;
    bind();
  }

  window.SettingsUI = { init, open, close, isOpen, render };
})();
