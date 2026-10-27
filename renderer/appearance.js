'use strict';

/** 外观：主题、强调色、字体、材质、毛玻璃、背景图片。 */
(function () {
  const FONTS = {
    system: {
      name: '系统默认',
      stack:
        '"SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif',
    },
    yahei: {
      name: '微软雅黑',
      stack: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
    },
    dengxian: {
      name: '等线',
      stack: 'DengXian, "Microsoft YaHei UI", "PingFang SC", sans-serif',
    },
    song: {
      name: '宋体 / 思源宋体',
      stack: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
    },
    kai: {
      name: '楷体',
      stack: 'KaiTi, STKaiti, "Kaiti SC", "LXGW WenKai", serif',
    },
    lxgw: {
      name: '霞鹜文楷',
      stack: '"LXGW WenKai", "LXGW WenKai Screen", KaiTi, serif',
    },
  };

  const THEMES = {
    classic: { name: '经典白' },
    paper: { name: '暖纸' },
    mist: { name: '晨雾' },
  };

  const ACCENTS = ['#FF3B30', '#FF9500', '#34C759', '#0A84FF', '#AF52DE', '#FF2D55', '#8E8E93'];

  function apply(settings) {
    const appearance = settings?.appearance || {};
    const root = document.documentElement;
    const theme = THEMES[appearance.theme] ? appearance.theme : 'classic';
    const font = FONTS[appearance.font] ? appearance.font : 'system';
    const accent = /^#[0-9a-f]{6}$/i.test(appearance.accent || '')
      ? appearance.accent
      : '#FF3B30';

    root.dataset.theme = theme;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--font', FONTS[font].stack);
    root.style.setProperty(
      '--panel-alpha',
      String(Math.min(1, Math.max(0.45, Number(appearance.panelOpacity) || 0.92)))
    );
    root.style.setProperty(
      '--glass-blur',
      `${Math.min(36, Math.max(0, Number(appearance.glass) || 0))}px`
    );

    const background = appearance.background || null;
    const hasBackground = Boolean(background?.dataUrl);
    document.body.classList.toggle('has-bg', hasBackground);

    const layer = document.getElementById('bg-image');
    const dim = document.getElementById('bg-dim');
    if (layer) {
      layer.style.backgroundImage = hasBackground ? `url("${background.dataUrl}")` : 'none';
      layer.style.opacity = hasBackground
        ? String(Math.min(1, Math.max(0.05, Number(background.opacity) || 0.45)))
        : '0';
      layer.style.filter = hasBackground
        ? `blur(${Math.min(30, Math.max(0, Number(background.blur) || 0))}px)`
        : 'none';
    }
    if (dim) {
      dim.style.background = hasBackground
        ? `rgba(0, 0, 0, ${Math.min(0.7, Math.max(0, Number(background.dim) || 0))})`
        : 'transparent';
    }

    const material = ['none', 'mica', 'acrylic'].includes(appearance.material)
      ? appearance.material
      : 'none';
    document.body.classList.toggle('material-on', material !== 'none');
    if (window.desktop?.setWindowMaterial) {
      window.desktop.setWindowMaterial(material);
    }
  }

  function applyWidget(settings, override = null) {
    const appearance = { ...(settings?.appearance || {}) };
    const root = document.documentElement;
    if (override) {
      if (['classic', 'paper', 'mist'].includes(override.theme)) {
        appearance.theme = override.theme;
      }
      if (Number.isFinite(Number(override.opacity)) && override.opacity !== null) {
        appearance.panelOpacity = Number(override.opacity);
      }
      if (Number.isFinite(Number(override.glass)) && override.glass !== null) {
        appearance.glass = Number(override.glass);
      }
    }
    const theme = THEMES[appearance.theme] ? appearance.theme : 'classic';
    const accent = /^#[0-9a-f]{6}$/i.test(appearance.accent || '')
      ? appearance.accent
      : '#FF3B30';
    const font = FONTS[appearance.font] ? appearance.font : 'system';
    root.dataset.theme = theme;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--font', FONTS[font].stack);
    root.style.setProperty(
      '--panel-alpha',
      String(Math.min(1, Math.max(0.45, Number(appearance.panelOpacity) || 0.92)))
    );
    root.style.setProperty(
      '--glass-blur',
      `${Math.min(36, Math.max(0, Number(appearance.glass) || 0))}px`
    );
    document.body.classList.toggle(
      'widget-alpha',
      Boolean(override && override.opacity !== null && override.opacity !== '')
    );

    const background = appearance.background || null;
    const hasBackground = Boolean(background?.dataUrl);
    document.body.classList.toggle('has-bg', hasBackground);
    const layer = document.getElementById('widget-bg');
    const dim = document.getElementById('widget-bg-dim');
    if (layer) {
      layer.style.backgroundImage = hasBackground ? `url("${background.dataUrl}")` : 'none';
      layer.style.opacity = hasBackground
        ? String(Math.min(1, Math.max(0.05, Number(background.opacity) || 0.45)))
        : '0';
      layer.style.filter = hasBackground
        ? `blur(${Math.min(30, Math.max(0, Number(background.blur) || 0))}px)`
        : 'none';
    }
    if (dim) {
      dim.style.background = hasBackground
        ? `rgba(0, 0, 0, ${Math.min(0.7, Math.max(0, Number(background.dim) || 0))})`
        : 'transparent';
    }
    const material = ['none', 'mica', 'acrylic'].includes(appearance.material)
      ? appearance.material
      : 'none';
    document.body.classList.toggle('material-on', material !== 'none');
  }

  window.Appearance = { FONTS, THEMES, ACCENTS, apply, applyWidget };
})();
