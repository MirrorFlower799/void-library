(function (root) {
  'use strict';
  const { esc, toDateValue } = root.VoidUtils;
  const CHART_COLORS = [
    '#4f6ef7','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4',
    '#ec4899','#14b8a6','#a855f7','#f97316','#0ea5e9','#84cc16'
  ];

  function statsByKey(list, keyFn) {
    const map = {};
    list.forEach(function (g) {
      const keys = keyFn(g);
      (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
        if (!k) return;
        map[k] = (map[k] || 0) + 1;
      });
    });
    return Object.keys(map).map(function (k) { return { key: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count || a.key.localeCompare(b.key, 'zh'); });
  }

  function renderBars(el, rows, limit, colors) {
    if (!el) return;
    const list = limit ? rows.slice(0, limit) : rows;
    if (!list.length) { el.innerHTML = '<div class="muted">暂无数据</div>'; return; }
    const palette = colors || CHART_COLORS;
    const max = Math.max.apply(null, list.map(function (r) { return r.count; })) || 1;
    el.innerHTML = list.map(function (r, i) {
      const w = Math.max(4, Math.round(r.count / max * 100));
      const color = palette[i % palette.length];
      return '<div class="bar"><span class="bar-label" title="' + esc(r.key) + '">' + esc(r.key) + '</span>' +
        '<span class="bar-fill" style="width:' + w + '%;background:' + color + '"></span>' +
        '<span class="bar-val">' + r.count + '</span></div>';
    }).join('');
  }

  /* 环形（扇形）图 */
  function renderDonut(el, rows, colors) {
    if (!el) return;
    rows = (rows || []).filter(function (r) { return r.count > 0; });
    const total = rows.reduce(function (s, r) { return s + r.count; }, 0);
    if (!total) { el.innerHTML = '<div class="muted">暂无数据</div>'; return; }

    const size = 170, r = size / 2, cx = r, cy = r, inner = r * 0.6;
    let angle = -Math.PI / 2, paths = '';
    rows.forEach(function (row, i) {
      const frac = row.count / total;
      const a2 = angle + frac * Math.PI * 2;
      const color = colors[i % colors.length];
      if (frac >= 0.9999) {
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((r + inner) / 2) +
          '" fill="none" stroke="' + color + '" stroke-width="' + (r - inner) + '"/>';
      } else {
        const large = frac > 0.5 ? 1 : 0;
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        const xi1 = cx + inner * Math.cos(angle), yi1 = cy + inner * Math.sin(angle);
        const xi2 = cx + inner * Math.cos(a2), yi2 = cy + inner * Math.sin(a2);
        paths += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) +
          ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
          ' L' + xi2.toFixed(1) + ',' + yi2.toFixed(1) +
          ' A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + xi1.toFixed(1) + ',' + yi1.toFixed(1) + ' Z" fill="' + color + '"/>';
      }
      angle = a2;
    });

    const legend = rows.map(function (row, i) {
      const pct = Math.round(row.count / total * 100);
      return '<div class="legend-item"><span class="legend-dot" style="background:' + colors[i % colors.length] + '"></span>' +
        '<span class="legend-key" title="' + esc(row.key) + '">' + esc(row.key) + '</span>' +
        '<span class="legend-val">' + row.count + ' · ' + pct + '%</span></div>';
    }).join('');

    el.innerHTML = '<div class="donut-wrap">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '">' + paths + '</svg>' +
      '<div class="legend">' + legend + '</div></div>';
  }

  /* 近 N 个月的时间序列 */
  function monthlySeries(list, dateKey, months) {
    const now = new Date();
    const keys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: (d.getMonth() + 1) + '月' });
    }
    const counts = {};
    keys.forEach(function (k) { counts[k.y + '-' + k.m] = 0; });
    list.forEach(function (g) {
      const v = toDateValue(g[dateKey]);
      if (!v) return;
      const parts = v.split('-');
      const k = Number(parts[0]) + '-' + Number(parts[1]);
      if (k in counts) counts[k]++;
    });
    return keys.map(function (k) { return { label: k.label, value: counts[k.y + '-' + k.m] }; });
  }

  /* 指定年份的 12 个月时间序列 */
  function monthlySeriesYear(list, dateKey, year) {
    const counts = [];
    for (let m = 1; m <= 12; m++) counts.push(0);
    list.forEach(function (g) {
      const v = toDateValue(g[dateKey]);
      if (!v) return;
      const parts = v.split('-');
      if (Number(parts[0]) === year) counts[Number(parts[1]) - 1]++;
    });
    return counts.map(function (c, i) { return { label: (i + 1) + '月', value: c }; });
  }

  /* 折线图 */
  function renderLine(el, points, opts) {
    if (!el) return;
    opts = opts || {};
    points = points || [];
    if (!points.length) { el.innerHTML = '<div class="muted">暂无数据</div>'; return; }
    const w = 560, h = 200, padL = 30, padR = 12, padT = 14, padB = 26;
    const maxV = Math.max.apply(null, points.map(function (p) { return p.value; })) || 1;
    const n = points.length;
    const stepX = n > 1 ? (w - padL - padR) / (n - 1) : 0;
    const xy = points.map(function (p, i) {
      const x = padL + stepX * i;
      const y = padT + (h - padT - padB) * (1 - p.value / maxV);
      return { x: x, y: y, p: p };
    });
    const poly = xy.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    const area = 'M' + xy[0].x.toFixed(1) + ',' + (h - padB) + ' L' +
      xy.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' L ') +
      ' L' + xy[n - 1].x.toFixed(1) + ',' + (h - padB) + ' Z';

    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const y = padT + (h - padT - padB) * g / 4;
      grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(1) + '" class="chart-grid"/>';
    }
    const labelStep = Math.ceil(n / 6);
    let labels = '';
    xy.forEach(function (p, i) {
      if (i % labelStep === 0 || i === n - 1) {
        labels += '<text x="' + p.x.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" class="chart-xlabel">' + esc(p.p.label) + '</text>';
      }
    });
    const dots = xy.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" class="chart-dot"/>';
    }).join('');
    let values = '';
    if (opts.values) {
      values = xy.map(function (p) {
        return '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 7).toFixed(1) +
          '" text-anchor="middle" class="chart-value">' + p.p.value + '</text>';
      }).join('');
    }

    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="line-chart">' +
      grid +
      '<path d="' + area + '" class="chart-area"/>' +
      '<polyline points="' + poly + '" class="chart-line"/>' +
      dots + values + labels +
      '<text x="' + (padL - 6) + '" y="' + (padT + 4) + '" text-anchor="end" class="chart-ylabel">' + maxV + '</text>' +
      '<text x="' + (padL - 6) + '" y="' + (h - padB) + '" text-anchor="end" class="chart-ylabel">0</text>' +
      '</svg>';
  }

  function renderRecent(el, list, dateKey) {
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="muted">暂无</div>'; return; }
    el.innerHTML = list.map(function (g) {
      return '<div class="recent-item"><span class="nm" title="' + esc(g.name) + '">' + esc(g.name) + '</span>' +
        '<span class="dt">' + esc(toDateValue(g[dateKey]) || '—') + '</span></div>';
    }).join('');
  }


  root.VoidCharts = { CHART_COLORS, statsByKey, renderBars, renderDonut, monthlySeries, monthlySeriesYear, renderLine, renderRecent };
})(window);
