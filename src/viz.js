// Visualisering av inställningarna: klangkurva (EQ) och kompressionskurvor per band. Ritas om medan du drar.
// Klangkurvan: heldragen = dina EQ-band (pre + post), streckad aqua = hörlurskorrigering.
// Kompression: små diagram, ett per band (in-nivå → ut-nivå), så att färg inte behövs för att skilja banden.
import { EQ_CUTOFFS, MBC_NAMES, peqDb } from './chain.js';
import { gainComputer } from './dsp/dynamics.js';
import { THIRD_OCTAVE } from './headphones.js';
import { esc } from './ui.js';

const C = { main: '#3987e5', corr: '#199e70', grid: '#2c3038', zero: '#454b56' };
const FMIN = 20, FMAX = 20000;

/** Graf-EQ som mjuk kurva: bandens värde i bandets mitt, interpolerat i log-frekvens. */
function smoothCurve(cutoffs, gains) {
  const centers = cutoffs.map((hi, i) => Math.sqrt((i === 0 ? 20 : cutoffs[i - 1]) * Math.min(hi, 20000)));
  return (f) => {
    if (f <= centers[0]) return gains[0];
    if (f >= centers[centers.length - 1]) return gains[gains.length - 1];
    const i = centers.findIndex((c) => c > f);
    const t = (Math.log(f) - Math.log(centers[i - 1])) / (Math.log(centers[i]) - Math.log(centers[i - 1]));
    return gains[i - 1] + (gains[i] - gains[i - 1]) * t;
  };
}

/**
 * EQ-kurva. curves: [{ label, gains (per band), cutoffs, kind: 'main'|'corr' }]. Värden summeras per typ.
 */
