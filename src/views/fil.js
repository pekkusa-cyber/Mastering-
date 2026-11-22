// Fil-vyn: välj låt → mål och preset → (matcha klang mot referens) → lyssna direkt medan du justerar →
// jämför versioner → exportera WAV. Album: mastra flera låtar med samma inställning och nivå.
import { isNative, LiveDsp } from '../livedsp.js';
import { ui, app } from '../state.js';
import { save, load } from '../store.js';
import { BUILTIN_PRESETS, EQ_CUTOFFS, MBC_CUTOFFS, MBC_NAMES, RANGES, bandLabel } from '../chain.js';
import { FILE_RANGES, MATCH_FREQS, TARGETS, applyFileEnables, fileNeutral, liveToFile, sanitizeFile } from '../master.js';
import { compareProfiles, matchEqCurve, profileFromChannels, toFileMatchEq } from '../analysis.js';
import { currentRef, selectRef } from '../refs.js';
import { ask, bindPicker, bindSliders, esc, fmtDb, getPath, infoBtn, picker, saveFile, setPath, slider, split, toggle, vfader } from '../ui.js';
import { spectrumSvg, bindSpectrum } from '../spectrum.js';
import { eqCurveSvg, compCurvesSvg } from '../viz.js';
import { decodeFile, mmss, resample } from '../audio.js';
import { AbPlayer, RealtimePlayer, renderInWorker } from '../filemaster.js';
import { encodeWav } from '../dsp/wav.js';
import { truePeak } from '../dsp/truepeak.js';
import { allPresets, presetGroups } from './live.js';
import { refGroups } from './analys.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const realtime = RealtimePlayer.supported();
const player = realtime ? new RealtimePlayer() : new AbPlayer();
const F = (ui.file = {
  name: '', input: null, profile: null, presetId: 'suno-fix', params: liveToFile(BUILTIN_PRESETS.find((p) => p.id === 'suno-fix').params),
  enabled: {}, mode: 'simple', matchAmount: 70, result: null, rendering: false, progress: 0, msg: '', ab: 'master', matched: true,
  bits: 24, rate: 44100, exportMsg: '', versions: [], versionId: '', album: [], albumMsg: '', albumBusy: false,
});
load('fileVersions', []).then((v) => { F.versions = v; });

const presetOf = (id) => allPresets().find((p) => p.id === id);
const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });
const en = (k) => F.enabled[k] !== false;
/** Inställningen som låter: avslagna delar neutrala. */
const effective = () => applyFileEnables(F.params, F.enabled);
/** ↺ och "Återställ alla" går tillbaka till: vald preset med valt mål. */
function presetFileParams() {
  const p = presetOf(F.presetId);
  // Orörd: ingen bearbetning – bara målnivån och true-peak-taket (som alltid måste hållas för en exportfil)
  if (!p || p.id === 'flat') return sanitizeFile({ ...fileNeutral(), target: F.params.target });
  return liveToFile(p.params, { target: F.params.target });
}
const matchGain = () => {
  const r = F.result;
  const g = r && F.matched ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
  return Number.isFinite(g) ? g : 1;
};

let renderTimer = 0;
/**
 * En ändring hörs direkt (realtidsspelaren). Mätare, spektrum och export räknas om först när du trycker Rendera
 * (F.stale visar att de är från före ändringen). Utan realtidsspelare (äldre telefoner) räknas det om automatiskt.
 */
function paramsChanged({ now = false } = {}) {
  F.params = sanitizeFile(F.params);
  F.rev = (F.rev || 0) + 1;
  if (realtime) player.setParams(effective(), F.result?.drive ?? 0);
  app.renderPart('fileViz');
  if (!F.input) return;
  if (now) { clearTimeout(renderTimer); renderTimer = setTimeout(doRender, 0); return; }
  if (realtime) {
    if (F.result && !F.stale) {
      F.stale = true;
      // Under ett drag i Klang får inget byggas om (då tappar reglaget greppet); övriga block ritas om så att Rendera syns
      if (ui.blocks?.fil === 'klang') app.renderPart('fileStatus'); else app.render();
    }
    return;
  }
  if (!F.result) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 900);
}

async function doRender() {
  if (!F.input) return;
  const mine = F.rev || 0;
  F.rendering = true; F.progress = 0; F.msg = '';
  app.renderPart('fileStatus');
  try {
    const r = await renderInWorker(F.input, effective(), (x) => { F.progress = x; app.renderPart('fileProgress'); });
    F.result = r;
    if (realtime) player.setParams(effective(), r.drive);
    else {
      const pos = player.position();
      player.setBuffer('master', r.channels, r.fs);
      if (player.playing) player.seek(pos);
    }
    player.setAb(F.ab, matchGain());
  } catch (e) {
    F.msg = `Mastringen misslyckades: ${e.message}`;
  }
  F.rendering = false;
  F.stale = (F.rev || 0) !== mine; // ändrades något under renderingen är resultatet redan föråldrat
  app.render();
}

