/* ===========================================================
   charts.js — dependency-free SVG chart rendering
   =========================================================== */

const Charts = {

  renderBarChart(container, data, { color = "var(--accent)", height = 160 } = {}) {
    if (!data.length || data.every(d => d.value === 0)) {
      container.innerHTML = `<div class="chart-empty">No data yet</div>`;
      return;
    }
    const max = Math.max(1, ...data.map(d => d.value));
    const w = 100 / data.length;
    const bars = data.map((d, i) => {
      const barH = (d.value / max) * (height - 30);
      const x = i * w;
      return `
        <g class="bar-group">
          <rect x="${x + w * 0.15}%" y="${height - 20 - barH}" width="${w * 0.7}%" height="${barH}"
                fill="${color}" rx="3" class="bar-rect">
            <title>${d.label}: ${d.value}</title>
          </rect>
          <text x="${x + w * 0.5}%" y="${height - 20 - barH - 6}" text-anchor="middle" class="bar-value">${d.value || ""}</text>
          <text x="${x + w * 0.5}%" y="${height - 4}" text-anchor="middle" class="bar-label">${d.label}</text>
        </g>`;
    }).join("");

    container.innerHTML = `<svg viewBox="0 0 400 ${height}" preserveAspectRatio="none" class="bar-chart">${bars}</svg>`;
  },

  renderPieChart(container, data, { size = 180 } = {}) {
    if (!data.length) {
      container.innerHTML = `<div class="chart-empty">No applications yet</div>`;
      return;
    }
    const total = data.reduce((s, d) => s + d.value, 0);
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    let angle = -90;
    const slices = data.map(d => {
      const frac = d.value / total;
      const start = angle;
      const end = angle + frac * 360;
      angle = end;
      const large = frac > 0.5 ? 1 : 0;
      const [x1, y1] = polar(cx, cy, r, start);
      const [x2, y2] = polar(cx, cy, r, end);
      const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
      return `<path d="${path}" fill="${d.color}"><title>${d.label}: ${d.value}</title></path>`;
    }).join("");

    const legend = data.map(d => `
      <div class="pie-legend-item">
        <span class="dot" style="background:${d.color}"></span>
        <span class="legend-label">${d.label}</span>
        <span class="legend-value">${d.value}</span>
      </div>`).join("");

    container.innerHTML = `
      <div class="pie-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="pie-chart">${slices}</svg>
        <div class="pie-legend">${legend}</div>
      </div>`;
  },
};

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
