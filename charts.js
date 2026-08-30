/* ===========================================================
   charts.js — dependency-free SVG chart rendering
   =========================================================== */

const Charts = {

  renderBarChart(container, data, { color = "var(--accent)" } = {}) {
    if (!data.length || data.every(d => d.value === 0)) {
      container.innerHTML = `<div class="chart-empty">No data yet</div>`;
      return;
    }
    // Plain HTML/CSS bars instead of an SVG viewBox: percentage-based
    // heights scale cleanly, and text renders at native size always — no
    // risk of the stretch/squish distortion that comes from scaling <text>
    // inside a non-uniformly-scaled SVG viewBox.
    const max = Math.max(1, ...data.map(d => d.value));
    const bars = data.map(d => {
      const pct = Math.max(2, Math.round((d.value / max) * 100));
      return `
        <div class="bar-col">
          <span class="bar-value">${d.value || ""}</span>
          <div class="bar-fill" style="height:${pct}%; background:${color}" title="${escapeHtmlChart(d.label)}: ${d.value}"></div>
          <span class="bar-axis-label">${escapeHtmlChart(d.label)}</span>
        </div>`;
    }).join("");

    container.innerHTML = `<div class="bar-chart-html">${bars}</div>`;
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

function escapeHtmlChart(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