// ---- Delar ----

const fpath = (key, label, range, info = key, enableKey = null) =>
  slider({ id: `f-${key.replace(/\./g, '-')}`, label, value: getPath(F.params, key), range, info, resetTo: getPath(presetFileParams(), key), kind: 'fpath', key,
    enable: enableKey ? { key: enableKey, on: en(enableKey) } : null });

/** EQ-band som lodräta fadrar (samma som i Live); allt annat i Fil är vågräta reglage. */
const fvpath = (key, label, short, range, info = key) => vfader({ id: `f-${key.replace(/\./g, '-')}`, label, short, value: getPath(F.params, key), range, info,
  resetTo: getPath(presetFileParams(), key), kind: 'fpath', key, buttons: false });
const fEqRow = (items) => `<div class="faders adv" style="--n:${items.length}">${items.join('')}</div>`;
const EQ_SHORT_F = ['60', '120', '250', '500', '1k', '3k', '8k', '20k'];

function simpleControls() {
  return `${fpath('kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch, 'kickPunch', 'kick')}
    ${fpath('deEss', 'S-ljud (de-esser)', FILE_RANGES.deEss, 'fileDeEss', 'deEss')}
    ${fpath('glitter', 'Mjuk topp', FILE_RANGES.glitter, 'fileGlitter', 'glitter')}
    ${fpath('clip', 'Soft clip', FILE_RANGES.clip, 'clip', 'clip')}
    ${fpath('glue.ratio', 'Lim', FILE_RANGES.glueRatio, 'glueRatio', 'glue')}
    ${fpath('width', 'Stereobredd', FILE_RANGES.width, 'width', 'width')}`;
}

const sec = (id, title, info, body, { open = false, enableKey = null } = {}) =>
  `<details class="sec${enableKey && !en(enableKey) ? ' off' : ''}" data-sec="f-${id}" ${open ? 'open' : ''}><summary>${enableKey ? toggle(enableKey, en(enableKey), title) : ''}${esc(title)}${infoBtn(info, `Om ${title}`)}</summary><div class="secbody">${body}</div></details>`;

function vizPart(kind) {
  const p = effective();
  if (kind === 'eq') return eqCurveSvg({ pre: p.preEq.map((b, i) => b.gain), post: p.postEq.map((b) => b.gain) });
  return compCurvesSvg({ mbc: p.mbc, glue: p.glue, enabled: Object.fromEntries(MBC_CUTOFFS.map((_, i) => [`mbc${i}`, en(`mbc${i}`)])) });
}

