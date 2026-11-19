// Fil-vyn (fas 3): välj låt → mål och preset → (matcha klang mot referens) → mastra → lyssna A/B → exportera WAV.
import { isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { BUILTIN_PRESETS, EQ_CUTOFFS, MBC_CUTOFFS, MBC_NAMES, RANGES, bandLabel } from '../chain.js';
import { FILE_RANGES, MATCH_FREQS, TARGETS, fileNeutral, liveToFile, sanitizeFile } from '../master.js';
import { compareProfiles, matchEqCurve, profileFromChannels, toFileMatchEq } from '../analysis.js';
import { currentRef, selectRef } from '../refs.js';
import { bindSliders, esc, fmtDb, getPath, infoBtn, saveFile, setPath, slider } from '../ui.js';
import { spectrumSvg, bindSpectrum } from '../spectrum.js';
import { decodeFile, mmss, resample } from '../audio.js';
import { AbPlayer, renderInWorker } from '../filemaster.js';
import { encodeWav } from '../dsp/wav.js';
import { truePeak } from '../dsp/truepeak.js';
import { allPresets } from './live.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const player = new AbPlayer();
const F = (ui.file = {
  name: '', input: null, profile: null, presetId: 'suno-fix', params: liveToFile(BUILTIN_PRESETS.find((p) => p.id === 'suno-fix').params),
  base: null, mode: 'simple', matchAmount: 70, result: null, rendering: false, progress: 0, msg: '', ab: 'master', matched: true,
  bits: 24, rate: 44100, exportMsg: '',
});
F.base = structuredClone(F.params);

const presetOf = (id) => allPresets().find((p) => p.id === id);
/** Inställningen ↺ och "Återställ alla" går tillbaka till: vald preset med valt mål. */
function presetFileParams() {
  const p = presetOf(F.presetId);
  return p ? liveToFile(p.params, { target: F.params.target }) : sanitizeFile({ ...fileNeutral(), target: F.params.target });
}

let renderTimer = 0;
function paramsChanged({ now = false } = {}) {
  F.params = sanitizeFile(F.params);
  if (!F.input || (!F.result && !now)) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, now ? 0 : 700);
}

async function doRender() {
  if (!F.input) return;
  F.rendering = true; F.progress = 0; F.msg = '';
  app.renderPart('fileStatus');
  try {
    const r = await renderInWorker(F.input, F.params, (x) => { F.progress = x; app.renderPart('fileProgress'); });
    F.result = r;
    const pos = player.position();
    player.setBuffer('master', r.channels, r.fs);
    const gain = Number.isFinite(r.metrics.integrated) && Number.isFinite(r.original.integrated) ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
    player.setAb(F.ab, F.matched ? gain : 1);
    if (player.playing) player.seek(pos);
  } catch (e) {
    F.msg = `Mastringen misslyckades: ${e.message}`;
  }
  F.rendering = false;
  app.render();
}

// ---- Delar ----

const fpath = (key, label, range, info = key) =>
  slider({ id: `f-${key.replace(/\./g, '-')}`, label, value: getPath(F.params, key), range, info, resetTo: getPath(presetFileParams(), key), kind: 'fpath', key });

function simpleControls() {
  return `${fpath('kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch)}
    ${fpath('clip', 'Soft clip', FILE_RANGES.clip)}
    ${fpath('glue.ratio', 'Lim', FILE_RANGES.glueRatio)}
    ${fpath('width', 'Stereobredd', FILE_RANGES.width)}`;
}

const sec = (id, title, info, body, open = false) =>
  `<details class="sec" data-sec="f-${id}" ${open ? 'open' : ''}><summary>${esc(title)}${infoBtn(info, `Om ${title}`)}</summary><div class="secbody">${body}</div></details>`;