export function eqCurveSvg({ pre, post, peq = null, corr = null, title = 'Klangkurva', range = 12 }) {
  const W = 340, H = 130, L = 26, R = 6, T = 6, B = 18;
  const n = 120;
  const fs = Array.from({ length: n }, (_, i) => FMIN * (FMAX / FMIN) ** (i / (n - 1)));
  const x = (f) => L + (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * (W - L - R);
  const y = (v) => T + ((range - Math.max(-range, Math.min(range, v))) / (2 * range)) * (H - T - B);
  const preF = smoothCurve(EQ_CUTOFFS, pre), postF = smoothCurve(EQ_CUTOFFS, post);
  const main = fs.map((f) => preF(f) + postF(f) + (peq ? peqDb(peq, f) : 0));
  const pts = (vals) => vals.map((v, i) => `${x(fs[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  let corrLine = '';
  if (corr) {
    const cf = smoothCurve(THIRD_OCTAVE.map((c) => c * 2 ** (1 / 6)), corr.gains.map((g) => g + corr.preamp));
    corrLine = `<polyline fill="none" stroke="${C.corr}" stroke-width="2" stroke-dasharray="4 3" points="${pts(fs.map(cf))}"/>`;
  }
  const grid = [range, range / 2, 0, -range / 2, -range].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? C.zero : C.grid}"/>${v % 6 === 0 ? `<text x="${L - 3}" y="${y(v) + 3}" class="ax" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>` : ''}`).join('');
  const ticks = [100, 1000, 10000].map((f) => `<text x="${x(f)}" y="${H - 5}" class="ax" text-anchor="middle">${f >= 1000 ? `${f / 1000} k` : f}</text>`).join('');
  const area = `<polygon fill="${C.main}" fill-opacity=".18" points="${x(FMIN)},${y(0)} ${pts(main)} ${x(FMAX)},${y(0)}"/>`;
  return `<div class="viz" data-viz="eq">
    <div class="legend"><span class="lg"><i class="sw sw-main" style="--c:${C.main}"></i>Din EQ</span>${corr ? `<span class="lg"><i class="sw sw-orig" style="--c:${C.corr}"></i>Hörlurskorrigering</span>` : ''}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${ticks}${area}<polyline fill="none" stroke="${C.main}" stroke-width="2" points="${pts(main)}"/>${corrLine}</svg>
  </div>`;
}

/** Ett litet diagram: in-nivå −60…0 dB mot ut-nivå, med tröskel och uppskattad kompression vid `levelDb`. */
function compMini({ name, threshold, ratio, knee, preGain = 0, postGain = 0, gr = null, off = false }) {
  const S = 96, P = 6;
  const x = (v) => P + ((v + 60) / 60) * (S - 2 * P);
  const y = (v) => S - P - ((Math.max(-60, Math.min(6, v)) + 60) / 66) * (S - 2 * P);
  const ins = Array.from({ length: 61 }, (_, i) => -60 + i);
  const out = ins.map((v) => (off ? v : v + preGain + gainComputer(v + preGain, threshold, ratio, knee) + postGain));
  const pts = ins.map((v, i) => `${x(v).toFixed(1)},${y(out[i]).toFixed(1)}`).join(' ');
  const thr = !off && ratio > 1.0001 ? `<line x1="${x(threshold - preGain)}" x2="${x(threshold - preGain)}" y1="${P}" y2="${S - P}" stroke="#7a6a45" stroke-dasharray="2 2"/>` : '';
  return `<figure class="mini${off ? ' off' : ''}">
    <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(name)}"><rect x="${P}" y="${P}" width="${S - 2 * P}" height="${S - 2 * P}" fill="none" stroke="${C.grid}"/>
      <line x1="${x(-60)}" y1="${y(-60)}" x2="${x(0)}" y2="${y(0)}" stroke="${C.zero}" stroke-dasharray="3 3"/>${thr}
      <polyline fill="none" stroke="${C.main}" stroke-width="2" points="${pts}"/></svg>
    <figcaption>${esc(name)}<br><b>${off ? 'av' : ratio <= 1.0001 ? 'ingen' : gr != null ? `−${gr.toFixed(1)} dB` : `${ratio.toFixed(1)}:1`}</b></figcaption>
  </figure>`;
}

/** Kompressionskurvor för multibandet (+ limitern/limmet). gr = uppskattad minskning per band (level.js). */
export function compCurvesSvg({ mbc, limiter = null, glue = null, gr = [], limGr = null, enabled = {} }) {
  const names = MBC_NAMES.map((n) => n.replace(/ \d.*$/, ''));
  const minis = mbc.map((b, i) => compMini({ name: names[i], ...b, gr: gr[i], off: enabled[`mbc${i}`] === false }));
  if (glue) minis.push(compMini({ name: 'Lim', threshold: glue.threshold, ratio: glue.ratio, knee: 6, postGain: glue.makeup }));
  if (limiter) minis.push(compMini({ name: 'Limiter', threshold: limiter.threshold, ratio: limiter.ratio, knee: 0, gr: limGr, off: enabled.limiter === false }));
  return `<div class="viz minis" data-viz="comp">${minis.join('')}</div>`;
}

/**
 * Graf för hörlurskorrigeringen: AutoEq-kurvan (det som kompenseras), appens tersband (det som läggs på) och
 * lurarnas egen avvikelse från neutralt (spegelbilden). Preamp/nivåkompensation visas i texten, inte i grafen.
 */
export function correctionGraphSvg({ freqs, exact, applied, title = 'Hörlurskorrigering', range = 12 }) {
  const W = 340, H = 150, L = 26, R = 6, T = 6, B = 18;
  const x = (f) => L + (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * (W - L - R);
  const y = (v) => T + ((range - Math.max(-range, Math.min(range, v))) / (2 * range)) * (H - T - B);
  const pts = (vals) => vals.map((v, i) => `${x(freqs[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const grid = [range, range / 2, 0, -range / 2, -range].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? C.zero : C.grid}"/>${v % 6 === 0 ? `<text x="${L - 3}" y="${y(v) + 3}" class="ax" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>` : ''}`).join('');
  const ticks = [100, 1000, 10000].map((f) => `<text x="${x(f)}" y="${H - 5}" class="ax" text-anchor="middle">${f >= 1000 ? `${f / 1000} k` : f}</text>`).join('');
  return `<div class="viz" data-viz="corr">
    <div class="legend"><span class="lg"><i class="sw sw-main" style="--c:${C.corr}"></i>Korrigering (AutoEq)</span><span class="lg"><i class="sw sw-ref" style="--c:#d95926"></i>Appens 31 band</span><span class="lg"><i class="sw sw-orig" style="--c:#9aa1ad"></i>Lurarnas avvikelse</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${ticks}
      <polyline fill="none" stroke="#9aa1ad" stroke-width="1.5" stroke-dasharray="3 3" points="${pts(exact.map((v) => -v))}"/>
      <polyline fill="none" stroke="#d95926" stroke-width="1.5" points="${pts(applied)}"/>
      <polyline fill="none" stroke="${C.corr}" stroke-width="2.5" points="${pts(exact)}"/></svg>
    <p class="hint small">Över linjen = appen höjer där (lurarna är svaga), under = sänker (lurarna är starka). Den streckade grå kurvan är hur lurarna låter utan korrigering jämfört med neutralt.</p>
  </div>`;
}
