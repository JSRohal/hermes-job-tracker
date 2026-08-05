/* ===========================================================
   charts.js — dependency-free SVG chart rendering
   =========================================================== */

const Charts = {

  renderBarChart(container, data, { color = "var(--accent)", height = 160 } = {}) {
    if (!data.length || data.every(d => d.value === 0)) {
      container.innerHTML = `<div class="chart-empty">No data yet</div>`;
      return;
    }
    const TOP_PAD = 18;   // reserves room for the value label above the tallest bar
    const BOTTOM_PAD = 22; // reserves room for the x-axis label
    const usable = height - TOP_PAD - BOTTOM_PAD;
    const max = Math.max(1, ...data.map(d => d.value));
    const w = 100 / data.length;
    const bars = data.map((d, i) => {
      const barH = (d.value / max) * usable;
      const barTop = height - BOTTOM_PAD - barH;
      const x = i * w;
      return `
        <g class="bar-group">
          <rect x="${x + w * 0.15}%" y="${barTop}" width="${w * 0.7}%" height="${barH}"
                fill="${color}" rx="3" class="bar-rect">
            <title>${d.label}: ${d.value}</title>
          </rect>
          <text x="${x + w * 0.5}%" y="${Math.max(TOP_PAD - 6, barTop - 6)}" text-anchor="middle" class="bar-value">${d.value || ""}</text>
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

    let shapes;
    if (data.length === 1) {
      // A single-slice "pie" can't be drawn as an SVG arc (the start and end
      // points coincide, producing a zero-length path), so draw a full circle.
      shapes = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${data[0].color}"><title>${data[0].label}: ${data[0].value}</title></circle>`;
    } else {
      let angle = -90;
      shapes = data.map(d => {
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
    }

    const legend = data.map(d => `
      <div class="pie-legend-item">
        <span class="dot" style="background:${d.color}"></span>
        <span class="legend-label">${d.label}</span>
        <span class="legend-value">${d.value}</span>
      </div>`).join("");

    container.innerHTML = `
      <div class="pie-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="pie-chart">${shapes}</svg>
        <div class="pie-legend">${legend}</div>
      </div>`;
  },
};

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
