'use strict';

/* 各来源的发行日期可能是字符串、Unix 时间戳(秒)或毫秒，统一取四位年份 */
function toYear(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? '' : String(d.getFullYear());
  }
  const m = String(v).match(/\d{4}/);
  return m ? m[0] : '';
}

module.exports = { toYear };