function advancedControls() {
  const eq = (k) => EQ_CUTOFFS.map((_, i) => fpath(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), RANGES.eqGain)).join('');
  const match = MATCH_FREQS.map((f, i) => fpath(`matchEq.${i}.gain`, f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, FILE_RANGES.matchGain)).join('');
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band"><summary>${esc(MBC_NAMES[i])}${infoBtn(`mbcBand${i}`)}</summary>
      ${fpath(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}${fpath(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${fpath(`mbc.${i}.attack`, 'Attack', RANGES.attack)}${fpath(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${fpath(`mbc.${i}.knee`, 'Knä', RANGES.knee)}${fpath(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${fpath(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
      ${i === 0 ? fpath('kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch) : ''}</details>`).join('');
  return `${sec('trim', 'Ingång', 'trim', fpath('trim', 'Trim', FILE_RANGES.trim), true)}
    ${sec('preEq', 'Pre-EQ', 'sec_preEq', eq('preEq'))}
    ${sec('match', 'Match-EQ', 'matchEq', match)}
    ${sec('mbc', 'Multiband-kompressor', 'sec_mbc', mbc)}
    ${sec('postEq', 'Post-EQ', 'sec_postEq', eq('postEq'))}
    ${sec('width', 'Stereobredd', 'width', fpath('width', 'Stereobredd', FILE_RANGES.width))}
    ${sec('glue', 'Lim (buss-kompressor)', 'sec_glue', `${fpath('glue.threshold', 'Tröskel', FILE_RANGES.glueThreshold)}${fpath('glue.ratio', 'Ratio', FILE_RANGES.glueRatio)}
      ${fpath('glue.attack', 'Attack', FILE_RANGES.glueAttack)}${fpath('glue.release', 'Release', FILE_RANGES.glueRelease)}${fpath('glue.makeup', 'Make-up', FILE_RANGES.glueMakeup)}`)}
    ${sec('lim', 'Clipper och limiter', 'sec_limiter', `${fpath('clip', 'Soft clip', FILE_RANGES.clip)}${fpath('ceiling', 'Tak (true peak)', FILE_RANGES.ceiling)}
      ${fpath('limRelease', 'Release', FILE_RANGES.limRelease)}${F.params.target === 'egen' ? fpath('drive', 'Drive', FILE_RANGES.drive) : ''}`)}
    ${sec('out', 'Utgång', 'output', fpath('output', 'Utgång', FILE_RANGES.output))}`;
}

function statusPart() {
  if (F.rendering) return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(F.progress * 100)}"><i style="width:${Math.round(F.progress * 100)}%"></i></div><p class="hint" data-testid="fprog">Mastrar… ${Math.round(F.progress * 100)} %</p>`;
  if (F.msg) return `<p class="bad" id="fmsg">${esc(F.msg)}</p>`;
  if (!F.result) return `<button class="btn primary wide" id="f-render" ${F.input ? '' : 'disabled'}>Mastra</button>`;
  return '<p class="hint small">Ändringar mastras om automatiskt.</p>';
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
    <p class="hint small">Limitern sänkte som mest ${r.gr.limiter.toFixed(1)} dB · drive ${fmtDb(r.drive)} dB${r.gr.glue > 0.05 ? ` · lim ${r.gr.glue.toFixed(1)} dB` : ''}.</p>
  </section>`;
}

function playerCard() {
  if (!F.result) return '';
  const pos = player.position(), dur = player.duration;
  return `<section class="card" id="player">
    <div class="row"><h2>Lyssna ${infoBtn('ab')}</h2></div>
    <div class="seg ab" role="tablist">
      <button data-ab="orig" class="${F.ab === 'orig' ? 'sel' : ''}">A · Original</button>
      <button data-ab="master" class="${F.ab === 'master' ? 'sel' : ''}">B · Mastrad</button>
    </div>
    <div class="row transport">
      <button class="btn" id="f-play" aria-label="${player.playing ? 'Paus' : 'Spela'}">${player.playing ? '❚❚' : '▶'}</button>
      <input type="range" id="f-seek" min="0" max="${dur.toFixed(2)}" step="0.1" value="${pos.toFixed(2)}" aria-label="Position">
      <span class="dim small" id="f-time">${mmss(pos)} / ${mmss(dur)}</span>
    </div>
    <label class="switch"><input type="checkbox" id="f-matched" ${F.matched ? 'checked' : ''}> Nivåmatchad A/B</label>
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
    <select id="f-ref" aria-label="Referens för filen"><option value="">Ingen referens</option>${ui.refs.map((r) => `<option value="${esc(r.id)}" ${r.id === ui.refId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
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
    <button class="btn primary wide" id="f-export">Exportera WAV</button>
    ${F.exportMsg ? `<p class="hint" id="f-exportmsg">${esc(F.exportMsg)}</p>` : ''}
  </section>`;
}

export function filView() {
  const opt = (p) => `<option value="${esc(p.id)}" ${p.id === F.presetId ? 'selected' : ''}>${esc(p.name)}</option>`;
  return `
    <section class="card">
      <h2>Låt</h2>
      <label class="btn wide file ${F.input ? '' : 'primary'}">${F.input ? 'Byt låt' : 'Välj låt (MP3/WAV)'}<input type="file" id="f-file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      ${F.input ? `<p class="hint" data-testid="fname">${esc(F.name)} · ${mmss(F.input.channels[0].length / F.input.fs)}</p>` : '<p class="hint small">Låten stannar på telefonen – inget laddas upp.</p>'}
    </section>
    <section class="card">
      <div class="row"><h2>Mål ${infoBtn('fileTarget')}</h2></div>
      <div class="seg">${TARGETS.map((t) => `<button data-target="${t.id}" class="${F.params.target === t.id ? 'sel' : ''}">${t.name}${t.lufs ? ` ${t.lufs}` : ''}</button>`).join('')}</div>
      <div class="row"><h2>Preset ${infoBtn('liveVsFile', 'Live och fil')}</h2></div>
      <select id="f-preset" aria-label="Preset för filen">
        <optgroup label="Inbyggda">${BUILTIN_PRESETS.filter((p) => p.id !== 'test').map(opt).join('')}</optgroup>
        ${ui.userPresets.length ? `<optgroup label="Mina">${ui.userPresets.map(opt).join('')}</optgroup>` : ''}
        ${!presetOf(F.presetId) ? '<option value="" selected>(egen inställning)</option>' : ''}
      </select>
      <div class="seg" role="tablist" style="margin-top:12px">
        <button data-fmode="simple" class="${F.mode === 'simple' ? 'sel' : ''}">Enkelt</button>
        <button data-fmode="advanced" class="${F.mode === 'advanced' ? 'sel' : ''}">Avancerat</button>
      </div>
      <div id="fcontrols">${F.mode === 'simple' ? simpleControls() : advancedControls()}</div>
      <div class="btnrow"><button class="btn small" id="f-reset-all">Återställ alla</button><button class="btn small" id="f-flat">Platt</button></div>
      <div id="fileStatus">${statusPart()}</div>
    </section>
    ${playerCard()}
    ${meters()}
    ${analysisCard()}
    ${exportCard()}`;
}

export function renderFilePart(root, part) {
  if (part === 'fileStatus' || part === 'fileProgress') {
    const el = root.querySelector('#fileStatus');
    if (el) { el.innerHTML = statusPart(); bindRender(el); }
  }
  if (part === 'fileTime') {
    const t = root.querySelector('#f-time'), s = root.querySelector('#f-seek');
    if (t) t.textContent = `${mmss(player.position())} / ${mmss(player.duration)}`;
    if (s && !s.matches(':active')) s.value = player.position().toFixed(2);
  }
}

const bindRender = (el) => { const b = el.querySelector('#f-render'); if (b) b.onclick = () => paramsChanged({ now: true }); };

let ticker = 0;
export function stopFilePlayback() { player.pause(); clearInterval(ticker); }

export function bindFil(root) {
  bindRender(root);
  root.querySelector('#f-file').onchange = async (e) => {
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
      player.bufs = {};
      player.setBuffer('orig', a.channels, a.fs);
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
  root.querySelector('#f-preset').onchange = (e) => {
    F.presetId = e.target.value;
    const matchEq = F.params.matchEq;
    F.params = { ...presetFileParams(), matchEq };
    app.render();
    paramsChanged();
  };
  root.querySelectorAll('[data-fmode]').forEach((b) => { b.onclick = () => { F.mode = b.dataset.fmode; app.render(); }; });
  bindSliders(root, (kind, key, v) => {
    if (kind === 'fpath') { setPath(F.params, key, v); paramsChanged(); }
    if (kind === 'amount') F.matchAmount = v;
  });
  root.querySelector('#f-reset-all').onclick = () => { F.params = presetFileParams(); app.render(); paramsChanged(); };
  root.querySelector('#f-flat').onclick = () => { F.params = sanitizeFile({ ...fileNeutral(), target: F.params.target }); F.presetId = ''; app.render(); paramsChanged(); };

  // Spelare
  root.querySelectorAll('[data-ab]').forEach((b) => {
    b.onclick = () => {
      F.ab = b.dataset.ab;
      const r = F.result;
      const gain = r && F.matched ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
      player.setAb(F.ab, Number.isFinite(gain) ? gain : 1);
      root.querySelectorAll('[data-ab]').forEach((x) => x.classList.toggle('sel', x === b));
    };
  });
  const play = root.querySelector('#f-play');
  if (play) play.onclick = () => {
    if (player.playing) { player.pause(); clearInterval(ticker); }
    else {
      const r = F.result;
      const gain = r && F.matched ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
      player.setAb(F.ab, Number.isFinite(gain) ? gain : 1);
      player.play();
      clearInterval(ticker);
      ticker = setInterval(() => app.renderPart('fileTime'), 250);
      player.onEnd = () => { clearInterval(ticker); app.render(); };
    }
    play.textContent = player.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', player.playing ? 'Paus' : 'Spela');
  };
  const seek = root.querySelector('#f-seek');
  if (seek) seek.onchange = () => player.seek(Number(seek.value));
  const matched = root.querySelector('#f-matched');
  if (matched) matched.onchange = () => {
    F.matched = matched.checked;
    const r = F.result;
    const gain = r && F.matched ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
    player.setAb(F.ab, Number.isFinite(gain) ? gain : 1);
  };

  // Analys och match-EQ
  const ref = currentRef();
  if (F.profile) {
    const series = { main: { label: F.result ? 'Mastrad' : 'Original', bands: (F.result?.profile || F.profile).bands } };
    if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
    if (F.result) series.orig = { label: 'Original', bands: F.profile.bands };
    bindSpectrum(root.querySelector('#fanalys'), series);
  }
  const fr = root.querySelector('#f-ref');
  if (fr) fr.onchange = async () => { await selectRef(fr.value); app.render(); };
  const fm = root.querySelector('#f-match');
  if (fm) fm.onclick = () => {
    // Utgår från det mastrade resultatet om det finns – då räknas presetens EQ med och upprepade tryck förfinar
    const own = F.result?.profile || F.profile;
    const add = toFileMatchEq(matchEqCurve(own, currentRef().profile, { amount: F.matchAmount / 100 }));
    F.params.matchEq = F.params.matchEq.map((b, i) => ({ gain: b.gain + add[i] }));
    F.params = sanitizeFile(F.params);
    F.mode = 'advanced';
    app.render();
    paramsChanged({ now: true });
  };
  const fmr = root.querySelector('#f-match-reset');
  if (fmr) fmr.onclick = () => { F.params.matchEq = MATCH_FREQS.map(() => ({ gain: 0 })); app.render(); paramsChanged({ now: true }); };

  // Export
  root.querySelectorAll('[data-bits]').forEach((b) => { b.onclick = () => { F.bits = Number(b.dataset.bits); app.render(); }; });
  root.querySelectorAll('[data-rate]').forEach((b) => { b.onclick = () => { F.rate = Number(b.dataset.rate); app.render(); }; });
  const ex = root.querySelector('#f-export');
  if (ex) ex.onclick = async () => {
    F.exportMsg = 'Förbereder filen…';
    app.render();
    try {
      let ch = await resample(F.result.channels, F.result.fs, F.rate);
      // Omsamplingen kan flytta toppar mellan samplen en aning – håll taket även efter den
      const ceil = 10 ** (F.params.ceiling / 20), tp = truePeak(ch);
      if (tp > ceil) { const k = ceil / tp; ch = ch.map((c) => c.map((v) => v * k)); }
      const wav = encodeWav(ch, F.rate, F.bits);
      const name = `${F.name.replace(/\.[^.]+$/, '') || 'master'} - master ${F.bits}bit ${F.rate === 44100 ? '44k' : '48k'}.wav`;
      const how = await saveFile(name, wav, 'audio/wav', { isNative, Filesystem, Directory, Encoding, Share });
      F.exportMsg = how === 'shared' ? `Sparad som "${name}" (Dokument/Masterlab) – välj var den ska delas.` : `Nedladdad: ${name}`;
    } catch (e) { F.exportMsg = `Exporten misslyckades: ${e.message}`; }
    app.render();
  };
}
