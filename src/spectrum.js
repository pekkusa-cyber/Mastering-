// Spektrumdiagram (SVG): staplar för huvudserien (nu/mastrad), linjer för referens och original.
// Kurvorna jämförs på formen: varje serie flyttas så att medel 200 Hz–5 kHz hamnar på 0 dB.
// Färger: validerad mörk palett (dataviz) – blå, orange, aqua; identitet visas också med legend och linjetyp.
import { BAND_CENTERS, BAND_EDGES } from './analysis.js';
import { esc } from './ui.js';

export const SERIES_COLORS = { main: '#3987e5', ref: '#d95926', orig: '#199e70' };
const W = 340, H = 180, PAD_L = 30, PAD_R = 8, PAD_T = 8, PAD_B = 22;
const Y_MAX = 12, Y_MIN = -30;

export function normalize(bands) {
  if (!bands) return null;
  const idx = BAND_CENTERS.map((f, i) => i).filter((i) => BAND_CENTERS[i] >= 200 && BAND_CENTERS[i] <= 5000);
  const off = idx.reduce((a, i) => a + bands[i], 0) / idx.length;
  return bands.map((v) => (Number.isFinite(v) ? v - off : Y_MIN));
}

const fLabel = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)} k` : `${Math.round(f)}`);
export const bandName = (i) => `${fLabel(BAND_EDGES[i])}–${fLabel(BAND_EDGES[i + 1])} Hz`;

/**
 * series: { main?: { label, bands }, ref?: { label, bands }, orig?: { label, bands } }.
 * Svarar SVG + legend. Tryck på ett band visar värdena (data-band).
 */
export function spectrumSvg(series, { id = 'spec', title = 'Spektrum' } = {}) {
  const n = BAND_CENTERS.length;
  const bw = (W - PAD_L - PAD_R) / n;
  const y = (v) => PAD_T + ((Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, v))) / (Y_MAX - Y_MIN)) * (H - PAD_T - PAD_B);
  const x = (i) => PAD_L + i * bw;
  const norm = {};
  for (const k of ['main', 'ref', 'orig']) norm[k] = series[k] ? normalize(series[k].bands) : null;

  const grid = [12, 0, -12, -24].map((v) => `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(v)}" y2="${y(v)}" class="grid${v === 0 ? ' zero' : ''}"/><text x="${PAD_L - 4}" y="${y(v) + 3}" class="ax" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>`).join('');
  const ticks = [100, 1000, 10000].map((f) => {
    const i = BAND_CENTERS.findIndex((c) => c >= f * 0.9);
    return `<text x="${x(i) + bw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${fLabel(f)}</text>`;
  }).join('');
  const zero = y(0);
  const bars = norm.main ? norm.main.map((v, i) => {
    const top = Math.min(y(v), zero), h = Math.max(1, Math.abs(y(v) - zero));
    return `<rect x="${x(i) + 1}" y="${top}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2" fill="${SERIES_COLORS.main}"/>`;
  }).join('') : '';
  const line = (k, dash) => (norm[k] ? `<polyline fill="none" stroke="${SERIES_COLORS[k]}" stroke-width="2" ${dash ? 'stroke-dasharray="4 3"' : ''} points="${norm[k].map((v, i) => `${x(i) + bw / 2},${y(v)}`).join(' ')}"/>` : '');
  const hits = Array.from({ length: n }, (_, i) => `<rect class="hit" data-band="${i}" x="${x(i)}" y="${PAD_T}" width="${bw}" height="${H - PAD_T - PAD_B}"/>`).join('');
  const legend = ['main', 'ref', 'orig'].filter((k) => series[k]).map((k) => `<span class="lg"><i class="sw sw-${k}" style="--c:${SERIES_COLORS[k]}"></i>${esc(series[k].label)}</span>`).join('');
  return `<div class="spec" data-spec="${esc(id)}">
    <div class="legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${ticks}${bars}${line('orig', true)}${line('ref', false)}${hits}</svg>
    <p class="hint small spec-read" aria-live="polite">Tryck på ett band för att se värdena.</p>
  </div>`;
}

/** Kopplar tryck på band → visa värdena under diagrammet. */
export function bindSpectrum(root, series) {
  root.querySelectorAll('.spec').forEach((el) => {
    const read = el.querySelector('.spec-read');
    el.querySelectorAll('.hit').forEach((h) => {
      h.addEventListener('click', () => {
        const i = Number(h.dataset.band);
        const parts = ['main', 'ref', 'orig'].filter((k) => series[k]).map((k) => {
          const v = normalize(series[k].bands)[i];
          return `${series[k].label} ${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
        });
        read.textContent = `${bandName(i)}: ${parts.join(' · ')}`;
        el.querySelectorAll('.hit.sel').forEach((x) => x.classList.remove('sel'));
        h.classList.add('sel');
      });
    });
  });
}
