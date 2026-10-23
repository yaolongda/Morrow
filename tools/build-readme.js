'use strict';

/**
 * 由 tools/readme-template.html 生成自包含的 README.html。
 * 所有截图以 base64 内联，生成结果可离线双击打开。
 *
 * 用法：node tools/build-readme.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'tools', 'readme-template.html');
const OUTPUT = path.join(ROOT, 'README.html');

const IMAGES = {
  IMG_MONTH: 'docs/month.png',
  IMG_WEEK: 'docs/week.png',
  IMG_SETTINGS_WORK: 'docs/settings-work.png',
  IMG_WORK_HOURS: 'docs/settings-work-hours.png',
  IMG_CELEBRATION: 'docs/widget-celebration.png',
  IMG_PLAN: 'docs/plan-editor.png',
  IMG_MENU: 'docs/app-menu.png',
  IMG_WIDGETS: 'docs/widgets-showcase.png',
  IMG_APPEARANCE: 'docs/settings-appearance.png',
  IMG_ABOUT: 'docs/about.png',
};

const template = fs.readFileSync(TEMPLATE, 'utf8');
let html = template;
let replaced = 0;

for (const [placeholder, relative] of Object.entries(IMAGES)) {
  const file = path.join(ROOT, relative);
  const buffer = fs.readFileSync(file);
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
  const token = `{{${placeholder}}}`;
  const parts = html.split(token);
  if (parts.length > 1) replaced += parts.length - 1;
  html = parts.join(dataUrl);
}

const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) {
  console.error(`未替换的占位符：${[...new Set(left)].join(', ')}`);
  process.exitCode = 1;
}

fs.writeFileSync(OUTPUT, html, 'utf8');
const size = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`README.html 已生成：${replaced} 张图片内联，共 ${size} MB`);
