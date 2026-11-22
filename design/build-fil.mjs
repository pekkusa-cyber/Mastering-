import { writeFileSync } from 'node:fs';
import { spec } from './mk.js';

const css = `
*{box-sizing:border-box;margin:0}body{background:#0b0d10;font:15px/1.3 system-ui,-apple-system,Roboto,sans-serif;color:#eef1f4}
.ph{width:412px;height:915px;overflow:hidden;position:relative;display:flex;flex-direction:column;background:var(--bg);--line:#262b33}
.sb{height:28px;display:flex;justify-content:space-between;padding:6px 18px 0;font-size:12px;color:#aab}
.hd{height:50px;display:flex;align-items:center;gap:6px;padding:0 12px}.hd b{font-size:19px;flex:1}
.rb{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:15px;border:1.5px solid #3a404b;color:#8a94a1;background:#1a1d23}
.rb.on{border-color:var(--ac);background:var(--acbg);color:#fff;box-shadow:0 0 10px var(--acglow)}
.bar{display:flex;gap:6px;padding:0 12px 8px;align-items:center}
.pp{flex:1;min-width:0;height:38px;display:flex;align-items:center;gap:7px;padding:0 10px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:14px}
.pp b{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pp small{color:var(--dim);font-size:11px}
.ab{display:flex;height:38px;padding:3px;border-radius:12px;background:var(--card);border:1px solid var(--line)}.ab span{display:grid;place-items:center;padding:0 9px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--dim)}.ab .on{background:var(--acbg);color:#fff}
.btn{height:38px;padding:0 11px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:#dfe5ea;font-size:13px;display:grid;place-items:center;white-space:nowrap}
.btn.pri{background:var(--ac);color:#062b24;border-color:var(--ac);font-weight:700}
.top{position:relative;margin:0 12px;border-radius:16px;background:#0c0f12;border:1px solid var(--line);overflow:hidden}
.lbl{position:absolute;left:10px;top:7px;right:10px;display:flex;gap:6px;align-items:center;font-size:10.5px;color:var(--dim);letter-spacing:.4px;text-transform:uppercase;z-index:2}
.lbl b{color:#eef1f4}.grow{flex:1}
.gsw{display:flex;gap:3px;padding:2px;border-radius:9px;background:#151a1f;border:1px solid var(--line)}.gsw span{padding:3px 7px;border-radius:7px;font-size:10px;text-transform:none;letter-spacing:0}.gsw .on{background:var(--acbg);color:#fff}
.blocks{display:flex;gap:3px;margin:8px 12px 0}.blk{flex:1;min-width:0;padding:6px 0 5px;border-radius:12px;background:var(--card);border:1px solid var(--line);text-align:center;display:flex;flex-direction:column;align-items:center}
.blk b{font-size:10.5px;font-weight:650;white-space:nowrap}.blk small{font-size:8.5px;color:var(--dim);white-space:nowrap}.blk small i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ac);margin-right:3px;vertical-align:middle}
.blk.on{border-color:var(--ac);background:var(--acbg)}.blk.sep{margin-right:5px}.blk.new{box-shadow:0 0 0 2px var(--solo) inset}
.panel{flex:1;margin:8px 12px 10px;border-radius:16px;background:var(--card);border:1px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;min-height:0}
.phead{display:flex;align-items:center;gap:8px}.phead b{font-size:15px}.phead small{color:var(--dim);font-size:11.5px}
.tog{width:36px;height:21px;border-radius:11px;background:var(--ac);position:relative;flex:0 0 auto}.tog::after{content:'';position:absolute;right:3px;top:3px;width:15px;height:15px;border-radius:50%;background:#062b24}
.chips{display:flex;gap:4px;margin-top:8px}.chip{flex:1;text-align:center;padding:6px 0;border-radius:10px;border:1px solid var(--line);font-size:11.5px;color:var(--dim);white-space:nowrap}.chip.on{border-color:var(--ac);color:#fff;background:var(--acbg)}
.ms{display:flex;gap:3px}.ms span{width:20px;height:20px;border-radius:6px;border:1px solid #333a44;font-size:10px;font-weight:700;display:grid;place-items:center;color:var(--dim)}
.ms .m{background:var(--mutebg);color:#fff;border-color:var(--mute)}.ms .s{background:var(--solobg);color:#fff;border-color:var(--solo)}
.faders{flex:1;display:grid;gap:3px;margin-top:6px;min-height:0}
.fd{min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;color:var(--dim);min-height:0}.fd b{font-size:11.5px;color:#eef1f4}
.pm{width:100%;max-width:34px;height:20px;border-radius:7px;border:1px solid var(--line);display:grid;place-items:center;color:#cfe;font-size:13px}
.tr{position:relative;flex:1;width:7px;border-radius:4px;background:#262d35;min-height:60px}.tr em{position:absolute;left:0;right:0;border-radius:4px;background:var(--ac)}.tr i{position:absolute;left:50%;width:30px;height:15px;margin-left:-15px;border-radius:6px;background:#f2f5f7;box-shadow:0 1px 4px #0009}
.sl{margin:6px 0 2px}.slh{display:flex;align-items:center;gap:6px;font-size:13.5px}.slh .v{margin-left:auto;color:var(--dim);font-size:12.5px}
.slr{display:flex;align-items:center;gap:6px;margin-top:3px}.slr .st{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;color:#cfe}
.trk{flex:1;height:4px;border-radius:2px;background:#26353a;position:relative}.trk em{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:var(--ac)}.trk i{position:absolute;top:-8px;width:20px;height:20px;border-radius:50%;background:#f2f5f7;margin-left:-10px}
.hint{font-size:11px;color:var(--dim);margin-top:4px}
.tag{position:absolute;right:8px;bottom:8px;font-size:11px;padding:4px 8px;border-radius:9px;background:var(--solobg);border:1px solid var(--solo);color:#fff}
.note{position:absolute;left:0;right:0;bottom:0;padding:6px 10px;background:#000c;color:#ffe08a;font-size:11px}
`;
const P = {
  teal: '--bg:#121418;--card:#191c22;--dim:#8b95a3;--ac:#3fd3b0;--acbg:#123a33;--acglow:#3fd3b055;--solo:#d9b23a;--solobg:#5a4a1b;--mute:#c04545;--mutebg:#5a2b2b',
};
const vf = (v, p, label, ms = '', z = 50, unit = 'dB') => {
  const lo = Math.min(p, z), hi = Math.max(p, z);
  return `<div class="fd"><span class="pm">+</span><b>${v}</b><small>${unit}</small><div class="tr"><em style="bottom:${lo}%;top:${100 - hi}%"></em><i style="bottom:calc(${p}% - 7px)"></i></div><span class="pm">−</span><div class="ms"><span class="${ms === 'm' ? 'm' : ''}">M</span><span class="${ms === 's' ? 's' : ''}">S</span></div>${label}</div>`;
};
const hs = (name, v, p, extra = '') => `<div class="sl"><div class="slh"><span class="tog" style="width:30px;height:18px"></span>${name}<span class="v">${v}</span>${extra}</div><div class="slr"><span class="st">−</span><div class="trk"><em style="width:${p}%"></em><i style="left:${p}%"></i></div><span class="st">+</span></div></div>`;
const head = (title) => `<div class="sb"><span>09:58</span><span>●●● 94</span></div>
<div class="hd"><b>${title}</b><span class="rb">🎧</span><span class="rb on">🎚️</span><span class="rb">⚙</span><span class="rb">☰</span><span class="rb">ⓘ</span></div>`;
const wave = (h, loop = false) => {
  let s = `<svg width="388" height="${h}" viewBox="0 0 388 ${h}">`;
  let seed = 3; const r = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  if (loop) s += `<rect x="120" y="0" width="92" height="${h}" fill="#d9b23a22" stroke="#d9b23a" stroke-dasharray="3 3"/><text x="124" y="12" font-size="10" fill="#ffe08a">Loop: refräng 0:48–1:12</text>`;
  for (let x = 4; x < 384; x += 2) { const a = (0.35 + 0.55 * Math.abs(Math.sin(x / 37)) * (0.6 + 0.4 * r())) * (h / 2 - 8); s += `<rect x="${x}" y="${h / 2 - a}" width="1.2" height="${2 * a}" fill="#3a7bd5"/>`; }
  return s + `<rect x="${loop ? 160 : 186}" y="0" width="2" height="${h}" fill="#3fd3b0"/></svg>`;
};
const filBlocks = (on) => `<div class="blocks">${[['quick', 'Snabb', 'genväg'], ['in', 'In', 'först'], ['eq1', 'EQ 1', 'före'], ['comp', 'Kompr.', 'tryck'], ['eq2', 'EQ 2', 'efter'], ['farg', 'Färg', 'polering'], ['lim', 'Limiter', 'volym'], ['out', 'Ut', 'sist']]
  .map(([id, l, s], i) => `<div class="blk${id === on ? ' on' : ''}${i === 0 ? ' sep' : ''}${id === 'farg' ? ' new' : ''}"><b>${l}</b><small><i></i>${s}</small></div>`).join('')}</div>`;
