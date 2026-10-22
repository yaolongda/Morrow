'use strict';

/**
 * 农历、二十四节气、传统黄历与星座。
 * 农历使用浏览器内置 Intl 中国历法；节气用太阳视黄经计算；
 * 黄历为传统建除十二神与宜忌的简化呈现，仅作文化参考。
 */
(function () {
  const TERM_DEFS = [
    ['小寒', 285],
    ['大寒', 300],
    ['立春', 315],
    ['雨水', 330],
    ['惊蛰', 345],
    ['春分', 0],
    ['清明', 15],
    ['谷雨', 30],
    ['立夏', 45],
    ['小满', 60],
    ['芒种', 75],
    ['夏至', 90],
    ['小暑', 105],
    ['大暑', 120],
    ['立秋', 135],
    ['处暑', 150],
    ['白露', 165],
    ['秋分', 180],
    ['寒露', 195],
    ['霜降', 210],
    ['立冬', 225],
    ['小雪', 240],
    ['大雪', 255],
    ['冬至', 270],
  ];

  const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  const JIANCHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
  const JIANCHU_YI = {
    建: ['出行', '上任', '会友', '祈福'],
    除: ['疗病', '扫舍', '除服', '出行'],
    满: ['祭祀', '祈福', '结亲', '开市'],
    平: ['修饰', '平治道涂', '交易', '安床'],
    定: ['祭祀', '订盟', '纳采', '安床'],
    执: ['捕捉', '狩猎', '祭祀', '祈福'],
    破: ['破屋', '求医', '坏垣'],
    危: ['祭祀', '安床', '修造'],
    成: ['嫁娶', '开市', '入学', '上任'],
    收: ['纳财', '收账', '进人口', '纳畜'],
    开: ['开市', '交易', '出行', '求医'],
    闭: ['筑堤', '藏宝', '安葬'],
  };
  const JIANCHU_JI = {
    建: ['动土', '开仓', '出货'],
    除: ['求财', '开市', '嫁娶'],
    满: ['服药', '栽种', '安葬'],
    平: ['开渠', '栽种', '安葬'],
    定: ['诉讼', '出行', '移徙'],
    执: ['开市', '出货', '移徙'],
    破: ['嫁娶', '开市', '动土'],
    危: ['登高', '行船', '远行'],
    成: ['诉讼', '争执'],
    收: ['开市', '出行', '安葬'],
    开: ['安葬', '动土'],
    闭: ['开市', '出行', '求医'],
  };

  const LUNAR_DAY_NAMES = [
    '',
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
  ];

  const SIGN_INFO = [
    ['摩羯座', '12.22 – 1.19', 12, 22, 1, 19],
    ['水瓶座', '1.20 – 2.18', 1, 20, 2, 18],
    ['双鱼座', '2.19 – 3.20', 2, 19, 3, 20],
    ['白羊座', '3.21 – 4.19', 3, 21, 4, 19],
    ['金牛座', '4.20 – 5.20', 4, 20, 5, 20],
    ['双子座', '5.21 – 6.21', 5, 21, 6, 21],
    ['巨蟹座', '6.22 – 7.22', 6, 22, 7, 22],
    ['狮子座', '7.23 – 8.22', 7, 23, 8, 22],
    ['处女座', '8.23 – 9.22', 8, 23, 9, 22],
    ['天秤座', '9.23 – 10.23', 9, 23, 10, 23],
    ['天蝎座', '10.24 – 11.22', 10, 24, 11, 22],
    ['射手座', '11.23 – 12.21', 11, 23, 12, 21],
  ];

  const FORTUNE_COLORS = ['雾蓝', '琥珀', '苔绿', '暮紫', '砂金', '珊瑚', '月白', '黛青'];
  const FORTUNE_ADVICE = [
    '适合把大目标拆成今天能完成的一小步。',
    '先完成，再完美；今天适合推进关键事项。',
    '给自己留一点空白，灵感往往在安静时出现。',
    '适合沟通与协作，把想法说出来会更容易落地。',
    '节奏不必太满，稳一点反而更快。',
    '今天适合收尾与复盘，为下一阶段腾出空间。',
    '把注意力放在最重要的一件事上。',
    '适度的休息也是计划的一部分。',
  ];

  const termCache = new Map();
  const termMapCache = new Map();
  const lunarCache = new Map();
  const almanacCache = new Map();

  const pad = (value) => String(value).padStart(2, '0');

  function ymd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function mod(value, base) {
    return ((value % base) + base) % base;
  }

  function sunLongitude(jd) {
    const T = (jd - 2451545.0) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * (Math.PI / 180);
    const C =
      (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
      0.000289 * Math.sin(3 * M);
    const omega = (125.04 - 1934.136 * T) * (Math.PI / 180);
    const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
    return mod(lambda, 360);
  }

  function termInstant(year, index) {
    const target = TERM_DEFS[index][1];
    let jd =
      Date.UTC(year, Math.floor(index / 2), index % 2 === 0 ? 6 : 21, 4) / 86400000 +
      2440587.5;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      let diff = target - sunLongitude(jd);
      diff = mod(diff + 180, 360) - 180;
      jd += diff / 0.98564736;
      if (Math.abs(diff) < 1e-8) break;
    }
    return jd;
  }

  function termsForYear(year) {
    if (termCache.has(year)) return termCache.get(year);
    const list = TERM_DEFS.map(([name], index) => {
      const jd = termInstant(year, index);
      const beijing = new Date((jd - 2440587.5) * 86400000 + 8 * 3600000);
      return {
        name,
        date: `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(
          beijing.getUTCDate()
        )}`,
      };
    });
    termCache.set(year, list);
    return list;
  }

  function termMapForYear(year) {
    if (termMapCache.has(year)) return termMapCache.get(year);
    const map = {};
    for (const term of termsForYear(year)) map[term.date] = term.name;
    termMapCache.set(year, map);
    return map;
  }

  function termOf(date) {
    return termMapForYear(date.getFullYear())[ymd(date)] || null;
  }

  const lunarFormatter =
    typeof Intl !== 'undefined'
      ? new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  function lunarMonthNumber(name) {
    const clean = String(name).replace(/^闰/, '');
    if (clean === '十一月' || clean === '冬月') return 11;
    if (clean === '十二月' || clean === '腊月') return 12;
    const map = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const chars = clean.replace('月', '');
    if (chars === '十一') return 11;
    if (chars === '十二') return 12;
    return map[chars] || map[chars[0]] || 1;
  }

  function lunarOf(date) {
    const key = ymd(date);
    if (lunarCache.has(key)) return lunarCache.get(key);
    if (!lunarFormatter) return null;
    let parts;
    try {
      parts = lunarFormatter.formatToParts(date);
    } catch {
      return null;
    }
    const valueOf = (type) => parts.find((part) => part.type === type)?.value || '';
    const year = Number(valueOf('relatedYear')) || date.getFullYear();
    const yearGanZhi = valueOf('yearName');
    const monthName = valueOf('month');
    const day = Number(valueOf('day')) || 1;
    const isLeap = monthName.startsWith('闰');
    const info = {
      year,
      yearGanZhi,
      monthName,
      monthNumber: lunarMonthNumber(monthName),
      isLeap,
      day,
      dayName: LUNAR_DAY_NAMES[day] || String(day),
      text: `${monthName}${LUNAR_DAY_NAMES[day] || day}`,
    };
    lunarCache.set(key, info);
    return info;
  }

  const DAY_ANCHOR_UTC = Date.UTC(1949, 9, 1); // 1949-10-01 甲子日

  function dayGanzhi(date) {
    const diff = Math.round(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - DAY_ANCHOR_UTC) /
        86400000
    );
    const index = mod(diff, 60);
    return {
      index,
      stem: STEMS[index % 10],
      branchIndex: index % 12,
      branch: BRANCHES[index % 12],
      text: `${STEMS[index % 10]}${BRANCHES[index % 12]}`,
      element: ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'][index % 10],
    };
  }

  function almanacOf(date) {
    const key = ymd(date);
    if (almanacCache.has(key)) return almanacCache.get(key);
    const lunar = lunarOf(date);
    const day = dayGanzhi(date);
    const monthBranch = lunar ? (lunar.monthNumber + 1) % 12 : 2;
    const jianchuIndex = mod(day.branchIndex - monthBranch, 12);
    const jianchu = JIANCHU[jianchuIndex];
    const clashBranch = (day.branchIndex + 6) % 12;
    const info = {
      lunar,
      term: termOf(date),
      dayGanzhi: day,
      jianchu,
      yi: JIANCHU_YI[jianchu] || [],
      ji: JIANCHU_JI[jianchu] || [],
      chong: `冲${ZODIAC[clashBranch]}`,
      element: day.element,
    };
    almanacCache.set(key, info);
    return info;
  }

  function zodiacOf(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const sign = SIGN_INFO.find(([, , sm, sd, em, ed]) => {
      if (sm <= em) return (month === sm && day >= sd) || (month === em && day <= ed);
      return (month === sm && day >= sd) || (month === em && day <= ed);
    }) || SIGN_INFO[9];
    const seed = `${ymd(date)}-${sign[0]}`;
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const pick = (offset) => 2 + ((hash >>> offset) % 4);
    const overall = pick(0);
    return {
      sign: sign[0],
      range: sign[1],
      overall,
      love: pick(4),
      career: pick(8),
      wealth: pick(12),
      luckyColor: FORTUNE_COLORS[hash % FORTUNE_COLORS.length],
      luckyNumber: 1 + (hash % 9),
      advice: FORTUNE_ADVICE[hash % FORTUNE_ADVICE.length],
      stars: '★'.repeat(overall) + '☆'.repeat(5 - overall),
    };
  }

  function briefOf(date) {
    const info = almanacOf(date);
    return {
      ...info,
      zodiac: zodiacOf(date),
    };
  }

  window.Almanac = {
    ymd,
    startOfDay,
    termOf,
    termsForYear,
    lunarOf,
    dayGanzhi,
    almanacOf,
    zodiacOf,
    briefOf,
    LUNAR_DAY_NAMES,
    TERM_DEFS,
  };
})();
