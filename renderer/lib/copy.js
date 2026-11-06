'use strict';

/**
 * 文案池：把重复出现的问候与建议集中到一处，按日期稳定轮换。
 * 同一天、同一个 key 在所有窗口返回同一句，跨天才会变化。
 */
(function () {
  const POOLS = {
    'suggestion:rest': [
      '今天要不要去做点喜欢的事？',
      '把今天还给自己，慢一点也没关系。',
      '不用赶，今天只需要好好休息。',
      '出去走走，或者什么都不做。',
    ],
    'suggestion:empty': [
      '今天没有会议，要不要留一段整块时间？',
      '今天很空，适合做那件一直拖着的事。',
      '没有安排的一天，先想想自己最想做什么。',
      '空下来不容易，留一点给真正重要的事。',
    ],
    'suggestion:fragmented': [
      '今天安排比较碎，要不要先处理轻量的事？',
      '空档被切得很散，先挑一件小事收个尾。',
      '节奏有点碎，试着把同类的事并到一起。',
    ],
    'suggestion:free': [
      '空档还够，要不要先喘口气？',
      '还有一段完整的时间，留给需要专注的事吧。',
      '时间还宽裕，先做最重要的一件就够了。',
      '有空档，也有余地，按自己的节奏来。',
    ],
    'suggestion:full': [
      '今天比较满，要不要先照顾好自己？',
      '安排有点密，记得给自己留一口喘息的时间。',
      '今天会很忙，能推的就往后放一放。',
    ],
    'suggestion:normal': [
      '节奏还行，要不要按自己的步子来？',
      '不算忙，也不算空，慢慢推进就好。',
      '今天刚刚好，做完一件再想下一件。',
      '保持现在的节奏，不用刻意加速。',
    ],
    'greeting:dawn': ['天还没亮，慢慢来。', '起得真早，先喝口热水。', '清晨安静，适合想一件小事。'],
    'greeting:morning': ['今天也慢慢来。', '上午适合先做最重要的一件事。', '忙一阵，也记得喝口水。'],
    'greeting:noon': ['先好好吃饭，再想别的。', '中午了，放下手里的事歇一会儿。', '吃过饭再继续，来得及。'],
    'greeting:afternoon': ['累了就伸个懒腰。', '下午容易困，起身走两步。', '后半程不用急，稳住就好。'],
    'greeting:evening': ['今天辛苦啦。', '晚上属于你自己。', '把今天收个尾，剩下的明天再说。'],
    'greeting:night': ['早点休息，明天再说。', '夜深了，别再为难自己。', '该睡了，事情做不完也没关系。'],
  };

  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function dayKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  function pick(key, date = new Date()) {
    const pool = POOLS[key];
    if (!pool || pool.length === 0) return '';
    return pool[hash(`${key}:${dayKey(date)}`) % pool.length];
  }

  function suggestion(kind, date = new Date()) {
    return pick(`suggestion:${kind}`, date);
  }

  function greeting(period, date = new Date()) {
    return pick(`greeting:${period}`, date);
  }

  function pool(key) {
    return Array.isArray(POOLS[key]) ? POOLS[key].slice() : [];
  }

  window.Copy = { pick, suggestion, greeting, pool };
})();