const page = (pal, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="ph" style="${pal}">${body}</div></body></html>`;

// 1) Fil med samma flöde som Live – EQ 1 med 8 band och Match-EQ
const f1 = page(P.teal, `${head('Fil')}
<div class="bar"><div class="pp">🎵 <b>Same Old Thread</b><small>sparad ✓</small> ▾</div><div class="ab"><span>A</span><span class="on">B</span></div><span class="btn">↶</span><span class="btn pri">⤓ Export</span></div>
<div class="top" style="height:218px"><div class="lbl"><div class="gsw"><span class="on">Våg</span><span>Spektrum</span><span>Mätare</span></div><span class="grow"></span>−10.0 LUFS · −1.0 dBTP</div>
  <div style="position:absolute;left:0;top:30px">${wave(120)}</div>
  <div style="position:absolute;left:10px;right:10px;bottom:10px;display:flex;gap:6px;align-items:center"><span class="btn" style="width:42px">❚❚</span><span class="btn" style="width:42px">■</span><span style="font-size:13px;color:#8b95a3">1:39 / 3:27</span><span class="grow"></span><span class="btn">Rendera</span></div></div>
${filBlocks('eq1')}
<div class="panel"><div class="phead"><span class="tog"></span><b>EQ 1</b><span class="ms"><span>S</span></span><small>före komp.</small><span class="grow"></span><span class="btn" style="height:28px;font-size:12px;color:#3fd3b0;border-color:#2c6e64">Preset ▾</span></div>
  <div class="chips"><span class="chip on">8 band</span><span class="chip">Match-EQ · 10 band</span><span class="chip">Mot referens ▾</span></div>
  <div class="faders" style="grid-template-columns:repeat(8,minmax(0,1fr))">${vf('0.0', 50, '60')}${vf('+1.5', 56, '120')}${vf('−1.0', 46, '250', 's')}${vf('0.0', 50, '500')}${vf('0.0', 50, '1k')}${vf('+0.5', 52, '3k')}${vf('0.0', 50, '8k', 'm')}${vf('0.0', 50, '20k')}</div>
  <div class="hint">Samma block, fadrar, M/S och Preset som i Live. Fil har ett extra block: <b style="color:#ffe08a">Färg</b>.</div></div>`);

// 2) Färg-blocket och mätargrafen
const f2 = page(P.teal, `${head('Fil')}
<div class="bar"><div class="pp">🎵 <b>Same Old Thread</b><small>sparad ✓</small> ▾</div><div class="ab"><span>A</span><span class="on">B</span></div><span class="btn">↶</span><span class="btn pri">⤓ Export</span></div>
<div class="top" style="height:218px"><div class="lbl"><div class="gsw"><span>Våg</span><span>Spektrum</span><span class="on">Mätare</span></div><span class="grow"></span>live medan låten spelar</div>
  <div style="position:absolute;left:12px;right:12px;top:36px;bottom:12px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;font-size:10.5px;color:#8b95a3;text-align:center">
  ${[['LUFS', '−10.2', 70, '#3fd3b0'], ['Topp', '−1.0', 92, '#3fd3b0'], ['S-ljud', '−3.1', 28, '#e0a03c'], ['Topp-fräs', '−1.4', 14, '#e0a03c'], ['Lim', '−1.8', 18, '#e0a03c'], ['Limiter', '−2.6', 24, '#e0a03c']].map(([n, v, h, c]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;height:100%"><b style="color:#eef1f4;font-size:12px">${v}</b><div style="flex:1;width:18px;border-radius:5px;background:#1a2027;position:relative;overflow:hidden"><em style="position:absolute;left:0;right:0;${c === '#3fd3b0' ? 'bottom' : 'top'}:0;height:${h}%;background:${c}"></em></div>${n}</div>`).join('')}</div></div>
${filBlocks('farg')}
<div class="panel"><div class="phead"><span class="tog"></span><b>Färg</b><span class="ms"><span>S</span></span><small>polering efter EQ 2</small></div>
  <div class="chips"><span class="chip on">S-ljud</span><span class="chip">Mjuk topp</span><span class="chip">Bredd</span><span class="chip">Lim</span></div>
  ${hs('Mängd', '25 %', 25)}${hs('Frekvens', '6.5 kHz', 55)}${hs('Känslighet', '−28 dB', 40)}
  <div style="display:flex;gap:6px;align-items:center;margin-top:6px"><span class="ms"><span>M</span><span class="s">S</span></span><span class="btn" style="height:28px;font-size:12px;border-color:#d9b23a;color:#ffe08a">Δ Hör bara det som tas bort</span></div>
  <div class="hint">"Δ" är proffsens sätt att ställa en de-esser: man hör bara s-ljuden som tas bort och sänker tills inga ord försvinner.</div></div>`);

// 3) Färgförslag
const pal = [
  { n: 'A · Studio grafit (rekommenderas)', d: 'Nuvarande grön accent, men bara EN accent: ingen orange kant på handtagen. Gult = solo, rött = mute, orange = bara mätare (nedtryckning).', bg: '#121418', card: '#191c22', ac: '#3fd3b0', acbg: '#123a33', solo: '#d9b23a', mute: '#c04545', meter: '#e0a03c', txt: '#eef1f4' },
  { n: 'B · Midnatt', d: 'Djupblå bakgrund och lila/cyan accent. Lugnare för långa kvällspass; gröna "på"-prickar byts mot cyan.', bg: '#0e1020', card: '#161a30', ac: '#8b9cff', acbg: '#262c5c', solo: '#ffd166', mute: '#ff6b6b', meter: '#36d6e7', txt: '#eceefe' },
  { n: 'C · Analog värme', d: 'Varm svart och bärnsten som gamla studiobord. Mätare i grönt som VU-mätare; tydligt men mer "vintage".', bg: '#15120e', card: '#1f1a14', ac: '#ffb454', acbg: '#4a3317', solo: '#f5e06e', mute: '#e2574c', meter: '#7fd18b', txt: '#f6efe6' },
];
const sw = (c, l) => `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9.5px;color:#9aa"><i style="width:34px;height:34px;border-radius:9px;background:${c};border:1px solid #fff2"></i>${l}</div>`;
const colors = `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{padding:14px;width:1240px} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px} .pc{border-radius:18px;padding:14px;border:1px solid #fff1}</style></head><body>
<h2 style="font-size:20px;margin-bottom:10px">Färgförslag – samma layout, tre teman (alla med tydliga roller: på, solo, mute, mätare)</h2><div class="grid">${pal.map((p) => `<div class="pc" style="background:${p.bg};color:${p.txt}">
<b style="font-size:16px">${p.n}</b><p style="font-size:12px;opacity:.75;margin:6px 0 10px;min-height:48px">${p.d}</p>
<div style="display:flex;gap:8px;margin-bottom:12px">${sw(p.bg, 'botten')}${sw(p.card, 'kort')}${sw(p.ac, 'accent')}${sw(p.solo, 'solo')}${sw(p.mute, 'mute')}${sw(p.meter, 'mätare')}</div>
<div style="display:flex;gap:4px;margin-bottom:10px">${['Snabb', 'In', 'EQ 1', 'Kompr.', 'EQ 2', 'Limiter', 'Ut'].map((b, i) => `<div style="flex:1;text-align:center;padding:6px 0;border-radius:10px;font-size:10.5px;font-weight:650;background:${i === 2 ? p.acbg : p.card};border:1px solid ${i === 2 ? p.ac : '#ffffff18'}">${b}<br><small style="font-size:8.5px;opacity:.7"><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${p.ac}"></i> på</small></div>`).join('')}</div>
<div style="display:flex;gap:10px;align-items:flex-end;height:150px;padding:10px;border-radius:14px;background:${p.card}">
${[40, 55, 30, 50, 62].map((h, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%"><div style="flex:1;width:7px;border-radius:4px;background:#ffffff14;position:relative"><em style="position:absolute;left:0;right:0;bottom:50%;height:${Math.abs(h - 50)}%;${h < 50 ? `top:50%;bottom:auto;` : ''}background:${p.ac};border-radius:4px"></em><i style="position:absolute;left:50%;margin-left:-15px;bottom:calc(${h}% - 7px);width:30px;height:15px;border-radius:6px;background:#f5f6f8"></i></div><div style="display:flex;gap:3px"><span style="font-size:9px;font-weight:700;padding:3px 5px;border-radius:5px;${i === 3 ? `background:${p.mute};color:#fff` : 'border:1px solid #ffffff30'}">M</span><span style="font-size:9px;font-weight:700;padding:3px 5px;border-radius:5px;${i === 1 ? `background:${p.solo};color:#222` : 'border:1px solid #ffffff30'}">S</span></div></div>`).join('')}
<div style="width:26px;height:100%;border-radius:6px;background:#ffffff10;position:relative;overflow:hidden"><em style="position:absolute;left:0;right:0;top:0;height:35%;background:${p.meter}"></em></div></div>
</div>`).join('')}</div></body></html>`;

// 4) Två smidigare arbetsflöden
const w1 = `${head('Fil')}
<div style="margin:0 12px 10px;display:flex;gap:4px">${['Låt', 'Mål', 'Förslag', 'Finjustera', 'Export'].map((s, i) => `<div style="flex:1;text-align:center;font-size:10.5px;color:${i < 2 ? '#3fd3b0' : i === 2 ? '#fff' : '#8b95a3'}"><div style="height:5px;border-radius:3px;margin-bottom:4px;background:${i < 3 ? '#3fd3b0' : '#262b33'}"></div>${i < 2 ? '✓ ' : ''}${s}</div>`).join('')}</div>
<div class="top" style="height:150px"><div class="lbl"><b>Steg 3 · Förslag</b><span class="grow"></span>mot referens: Favoritlåt</div><div style="position:absolute;left:0;top:26px">${spec(120, { pts: false })}</div></div>
<div style="margin:10px 12px 0;display:flex;flex-direction:column;gap:8px">
${[['Före', 'Din låt som den är', '−14.1 LUFS', false], ['A · Varsam', 'Lite mindre grumligt, mjukare s-ljud', '−11.0 LUFS', false], ['B · Balanserad', 'Som A + mjukare kick, mer luft, tätare', '−10.0 LUFS', true], ['C · Kraftig', 'Hela vägen mot referensen', '−9.5 LUFS', false]].map(([t, d, l, on]) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:${on ? '#123a33' : '#191c22'};border:1px solid ${on ? '#3fd3b0' : '#262b33'}"><span class="btn" style="width:40px;height:40px;border-radius:50%">${on ? '❚❚' : '▶'}</span><div style="flex:1"><b style="font-size:14.5px">${t}</b><div style="font-size:11.5px;color:#8b95a3">${d}</div></div><span style="font-size:12px;color:#8b95a3">${l}</span></div>`).join('')}
</div>
<div style="margin:12px;display:flex;gap:8px"><span class="btn" style="flex:1">Finjustera B</span><span class="btn pri" style="flex:1">Välj B → Export</span></div>
<div class="note">Flöde 1 · Assistent: 5 steg, appen föreslår, du lyssnar och väljer – växla Före/A/B/C medan låten spelar.</div>`;
const w2 = `${head('Fil')}
<div class="bar"><div class="pp">🎵 <b>Same Old Thread</b><small>sparad ✓</small> ▾</div><span class="btn pri">⤓ Export</span></div>
<div class="top" style="height:200px"><div class="lbl"><b>Jämför</b><span class="grow"></span>loopar refrängen</div><div style="position:absolute;left:0;top:28px">${wave(120, true)}</div>
<div style="position:absolute;left:10px;right:10px;bottom:10px;display:flex;gap:6px;align-items:center"><span class="btn" style="width:42px">❚❚</span><span class="btn">⟲ Loop på</span><span style="font-size:12px;color:#8b95a3">dra kanterna för att välja del</span></div></div>
<div style="margin:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
${[['Original', 'orörd', false], ['V1 · Suno-fix', '−10.0 LUFS', false], ['V2 · Radio ljus', '−9.8 LUFS', true], ['V3 · Egen', '−10.1 LUFS', false]].map(([t, d, on]) => `<div style="padding:16px 12px;border-radius:16px;text-align:center;background:${on ? '#123a33' : '#191c22'};border:2px solid ${on ? '#3fd3b0' : '#262b33'}"><b style="font-size:16px">${t}</b><div style="font-size:11.5px;color:#8b95a3;margin-top:3px">${d}</div>${on ? '<div style="font-size:11px;color:#3fd3b0;margin-top:5px">▶ spelar nu</div>' : ''}</div>`).join('')}
</div>
<div style="margin:0 12px;display:flex;gap:8px"><span class="btn" style="flex:1">+ Ny version</span><span class="btn" style="flex:1">Blind test 🎲</span><span class="btn pri" style="flex:1">Behåll V2</span></div>
<div style="margin:12px;padding:10px 12px;border-radius:14px;background:#191c22;border:1px solid #262b33;font-size:12.5px;color:#cfd5dc">Alla versioner spelas i samma nivå. <b>Blind test</b> blandar ordningen och visar vilken du valde först efteråt – så att du väljer med öronen.</div>
<div class="note">Flöde 2 · Jämför: loopa en del, tryck mellan versionerna utan avbrott, behåll den bästa.</div>`;
const flows = `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{display:flex;gap:16px;padding:12px;width:864px}</style></head><body><div class="ph" style="${P.teal}">${w1}</div><div class="ph" style="${P.teal}">${w2}</div></body></html>`;

writeFileSync('f1-fil-floede.html', f1); writeFileSync('f2-fil-farg-matare.html', f2); writeFileSync('f3-fargforslag.html', colors); writeFileSync('f4-arbetsfloden.html', flows);
