'use strict';

/**
 * 安装包静态检查：默认安装目录与纯净卸载脚本。
 * 不实际运行安装器，只保证 NSIS 配置和定制脚本没有在后续改动中丢失。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const nsis = pkg.build?.nsis || {};
const scriptPath = path.join(ROOT, 'build', 'installer.nsh');
const script = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

check('安装器引入自定义 NSIS 脚本', nsis.include === 'build/installer.nsh', String(nsis.include));
check('安装器允许提权以写入 D 盘', nsis.allowElevation === true, String(nsis.allowElevation));
check('默认安装目录指向 D 盘', script.includes('D:\\朝暮'), 'D:\\朝暮');
check(
  'D 盘不存在时保留系统默认目录',
  script.includes('${If} ${FileExists} "D:\\*.*"'),
  'FileExists guard'
);
check('卸载时提供纯净卸载询问', script.includes('customUnInstall') && script.includes('MessageBox MB_YESNO'), 'customUnInstall');
check(
  '纯净卸载会删除本地数据目录',
  script.includes('$APPDATA\\朝暮') && script.includes('$LOCALAPPDATA\\朝暮'),
  'appdata'
);
check(
  '纯净卸载会删除开机启动项',
  script.includes('CurrentVersion\\Run') && script.includes('DeleteRegValue'),
  'Run key'
);
check(
  '纯净卸载会删除应用注册表键',
  script.includes('DeleteRegKey') && script.includes('com.yaolongda.morrow'),
  'registry'
);

const failed = checks.filter((item) => !item.ok).length;
console.log(failed === 0 ? `结果：${checks.length}/${checks.length} 通过` : `${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;