function advancedControls() {
  const eq = (k) => fEqRow(EQ_CUTOFFS.map((_, i) => fvpath(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), EQ_SHORT_F[i], RANGES.eqGain)));
  const match = fEqRow(MATCH_FREQS.map((f, i) => fvpath(`matchEq.${i}.gain`, f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, f >= 1000 ? `${f / 1000}k` : `${f}`, FILE_RANGES.matchGain)));
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band${en(`mbc${i}`) ? '' : ' off'}"><summary>${toggle(`mbc${i}`, en(`mbc${i}`), MBC_NAMES[i])}${esc(MBC_NAMES[i])}${infoBtn(`mbcBand${i}`)}</summary>
      ${fpath(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}${fpath(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${fpath(`mbc.${i}.attack`, 'Attack', RANGES.attack)}${fpath(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${fpath(`mbc.${i}.knee`, 'Knä', RANGES.knee)}${fpath(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${fpath(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
      ${i === 0 ? fpath('kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch, 'kickPunch', 'kick') : ''}</details>`).join('');
  return `<div class="vizbox" data-fviz="eq">${vizPart('eq')}</div>
    ${sec('trim', 'Ingång', 'trim', fpath('trim', 'Trim', FILE_RANGES.trim), { open: true, enableKey: 'trim' })}
    ${sec('preEq', 'Pre-EQ', 'sec_preEq', eq('preEq'), { enableKey: 'preEq' })}
    ${sec('match', 'Match-EQ', 'matchEq', match, { enableKey: 'match' })}
    ${sec('mbc', 'Multiband-kompressor', 'sec_mbc', `<div class="vizbox" data-fviz="comp">${vizPart('comp')}</div>${mbc}`)}
    ${sec('postEq', 'Post-EQ', 'sec_postEq', eq('postEq'), { enableKey: 'postEq' })}
    ${sec('deEss', 'S-ljud (de-esser)', 'fileDeEss', fpath('deEss', 'Mängd', FILE_RANGES.deEss, 'fileDeEss'), { enableKey: 'deEss' })}
    ${sec('glitter', 'Mjuk topp', 'fileGlitter', fpath('glitter', 'Mängd', FILE_RANGES.glitter, 'fileGlitter'), { enableKey: 'glitter' })}
    ${sec('width', 'Stereobredd', 'width', fpath('width', 'Stereobredd', FILE_RANGES.width), { enableKey: 'width' })}
    ${sec('glue', 'Lim (buss-kompressor)', 'sec_glue', `${fpath('glue.threshold', 'Tröskel', FILE_RANGES.glueThreshold)}${fpath('glue.ratio', 'Ratio', FILE_RANGES.glueRatio)}
      ${fpath('glue.attack', 'Attack', FILE_RANGES.glueAttack)}${fpath('glue.release', 'Release', FILE_RANGES.glueRelease)}${fpath('glue.makeup', 'Make-up', FILE_RANGES.glueMakeup)}`, { enableKey: 'glue' })}
    ${sec('clip', 'Soft clipper', 'clip', fpath('clip', 'Soft clip', FILE_RANGES.clip), { enableKey: 'clip' })}
    ${sec('lim', 'Limiter (alltid på)', 'sec_limiter', `${fpath('ceiling', 'Tak (true peak)', FILE_RANGES.ceiling)}
      ${fpath('limRelease', 'Release', FILE_RANGES.limRelease)}${F.params.target === 'egen' ? fpath('drive', 'Drive', FILE_RANGES.drive) : ''}`)}
    ${sec('out', 'Utgång', 'output', fpath('output', 'Utgång', FILE_RANGES.output), { enableKey: 'output' })}`;
}

function statusPart() {
  if (F.rendering) return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(F.progress * 100)}"><i style="width:${Math.round(F.progress * 100)}%"></i></div><p class="hint" data-testid="fprog">Räknar mätare och export… ${Math.round(F.progress * 100)} %</p>`;
  if (F.msg) return `<p class="bad" id="fmsg">${esc(F.msg)}</p>`;
  if (!F.result) return `<button class="btn primary wide" data-render ${F.input ? '' : 'disabled'}>Rendera</button>`;
  if (F.stale) return `<p class="hint small stale">Ändrat sedan senaste renderingen – mätare och export visar det gamla. Du hör ändringen direkt.</p><button class="btn primary wide" data-render>Rendera</button>`;
  return `<p class="hint small">${realtime ? 'Ändringar hörs direkt. Tryck Rendera när du är nöjd – då uppdateras mätare och export.' : 'Ändringar mastras om automatiskt.'}</p>`;
}

function meters() {
  const r = F.result;
  if (!r) return '';
  const row = (label, a, b, unit, plain = false) => {
    const f = (v) => (plain ? (Number.isFinite(v) ? v.toFixed(1) : '–') : fmtDb(v));
    return `<tr><th>${label}</th><td>${f(a)}</td><td><b>${f(b)}</b></td><td>${unit}</td></tr>`;
  };
  const o = r.original, m = r.metrics;
  return `<section class="card" id="meters">
    <h2>Mätare ${infoBtn('meters')}</h2>
    <table class="meters" data-testid="meters">
      <thead><tr><th></th><th>Original</th><th>Mastrad</th><th></th></tr></thead>
      <tbody>
        ${row('Loudness', o.integrated, m.integrated, 'LUFS')}
        ${row('Short-term max', o.shortTermMax, m.shortTermMax, 'LUFS')}
        ${row('True peak', o.truePeak, m.truePeak, 'dBTP')}
        ${row('Loudness range', o.lra, m.lra, 'LU', true)}
      </tbody>
    </table>
    <p class="hint small">Limitern sänkte som mest ${r.gr.limiter.toFixed(1)} dB · drive ${fmtDb(r.drive)} dB${r.gr.glue > 0.05 ? ` · lim ${r.gr.glue.toFixed(1)} dB` : ''}${r.gr.deEss > 0.05 ? ` · s-ljud −${r.gr.deEss.toFixed(1)} dB` : ''}.</p>
  </section>`;
}

function monoCard() {
  const r = F.result;
  if (!r?.stereo) return '';
  const s = r.stereo, o = r.originalStereo;
  const meter = (corr) => `<span class="corr"><i style="left:${((corr + 1) / 2) * 100}%"></i></span>`;
  return `<section class="card" id="mono">
    <h2>Mono och fas ${infoBtn('mono')}</h2>
    <table class="meters" data-testid="mono">
      <thead><tr><th></th><th>Korrelation</th><th>Förlust i mono</th></tr></thead>
      <tbody>
        <tr><th>Hela låten</th><td>${meter(s.corr)} ${s.corr.toFixed(2)}</td><td>${s.monoLoss.toFixed(1)} dB</td></tr>
        ${s.bands.map((b) => `<tr><th>${esc(b.name)}</th><td>${meter(b.corr)} ${b.corr.toFixed(2)}</td><td>${b.monoLoss.toFixed(1)} dB</td></tr>`).join('')}
      </tbody>
    </table>
    ${s.warnings.length ? `<ul class="tips">${s.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="ok small">✓ Låten håller i mono.</p>'}
    <p class="hint small">Originalet: korrelation ${o.corr.toFixed(2)}, ${o.monoLoss.toFixed(1)} dB i mono.</p>
  </section>`;
}

/** Vågformen (toppar i 200 bitar), räknas en gång per låt. */
function waveform() {
  if (!F.input) return null;
  if (F._wave?.src === F.input) return F._wave.peaks;
  const ch = F.input.channels, n = ch[0].length, bins = 200, per = Math.max(1, Math.floor(n / bins));
  const peaks = Array.from({ length: bins }, (_, b) => {
    let m = 0;
    for (let i = b * per, e = Math.min(n, (b + 1) * per); i < e; i += 4) for (const c of ch) { const v = Math.abs(c[i]); if (v > m) m = v; }
    return m;
  });
  F._wave = { src: F.input, peaks };
  return peaks;
}

/** Spelaren överst: vågform (tryck/dra för att spola), spela/paus, stopp, tid, A/B och lika nivå. */
function playerCard() {
  if (!F.input) return '';
  const pos = player.position(), dur = player.duration || 1;
  const peaks = waveform();
  const top = Math.max(...peaks, 1e-6);
  const bars = peaks.map((v, i) => { const h = Math.max(1, (v / top) * 46); return `<rect x="${i}" y="${(50 - h / 2).toFixed(1)}" width="0.7" height="${h.toFixed(1)}"/>`; }).join('');
  return `<section class="card" id="player">
    <div class="wave" id="f-wave" role="slider" aria-label="Position" aria-valuemin="0" aria-valuemax="${dur.toFixed(1)}" aria-valuenow="${pos.toFixed(1)}" style="--pos:${((pos / dur) * 100).toFixed(2)}%">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">${bars}</svg><i class="head"></i></div>
    <div class="row transport">
      <button class="btn" id="f-play" aria-label="${player.playing ? 'Paus' : 'Spela'}">${player.playing ? '❚❚' : '▶'}</button>
      <button class="btn" id="f-stop" aria-label="Stopp">■</button>
      <button class="btn${F.stale || !F.result ? ' primary' : ''}" id="f-render-top" data-render ${F.rendering ? 'disabled' : ''}>Rendera</button>
      <span class="dim small" id="f-time">${mmss(pos)} / ${mmss(player.duration)}</span>
      <span class="grow"></span>${realtime ? `<span class="ok small">● direkt${infoBtn('realtime')}</span>` : ''}
    </div>
    <div class="row abrow">
      <div class="seg ab" role="tablist">
        <button data-ab="orig" class="${F.ab === 'orig' ? 'sel' : ''}">A · Original</button>
        <button data-ab="master" class="${F.ab === 'master' ? 'sel' : ''}">B · Mastrad</button>
      </div>
      <label class="switch small"><input type="checkbox" id="f-matched" ${F.matched ? 'checked' : ''}> Lika nivå</label>${infoBtn('ab')}
    </div>
  </section>`;
}

function versionsCard() {
  if (!F.input) return '';
  return `<section class="card" id="versions">
    <div class="row"><h2>Versioner ${infoBtn('versions')}</h2><span class="grow"></span><button class="btn small" id="v-save">Spara version</button></div>
    ${F.versions.length ? `<div class="chips">${F.versions.map((v, i) => `<button class="chip ${v.id === F.versionId ? 'sel' : ''}" data-version="${esc(v.id)}"><b>${'ABCDEF'[i] || i + 1}</b> ${esc(v.name)}${v.lufs != null ? `<span class="small dim"> ${v.lufs.toFixed(1)} LUFS</span>` : ''}</button>`).join('')}</div>
      <p class="hint small">Tryck på en version för att lyssna på den direkt. Håll på ✕ för att ta bort.</p>
      <div class="btnrow">${F.versions.map((v) => `<button class="btn small ghost" data-vdel="${esc(v.id)}" aria-label="Ta bort ${esc(v.name)}">✕ ${esc(v.name)}</button>`).join('')}</div>`
      : '<p class="hint small">Spara olika inställningar som versioner och växla mellan dem medan låten spelar.</p>'}
  </section>`;
}

function analysisCard() {
  if (!F.profile) return '';
  const ref = currentRef();
  const series = { main: { label: F.result ? 'Mastrad' : 'Original', bands: (F.result?.profile || F.profile).bands } };
  if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
  if (F.result) series.orig = { label: 'Original', bands: F.profile.bands };
  let verdict = '';
  if (ref) {
    const c = compareProfiles(F.result?.profile || F.profile, ref.profile);
    const icon = { ok: '✓', lite: '!', mycket: '✕' };
    verdict = `<div class="verdict ${c.verdict}" data-testid="fverdict"><b>${esc(c.summary)}</b>${infoBtn('verdict')}</div>
      <ul class="regions">${c.regions.map((r) => `<li class="${r.status}"><span class="ic">${icon[r.status]}</span><b>${esc(r.name)}</b> ${esc(r.text)}</li>`).join('')}</ul>`;
  }
  return `<section class="card" id="fanalys">
    <div class="row"><h2>Klang mot referens ${infoBtn('verdict')}</h2></div>
    ${picker({ id: 'f-ref', label: 'Referens för filen', value: ui.refId, groups: refGroups(), placeholder: 'Ingen referens' })}
    ${spectrumSvg(series, { id: 'file', title: 'Spektrum för filen' })}
    ${verdict}
    ${ref ? `${slider({ id: 'f-matchamount', label: 'Hur mycket att matcha', value: F.matchAmount, range: [0, 100, 5, '%'], info: 'matchAmount', resetTo: 70, kind: 'amount', key: 'amount' })}
      <div class="btnrow"><button class="btn small primary" id="f-match">Matcha klang mot referensen</button><button class="btn small" id="f-match-reset">Nollställ match-EQ</button></div>`
      : '<p class="hint small">Välj eller spara en referens (Analys) för att jämföra och matcha klangen.</p>'}
  </section>`;
}

function exportCard() {
  if (!F.result) return '';
  return `<section class="card" id="export">
    <div class="row"><h2>Exportera ${infoBtn('export')}</h2></div>
    <div class="seg"><button data-bits="24" class="${F.bits === 24 ? 'sel' : ''}">24 bit</button><button data-bits="16" class="${F.bits === 16 ? 'sel' : ''}">16 bit</button></div>
    <div class="seg"><button data-rate="44100" class="${F.rate === 44100 ? 'sel' : ''}">44,1 kHz</button><button data-rate="48000" class="${F.rate === 48000 ? 'sel' : ''}">48 kHz</button></div>
    ${F.stale ? '<p class="hint stale">Ändrat sedan senaste renderingen – rendera först så att filen får dina ändringar.</p><button class="btn primary wide" data-render>Rendera</button>' : '<button class="btn primary wide" id="f-export">Exportera WAV</button>'}
    ${F.exportMsg ? `<p class="hint" id="f-exportmsg">${esc(F.exportMsg)}</p>` : ''}
  </section>`;
}

function albumCard() {
  return `<section class="card" id="album">
    <div class="row"><h2>Album ${infoBtn('album')}</h2></div>
    <p class="hint small">Mastra flera låtar med samma inställning och mål – så att de låter lika högt efter varandra. Varje låt exporteras som WAV (${F.bits} bit, ${F.rate === 44100 ? '44,1' : '48'} kHz).</p>
    <label class="btn wide file">Välj låtar till album<input type="file" id="a-files" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" multiple hidden></label>
    ${F.album.length ? `<table class="meters" data-testid="album"><thead><tr><th>Låt</th><th>LUFS</th><th>dBTP</th><th></th></tr></thead><tbody>
      ${F.album.map((t) => `<tr><th>${esc(t.name)}</th><td>${t.lufs != null ? t.lufs.toFixed(1) : '–'}</td><td>${t.tp != null ? t.tp.toFixed(1) : '–'}</td><td class="small">${esc(t.status)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${F.album.length && !F.albumBusy ? '<button class="btn primary wide" id="a-run">Mastra och exportera alla</button>' : ''}
    ${F.albumMsg ? `<p class="hint" id="a-msg">${esc(F.albumMsg)}</p>` : ''}
  </section>`;
}

const F_BLOCKS = () => [
  { id: 'lat', label: 'Låt', sub: F.input ? 'vald' : 'välj' },
  { id: 'klang', label: 'Klang', sub: 'preset' },
  { id: 'mat', label: 'Mätare', sub: F.result ? `${F.result.metrics.integrated.toFixed(1)} LUFS` : '–' },
  { id: 'export', label: 'Exportera', sub: 'WAV' },
];
const fBlock = () => (F_BLOCKS().some((b) => b.id === ui.blocks?.fil) ? ui.blocks.fil : 'lat');

/** Överst: spelaren (A/B) – alltid där medan man ändrar, så att man hör och ser samma sak. */
function filTop() {
  if (!F.input) return `<div class="lbl"><b>Fil</b> · mastring för släpp</div><div class="ovw"><p class="hint">Välj en låt (MP3/WAV) i blocket <b>Låt</b>. Den mastras direkt med vald preset och mål – allt sker på telefonen.</p></div>`;
  const r = F.result;
  // Långa filnamn kortas med … (hela namnet finns i title och i blocket Låt); mätvärdena får alltid plats
  return `<div class="lbl"><b class="trunc" title="${esc(F.name)}">${esc(F.name.replace(/\.[a-z0-9]+$/i, ''))}</b>${r ? `<span class="grow"></span><span class="nowrap">${r.metrics.integrated.toFixed(1)} LUFS · ${fmtDb(r.metrics.truePeak)} dBTP</span>` : ''}</div><div class="ovw fplayer">${playerCard()}</div>`;
}

export function filView() {
  const b = fBlock();
  const panels = {
    lat: () => `<section class="card">
      <div class="phead"><b>Låt</b></div>
      <label class="btn wide file ${F.input ? '' : 'primary'}">${F.input ? 'Byt låt' : 'Välj låt (MP3/WAV)'}<input type="file" id="f-file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      ${F.input ? `<p class="hint" data-testid="fname">${esc(F.name)} · ${mmss(F.input.channels[0].length / F.input.fs)}</p>` : '<p class="hint small">Låten stannar på telefonen – inget laddas upp.</p>'}
    </section>${versionsCard()}${albumCard()}`,
    klang: () => `<section class="card">
      <div class="phead"><b>Mål</b>${infoBtn('fileTarget')}</div>
      <div class="seg">${TARGETS.map((t) => `<button data-target="${t.id}" class="${F.params.target === t.id ? 'sel' : ''}">${t.name}${t.lufs ? ` ${t.lufs}` : ''}</button>`).join('')}</div>
      <div class="phead" style="margin-top:8px"><b>Preset</b>${infoBtn('liveVsFile', 'Live och fil')}</div>
      ${picker({ id: 'f-preset', label: 'Preset för filen', value: F.presetId, groups: presetGroups({ withTest: false }), placeholder: '(egen inställning)' })}
      <div class="seg" role="tablist" style="margin-top:10px">
        <button data-fmode="simple" class="${F.mode === 'simple' ? 'sel' : ''}">Enkelt</button>
        <button data-fmode="advanced" class="${F.mode === 'advanced' ? 'sel' : ''}">Avancerat</button>
      </div>
      <div id="fcontrols">${F.mode === 'simple' ? simpleControls() : advancedControls()}</div>
      <div class="btnrow"><button class="btn small" id="f-reset-all">Återställ alla</button><button class="btn small" id="f-flat">Platt</button><button class="btn small" id="f-all-on">Slå på allt</button></div>
      <div id="fileStatus">${statusPart()}</div>
    </section>${analysisCard()}`,
    mat: () => (F.result ? `${F.stale ? '<p class="hint small stale">Mätarna visar förra renderingen – du hör ändringarna direkt. Tryck Rendera för att uppdatera.</p><button class="btn primary wide" data-render>Rendera</button>' : ''}${meters()}${monoCard()}` : `<div class="phead"><b>Mätare</b></div><div id="fileStatus">${statusPart()}</div><p class="hint">Mätarna visas när låten är mastrad.</p>`),
    export: () => (F.result ? exportCard() : '<div class="phead"><b>Exportera</b></div><p class="hint">Välj och mastra en låt först.</p>'),
  };
  return split({ view: 'fil', top: filTop(), blocks: F_BLOCKS(), active: b, panel: panels[b](), topCls: F.input ? 'fil' : 'short' });
}

export function renderFilePart(root, part) {
  if (part === 'fileStatus' || part === 'fileProgress') {
    const el = root.querySelector('#fileStatus');
    if (el) { el.innerHTML = statusPart(); bindRender(el); }
    const top = root.querySelector('#f-render-top');
    if (top) { top.classList.toggle('primary', !!F.stale || !F.result); top.disabled = !!F.rendering; }
  }
  if (part === 'fileTime') {
    const t = root.querySelector('#f-time'), w = root.querySelector('#f-wave');
    if (t) t.textContent = `${mmss(player.position())} / ${mmss(player.duration)}`;
    if (w) { w.style.setProperty('--pos', `${((player.position() / (player.duration || 1)) * 100).toFixed(2)}%`); w.setAttribute('aria-valuenow', player.position().toFixed(1)); }
  }
  if (part === 'fileViz') root.querySelectorAll('[data-fviz]').forEach((el) => { el.innerHTML = vizPart(el.dataset.fviz); });
}

const bindRender = (el) => el.querySelectorAll('[data-render]').forEach((b) => { b.onclick = () => paramsChanged({ now: true }); });

let ticker = 0;
/**
 * Fil-uppspelningen går ut genom telefonen – då skulle live-motorn mastra den en gång till. Medan Fil spelar
 * pausas därför live-mastringen (Masterlab av); hörlurskorrigeringen ligger kvar. Återställs vid paus/byte av vy.
 */
let livePaused = false;
async function pauseLive() {
  if (!LiveDsp || livePaused || !ui.status?.running || ui.status?.bypass) return;
  livePaused = true;
  ui.status = await LiveDsp.setBypass({ on: true });
}
async function resumeLive() {
  if (!LiveDsp || !livePaused) return;
  livePaused = false;
  ui.status = await LiveDsp.setBypass({ on: false });
}
export function stopFilePlayback() { player.pause(); clearInterval(ticker); resumeLive(); }

async function exportWav(channels, fs, baseName) {
  let ch = await resample(channels, fs, F.rate);
  // Omsamplingen kan flytta toppar mellan samplen en aning – håll taket även efter den
  const ceil = 10 ** (F.params.ceiling / 20), tp = truePeak(ch);
  if (tp > ceil) { const k = ceil / tp; ch = ch.map((c) => c.map((v) => v * k)); }
  const wav = encodeWav(ch, F.rate, F.bits);
  const name = `${baseName.replace(/\.[^.]+$/, '') || 'master'} - master ${F.bits}bit ${F.rate === 44100 ? '44k' : '48k'}.wav`;
  return { name, how: await saveFile(name, wav, 'audio/wav', fileDeps()) };
}

async function runAlbum() {
  F.albumBusy = true;
  const p = effective();
  for (const t of F.album) {
    try {
      t.status = 'läser…'; app.render();
      const a = await decodeFile(t.file);
      t.status = 'mastrar…'; app.render();
      const r = await renderInWorker({ channels: a.channels, fs: a.fs }, p, () => {});
      t.lufs = r.metrics.integrated; t.tp = r.metrics.truePeak;
      t.status = 'exporterar…'; app.render();
      await exportWav(r.channels, r.fs, t.name);
      t.status = '✓ klar';
    } catch (e) { t.status = `fel: ${e.message}`; }
    app.render();
  }
  const ok = F.album.filter((t) => t.status === '✓ klar');
  const spread = ok.length > 1 ? Math.max(...ok.map((t) => t.lufs)) - Math.min(...ok.map((t) => t.lufs)) : 0;
  F.albumMsg = `${ok.length} av ${F.album.length} låtar klara. Nivåskillnad mellan låtarna: ${spread.toFixed(1)} LU.`;
  F.albumBusy = false;
  app.render();
}

export function bindFil(root) {
  bindRender(root);
  (root.querySelector('#f-file') || {}).onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    stopFilePlayback();
    F.msg = ''; F.result = null; F.exportMsg = '';
    F.name = f.name;
    F.rendering = true; F.progress = 0;
    app.render();
    try {
      const a = await decodeFile(f);
      F.input = { channels: a.channels, fs: a.fs };
      F.profile = profileFromChannels(a.channels, a.fs);
      if (realtime) player.setBuffer(a.channels, a.fs);
      else { player.bufs = {}; player.setBuffer('orig', a.channels, a.fs); }
      F.rendering = false;
      await doRender();
    } catch (err) {
      F.rendering = false; F.input = null; F.msg = err.message;
      app.render();
    }
  };
  root.querySelectorAll('[data-target]').forEach((b) => {
    b.onclick = () => { F.params.target = b.dataset.target; F.params = sanitizeFile(F.params); app.render(); paramsChanged(); };
  });
  bindPicker(root, 'f-preset', () => ({ title: 'Preset för filen', value: F.presetId, groups: presetGroups({ withTest: false }) }), (v) => {
    F.presetId = v;
    const matchEq = F.params.matchEq;
    F.params = { ...presetFileParams(), matchEq };
    F.versionId = '';
    app.render();
    paramsChanged();
  });
  root.querySelectorAll('[data-fmode]').forEach((b) => { b.onclick = () => { F.mode = b.dataset.fmode; app.render(); }; });
  bindSliders(root, (kind, key, v) => {
    if (kind === 'fpath') { setPath(F.params, key, v); F.versionId = ''; paramsChanged(); }
    if (kind === 'amount') F.matchAmount = v;
  }, (key, on) => { F.enabled[key] = on; paramsChanged(); });
  (root.querySelector('#f-reset-all') || {}).onclick = () => { F.params = presetFileParams(); F.enabled = {}; app.render(); paramsChanged(); };
  (root.querySelector('#f-flat') || {}).onclick = () => { F.params = sanitizeFile({ ...fileNeutral(), target: F.params.target }); F.presetId = ''; app.render(); paramsChanged(); };
  (root.querySelector('#f-all-on') || {}).onclick = () => { F.enabled = {}; app.render(); paramsChanged(); };

  // Spelare
  root.querySelectorAll('[data-ab]').forEach((b) => {
    b.onclick = () => {
      F.ab = b.dataset.ab;
      player.setAb(F.ab, matchGain());
      root.querySelectorAll('[data-ab]').forEach((x) => x.classList.toggle('sel', x === b));
    };
  });
  const play = root.querySelector('#f-play');
  if (play) play.onclick = async () => {
    if (player.playing) { player.pause(); clearInterval(ticker); resumeLive(); }
    else {
      await pauseLive();
      if (realtime) player.setParams(effective(), F.result?.drive ?? 0);
      player.setAb(F.ab, matchGain());
      await player.play();
      clearInterval(ticker);
      ticker = setInterval(() => app.renderPart('fileTime'), 250);
      player.onEnd = () => { clearInterval(ticker); resumeLive(); app.render(); };
    }
    play.textContent = player.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', player.playing ? 'Paus' : 'Spela');
  };
  // Spola: tryck eller dra på vågformen
  const wave = root.querySelector('#f-wave');
  if (wave) {
    const to = (e) => { const r = wave.getBoundingClientRect(); player.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * player.duration); app.renderPart('fileTime'); };
    let down = false;
    wave.addEventListener('pointerdown', (e) => { down = true; try { wave.setPointerCapture(e.pointerId); } catch { /* */ } to(e); });
    wave.addEventListener('pointermove', (e) => { if (down) to(e); });
    wave.addEventListener('pointerup', () => { down = false; });
    wave.addEventListener('pointercancel', () => { down = false; });
  }
  const stop = root.querySelector('#f-stop');
  if (stop) stop.onclick = () => {
    player.pause(); player.seek(0); clearInterval(ticker); resumeLive();
    if (play) { play.textContent = '▶'; play.setAttribute('aria-label', 'Spela'); }
    app.renderPart('fileTime');
  };
  const matched = root.querySelector('#f-matched');
  if (matched) matched.onchange = () => { F.matched = matched.checked; player.setAb(F.ab, matchGain()); };

  // Versioner
  const vs = root.querySelector('#v-save');
  if (vs) vs.onclick = async () => {
    const name = await ask({ title: 'Spara version', value: `Version ${'ABCDEF'[F.versions.length] || F.versions.length + 1}`, okText: 'Spara' });
    if (name === null) return;
    const v = { id: `v-${Date.now().toString(36)}`, name: name.trim() || 'Version', params: structuredClone(F.params), enabled: { ...F.enabled }, presetId: F.presetId, lufs: F.result?.metrics.integrated ?? null };
    F.versions = [...F.versions, v].slice(-6);
    F.versionId = v.id;
    await save('fileVersions', F.versions);
    app.render();
  };
  root.querySelectorAll('[data-version]').forEach((b) => {
    b.onclick = () => {
      const v = F.versions.find((x) => x.id === b.dataset.version);
      F.params = sanitizeFile(v.params); F.enabled = { ...v.enabled }; F.presetId = v.presetId; F.versionId = v.id;
      app.render();
      paramsChanged();
    };
  });
  root.querySelectorAll('[data-vdel]').forEach((b) => {
    b.onclick = async () => { F.versions = F.versions.filter((v) => v.id !== b.dataset.vdel); await save('fileVersions', F.versions); app.render(); };
  });

  // Analys och match-EQ
  const ref = currentRef();
  if (F.profile) {
    const series = { main: { label: F.result ? 'Mastrad' : 'Original', bands: (F.result?.profile || F.profile).bands } };
    if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
    if (F.result) series.orig = { label: 'Original', bands: F.profile.bands };
    bindSpectrum(root.querySelector('#fanalys'), series);
  }
  bindPicker(root, 'f-ref', () => ({ title: 'Välj referens', value: ui.refId, groups: refGroups() }), async (v) => { await selectRef(v); app.render(); });
  const fm = root.querySelector('#f-match');
  if (fm) fm.onclick = () => {
    // Utgår från det mastrade resultatet om det finns – då räknas presetens EQ med och upprepade tryck förfinar
    const own = F.result?.profile || F.profile;
    const add = toFileMatchEq(matchEqCurve(own, currentRef().profile, { amount: F.matchAmount / 100 }));
    F.params.matchEq = F.params.matchEq.map((b, i) => ({ gain: b.gain + add[i] }));
    F.params = sanitizeFile(F.params);
    F.enabled.match = true;
    F.mode = 'advanced';
    app.render();
    paramsChanged({ now: true });
  };
  const fmr = root.querySelector('#f-match-reset');
  if (fmr) fmr.onclick = () => { F.params.matchEq = MATCH_FREQS.map(() => ({ gain: 0 })); app.render(); paramsChanged(); };

  // Export
  root.querySelectorAll('[data-bits]').forEach((b) => { b.onclick = () => { F.bits = Number(b.dataset.bits); app.render(); }; });
  root.querySelectorAll('[data-rate]').forEach((b) => { b.onclick = () => { F.rate = Number(b.dataset.rate); app.render(); }; });
  const ex = root.querySelector('#f-export');
  if (ex) ex.onclick = async () => {
    F.exportMsg = 'Förbereder filen…';
    app.render();
    try {
      const { name, how } = await exportWav(F.result.channels, F.result.fs, F.name);
      F.exportMsg = how === 'shared' ? `Sparad som "${name}" (Dokument/Masterlab) – välj var den ska delas.` : `Nedladdad: ${name}`;
    } catch (e) { F.exportMsg = `Exporten misslyckades: ${e.message}`; }
    app.render();
  };

  // Album
  (root.querySelector('#a-files') || {}).onchange = (e) => {
    const files = [...(e.target.files || [])];
    F.album = files.map((file) => ({ name: file.name, file, status: 'väntar', lufs: null, tp: null }));
    F.albumMsg = '';
    app.render();
  };
  const ar = root.querySelector('#a-run');
  if (ar) ar.onclick = runAlbum;
}
