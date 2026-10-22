'use strict';

/** 构建免安装便携版：复制 Electron 运行时与源码，生成 release/朝暮-win32-x64。 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const RELEASE = path.join(ROOT, 'release', '朝暮-win32-x64');

if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  throw new Error('找不到 Electron 运行时，请先运行 npm install。');
}

fs.rmSync(path.join(ROOT, 'release'), { recursive: true, force: true });
fs.mkdirSync(RELEASE, { recursive: true });
fs.cpSync(ELECTRON_DIST, RELEASE, { recursive: true });
fs.renameSync(path.join(RELEASE, 'electron.exe'), path.join(RELEASE, '朝暮.exe'));

const appDir = path.join(RELEASE, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const file of ['main.js', 'preload.js', 'seed.js']) {
  fs.copyFileSync(path.join(ROOT, file), path.join(appDir, file));
}
fs.cpSync(path.join(ROOT, 'renderer'), path.join(appDir, 'renderer'), { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(appDir, 'assets'), { recursive: true });

fs.writeFileSync(
  path.join(appDir, 'package.json'),
  JSON.stringify(
    {
      name: 'morrow-calendar',
      productName: '朝暮',
      version: '1.0.1',
      description: '朝暮 · Morrow：参考 macOS 日历设计的 Windows 桌面日历，带四种桌面小组件',
      main: 'main.js',
      license: 'MIT',
    },
    null,
    2
  ),
  'utf8'
);

console.log('便携版已生成：', RELEASE);
console.log('可执行文件：', path.join(RELEASE, '朝暮.exe'));
