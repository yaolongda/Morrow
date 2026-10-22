'use strict';

/** 设置中心：通用、工作时间、外观、显示、计划、关于。 */
(function () {
  const HOME_URL = 'https://github.com/yaolongda/Morrow';
  const RELEASES_URL = 'https://github.com/yaolongda/Morrow/releases';
  let deps = null;
  let current = 'general';
  let overrideMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let info = null;

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
      state.settings.display = { lunar: true, solarTerms: true, almanac: false, zodiac: false };
    }
    return state;
  }

  function open(section = 'general') {
    current = section;
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
        <div class="set-group-title">键盘</div>
        <div class="set-shortcuts">
          <span><kbd>T</kbd> 今天</span><span><kbd>D</kbd><kbd>W</kbd><kbd>M</kbd><kbd>Y</kbd> 视图</span>
          <span><kbd>Ctrl</kbd>+<kbd>N</kbd> 新建日程</span><span><kbd>Ctrl</kbd>+<kbd>,</kbd> 设置</span>
          <span><kbd>P</kbd> 新建计划</span><span><kbd>Ctrl</kbd>+<kbd>F</kbd> 搜索</span>
        </div>
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
      <div class="set-group">
        <div class="set-group-title">特殊日期</div>
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
        return `<button type="button" class="override-day ${type} ${
          outside ? 'outside' : ''
        } ${overridden ? 'overridden' : ''} ${key === today ? 'today' : ''}"
          data-override-date="${key}" title="${date.getMonth() + 1}月${date.getDate()}日 · ${
            type === 'rest' ? '休息' : type === 'half' ? '半天' : '工作'
          }">
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
    const active = Plans.active(state.plans);
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
        <div class="set-group-title">进行中的计划</div>
        ${
          active.length
            ? `<div class="settings-plan-list">${active
                .slice(0, 8)
                .map((plan) => {
                  const meta = Plans.classify(plan);
                  const color = Plans.colorFor(plan, state);
                  return `<button class="settings-plan-row" data-plan-id="${plan.id}">
                    <span class="settings-plan-dot" style="--color:${color}"></span>
                    <span class="settings-plan-main"><strong>${escapeHtml(plan.title)}</strong><em>${meta.name} · ${plan.start.slice(5).replace('-', '/')} – ${plan.end.slice(5).replace('-', '/')}</em></span>
                    <span class="settings-plan-progress">${plan.progress}%</span>
                  </button>`;
                })
                .join('')}</div>`
            : '<p class="set-hint">还没有进行中的计划。给自己定一个跨周、跨月或跨年的目标吧。</p>'
        }
      </div>`;
  }

  function aboutHTML(state) {
    return `
      <div class="about">
        <img class="about-logo" src="../assets/icon.png" alt="朝暮图标">
        <h3 class="about-name">朝暮 <span>Morrow</span></h3>
        <p class="about-slogan">朝朝暮暮，皆有安排。</p>
        <p class="about-desc">一款参考 macOS 日历设计的 Windows 桌面日历。四种视图、长期计划、四种可拖拽小组件，所有数据只保存在本机。</p>
        <div class="about-meta">
          <span>版本 ${info ? info.version : '1.0.1'}</span>
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
      const plan = event.target.closest('[data-plan-id]');
      if (plan) {
        close();
        deps.openPlanEditor(plan.dataset.planId);
      }
    });

    content.addEventListener('change', (event) => {
      const input = event.target;
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
