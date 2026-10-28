'use strict';
/* OmniTransit v5 — charts.js
 * กราฟ SVG แบบเบา: แท่งบาง (≤24px) มุมมน 4px ที่ปลายข้อมูล, เส้น 2px, กริดเส้นผม 1px ทึบ,
 * legend เสมอเมื่อ ≥2 ชุด, tooltip แบบ hover/focus, และตารางทวินสำหรับทุกกราฟ (ไม่กันค่าไว้ใน tooltip)
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  function fmt(v) {
    if (v == null) return '–';
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K';
    if (Number.isInteger(v)) return String(v);
    return (Math.round(v * 100) / 100).toString();
  }

  /** กราฟแท่งกลุ่ม: groups=[{label, values:[v0,v1..]}], series=[{name,color}] */
  function groupedBar(host, opt) {
    const { groups, series, unit = '', goalLine = null, goalLabel = '' } = opt;
    const W = Math.max(320, host.clientWidth || 480), H = 210;
    const padL = 44, padR = 10, padT = 14, padB = 34;
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': opt.ariaLabel || 'กราฟแท่งเปรียบเทียบ' }, null);
    host.appendChild(svg);
    const maxV = niceMax(Math.max(0.001, ...groups.flatMap((g) => g.values.filter((v) => v != null)), goalLine || 0) * 1.12);
    const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const vv = (maxV / 4) * i;
      el('line', { x1: padL, x2: W - padR, y1: y(vv), y2: y(vv), class: 'gridline' }, svg);
      const t = el('text', { x: padL - 6, y: y(vv) + 4, 'text-anchor': 'end' }, svg);
      t.textContent = fmt(vv);
    }
    if (goalLine != null) {
      el('line', { x1: padL, x2: W - padR, y1: y(goalLine), y2: y(goalLine), stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': 'none', opacity: 0.65 }, svg);
      const t = el('text', { x: W - padR, y: y(goalLine) - 4, 'text-anchor': 'end', style: 'fill:var(--ink); font-weight:700;' }, svg);
      t.textContent = goalLabel;
    }
    // bars
    const gw = (W - padL - padR) / groups.length;
    const barW = Math.min(24, (gw * 0.72) / series.length);
    const gap = 2; // ช่องไฟสีพื้นระหว่างแท่งที่ชิดกัน
    groups.forEach((g, gi) => {
      const gx = padL + gi * gw + (gw - (barW * series.length + gap * (series.length - 1))) / 2;
      g.values.forEach((v, si) => {
        if (v == null) return;
        const h = Math.max(2, y(0) - y(v));
        const x0 = gx + si * (barW + gap);
        el('path', {
          d: `M${x0},${y(0)} L${x0},${y(v) + 4} Q${x0},${y(v)} ${x0 + 4},${y(v)} L${x0 + barW - 4},${y(v)} Q${x0 + barW},${y(v)} ${x0 + barW},${y(v) + 4} L${x0 + barW},${y(0)} Z`,
          fill: series[si].color,
        }, svg);
        // direct label เฉพาะค่าที่สูงสุดของกลุ่ม (เลือกอย่างจำกัด)
        if (v === Math.max(...g.values.filter((x) => x != null))) {
          const t = el('text', { x: x0 + barW / 2, y: y(v) - 5, 'text-anchor': 'middle', style: 'fill:var(--ink-2); font-weight:700;' }, svg);
          t.textContent = fmt(v);
        }
        const hit = el('rect', { x: x0 - 6, y: padT, width: barW + 12, height: H - padT - padB, fill: 'transparent', tabindex: 0, role: 'img', 'aria-label': `${g.label} ${series[si].name}: ${fmt(v)} ${unit}` }, svg);
        const tip = document.createElement('div');
        tip.className = 'chart-tooltip';
        host.appendChild(tip);
        const show = () => {
          tip.style.display = 'block';
          tip.innerHTML = `<b>${g.label}</b><br>${series[si].name}: <b>${fmt(v)} ${unit}</b>`;
          const r = host.getBoundingClientRect();
          tip.style.left = Math.min(r.width - 130, (x0 / W) * r.width) + 'px';
          tip.style.top = ((y(v) / H) * r.height - 40) + 'px';
        };
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', () => tip.style.display = 'none');
        hit.addEventListener('blur', () => tip.style.display = 'none');
      });
      const t = el('text', { x: padL + gi * gw + gw / 2, y: H - 12, 'text-anchor': 'middle' }, svg);
      t.textContent = g.label;
    });
    // baseline
    el('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: 'baseline-line' }, svg);
    if (series.length >= 2) addLegend(host, series);
    addTable(host, groups, series, unit);
  }

  /** กราฟเส้น: series=[{name,color,points:[{x,y}]}] */
  function lineChart(host, opt) {
    const { series, unit = '', yMinZero = true } = opt;
    const W = Math.max(320, host.clientWidth || 480), H = 220;
    const padL = 44, padR = 12, padT = 14, padB = 30;
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': opt.ariaLabel || 'กราฟเส้น' }, null);
    host.appendChild(svg);
    const pts = series.flatMap((s) => s.points);
    if (!pts.length) { host.innerHTML = '<p class="muted small">ยังไม่มีข้อมูลพอสำหรับกราฟ</p>'; return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = yMinZero ? 0 : Math.min(...ys) * 0.9;
    const y1 = niceMax(Math.max(...ys) * 1.1);
    const X = (x) => padL + ((x - x0) / ((x1 - x0) || 1)) * (W - padL - padR);
    const Y = (v) => padT + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - padT - padB);
    for (let i = 0; i <= 4; i++) {
      const vv = y0 + ((y1 - y0) / 4) * i;
      el('line', { x1: padL, x2: W - padR, y1: Y(vv), y2: Y(vv), class: 'gridline' }, svg);
      const t = el('text', { x: padL - 6, y: Y(vv) + 4, 'text-anchor': 'end' }, svg);
      t.textContent = fmt(vv);
    }
    // เส้นเป้าหมาย (เช่น รอบ 8 นาที)
    if (opt.goalLine != null && opt.goalLine >= y0 && opt.goalLine <= y1) {
      el('line', { x1: padL, x2: W - padR, y1: Y(opt.goalLine), y2: Y(opt.goalLine), stroke: 'var(--ink)', 'stroke-width': 1.5, opacity: 0.6 }, svg);
      const gt = el('text', { x: padL + 4, y: Y(opt.goalLine) - 4, style: 'fill:var(--ink); font-weight:700;' }, svg);
      gt.textContent = opt.goalLabel || 'เป้าหมาย';
    }
    series.forEach((s) => {
      if (s.points.length < 2) return;
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      // จุดปลาย + วงแหวนสีพื้น 2px
      const lastP = s.points[s.points.length - 1];
      el('circle', { cx: X(lastP.x), cy: Y(lastP.y), r: 4.5, fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
      const lt = el('text', { x: X(lastP.x) - 6, y: Y(lastP.y) - 8, 'text-anchor': 'end', style: 'fill:var(--ink-2); font-weight:700;' }, svg);
      lt.textContent = fmt(lastP.y);
      // hover: แถบจับย่างกว้างต่อจุด
      s.points.forEach((p) => {
        const hit = el('circle', { cx: X(p.x), cy: Y(p.y), r: 12, fill: 'transparent', tabindex: 0, 'aria-label': `${s.name}: ${fmt(p.y)} ${unit}` }, svg);
        const tip = document.createElement('div');
        tip.className = 'chart-tooltip';
        host.appendChild(tip);
        const show = () => {
          tip.style.display = 'block';
          tip.innerHTML = `<b>${s.name}</b><br>${fmt(p.y)} ${unit}`;
          const r = host.getBoundingClientRect();
          tip.style.left = Math.min(r.width - 120, (X(p.x) / W) * r.width) + 'px';
          tip.style.top = ((Y(p.y) / H) * r.height - 42) + 'px';
        };
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', () => tip.style.display = 'none');
        hit.addEventListener('blur', () => tip.style.display = 'none');
      });
    });
    el('line', { x1: padL, x2: W - padR, y1: Y(y0), y2: Y(y0), class: 'baseline-line' }, svg);
    if (series.length >= 2) addLegend(host, series);
    addTable(host, [{ label: 'ชุดข้อมูล', values: null }], series, unit, () => series.map((s) => s.points.map((p) => ({ x: p.x, y: p.y }))));
  }

  /** เส้นสแปกไลน์เล็ก (สำหรับ stat tile) — สีเทาเงา ปลายสีหลัก */
  function sparkline(points, accent) {
    if (!points || points.length < 2) return '';
    const W = 110, H = 30;
    const xs = points.map((_, i) => i);
    const ys = points;
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (i) => (i / (xs.length - 1)) * W;
    const Y = (v) => 3 + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - 6);
    const d = points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block;">
      <path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" opacity="0.5"/>
      <circle cx="${X(xs.length - 1)}" cy="${Y(ys[ys.length - 1])}" r="3.5" fill="${accent || 'var(--series-1)'}" stroke="var(--surface-1)" stroke-width="2"/>
    </svg>`;
  }

  function addLegend(host, series) {
    const div = document.createElement('div');
    div.className = 'chart-legend';
    div.innerHTML = series.map((s) => `<span class="key"><span class="swatch" style="background:${s.color}"></span>${OT.esc(s.name)}</span>`).join('');
    host.prepend(div);
  }

  /** ตารางทวิน — ทุกค่าในกราฟต้องอ่านได้จากตารางด้วย */
  function addTable(host, groups, series, unit, custom) {
    const det = document.createElement('details');
    det.className = 'mt';
    const rows = custom
      ? custom().map((pts, si) => `<tr><td>${OT.esc(series[si].name)}</td><td class="num">${pts.map((p) => fmt(p.y)).join(', ')}</td></tr>`).join('')
      : groups.map((g) => `<tr><td>${OT.esc(g.label)}</td>${g.values.map((v) => `<td class="num">${fmt(v)}${unit ? ' ' + unit : ''}</td>`).join('')}</tr>`).join('');
    det.innerHTML = `<summary class="small muted">ดูตารางข้อมูล (ทางเลือกที่อ่านง่าย/เข้าถึงได้)</summary>
      <table class="data"><thead><tr><th>${custom ? 'ชุด' : 'กลุ่ม'}</th>${custom ? '<th>ค่า</th>' : series.map((s) => `<th>${OT.esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    host.appendChild(det);
  }

  window.OTChart = { groupedBar, lineChart, sparkline };
})();
