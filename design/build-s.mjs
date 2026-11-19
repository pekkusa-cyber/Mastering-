import { writeFileSync } from 'node:fs';
import { spec, fader } from './mk.js';
const head = `<div class="sb"><span>00:40</span><span>●●● 73</span></div>
<div class="hd"><b>Masterlab</b><span class="rb on" title="Hörlurar">🎧</span><span class="rb on" title="Masterlab">🎚️</span><span class="rb sm">⚙</span><span class="rb sm">ⓘ</span></div>`;
const bar = (extra = '') => `<div class="bar"><div class="pp">🥁 <b>Mjuk kick</b><small>ändrad</small> ▾</div><div class="ab"><span>Före</span><span class="on">Efter</span></div><span class="rb sm" title="Ångra">↶</span>${extra}</div>`;
const nav = `<div class="nav"><span class="s">◉<br>Live</span><span>▤<br>Analys</span><span>♫<br>Fil</span><span>⋯<br>Mer</span></div>`;
const page = (title, css, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="s-base.css"><style>${css}</style></head><body><div class="ph">${body}</div></body></html>`;

// ---------- A: Delad skärm med flikar ----------
const A = page('Förslag A', `
.tabs{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 14px 0;padding:3px;border-radius:13px;background:var(--card);border:1px solid var(--line)}
.tabs span{text-align:center;padding:8px 0;border-radius:10px;font-size:13px;font-weight:600;color:var(--dim)}.tabs .on{background:#1f4c46;color:#dffdf6}
.tabs small{display:block;font-size:9.5px;font-weight:500;opacity:.75}
.panel{flex:1;margin:8px 14px 10px;padding:10px 12px;border-radius:16px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column}
.ph1{display:flex;align-items:center;gap:8px;font-size:13px}.ph1 b{font-size:15px}.ph1 .gr{flex:1}
.tog{width:36px;height:21px;border-radius:11px;background:var(--ac);position:relative}.tog::after{content:'';position:absolute;right:3px;top:3px;width:15px;height:15px;border-radius:50%;background:#062b24}
.pick{color:var(--ac);font-size:12.5px;border:1px solid #2c6e64;border-radius:10px;padding:4px 8px}
.bands{display:flex;gap:5px;margin:10px 0 2px}.bands span{flex:1;text-align:center;padding:6px 0;border-radius:9px;border:1px solid var(--line);font-size:11.5px;color:var(--dim)}.bands .on{border-color:var(--ac);color:#dffdf6;background:#123a33}
.row3{flex:1;display:grid;grid-template-columns:repeat(3,1fr);align-items:end;padding-top:6px}
.hint{font-size:11px;color:var(--dim);text-align:center;margin-top:4px}
`, `${head}${bar()}
<div class="top" style="height:300px"><span class="lbl">Spektrum · klang</span><span class="lg"><span><i style="background:#3fd3b0"></i>Din EQ</span><span><i style="background:#e08a3c"></i>Referens</span></span>${spec(300, { pts: true, sel: 1 })}</div>
<div class="tabs"><span>Snabb<small>6 reglage</small></span><span class="on">EQ<small>klang</small></span><span>Kompressor<small>tryck</small></span><span>Limiter<small>volym</small></span></div>
<div class="panel">
  <div class="ph1"><span class="tog"></span><b>EQ</b><span class="ms"><span>S</span></span><span class="gr"></span><span class="pick">EQ-preset: Mindre grumligt ▾</span></div>
  <div class="bands"><span>1 Bas</span><span class="on">2 Lågmitt</span><span>3 Mitt</span><span>4 Närvaro</span><span>5 Diskant</span></div>
  <div class="row3">
    ${fader({ v: '300', unit: 'Hz', p: 42, z: 0, label: 'Frekvens', h: 128 }).replace('<div class="ms"><span class="">M</span><span class="">S</span></div>', '')}
    ${fader({ v: '−1.5', unit: 'dB', p: 44, label: 'Höj / sänk', h: 128 }).replace('<div class="ms"><span class="">M</span><span class="">S</span></div>', '')}
    ${fader({ v: '1.4', unit: 'smal ← → bred', p: 30, z: 0, label: 'Bredd (Q)', h: 128 }).replace('<div class="ms"><span class="">M</span><span class="">S</span></div>', '')}
  </div>
  <div class="hint">Dra punkterna i grafen eller fadrarna här · dubbeltryck = nollställ</div>
</div>${nav}`);

// ---------- B: Kedjeblock (signalflödet) ----------
const gr = (name, v, pct, on = true) => `<div class="grb"><div class="grt"><em style="height:${pct}%"></em></div><b>${v}</b><span>${name}</span></div>`;
const B = page('Förslag B', `
.top{display:flex;flex-direction:column}
.cmp{flex:1;display:grid;grid-template-columns:repeat(4,1fr) 1.3fr;gap:10px;padding:34px 14px 10px}
.grb{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--dim)}.grb b{color:#ffcf8a;font-size:13px}
.grt{flex:1;width:22px;border-radius:6px;background:#1a2027;position:relative;overflow:hidden}.grt em{position:absolute;left:0;right:0;top:0;background:linear-gradient(#e0a03c,#a0601c)}
.tf{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--dim)}
.chain{display:flex;align-items:stretch;gap:4px;margin:10px 14px 0}
.blk{flex:1;padding:8px 6px;border-radius:13px;background:var(--card);border:1px solid var(--line);text-align:center;font-size:13px;font-weight:600;color:#cfd5dc;position:relative}
.blk small{display:block;font-size:10.5px;font-weight:500;color:var(--dim);margin-top:2px}
.blk.on{border-color:var(--ac);background:#123a33;color:#eafff9}.blk.off{opacity:.45}
.blk::before{content:'';position:absolute;right:7px;top:7px;width:7px;height:7px;border-radius:50%;background:var(--ac)}.blk.off::before{background:#555}
.ar{align-self:center;color:#4c5664;font-size:12px}
.panel{flex:1;margin:8px 14px 10px;padding:10px 12px;border-radius:16px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column}
.ph1{display:flex;align-items:center;gap:8px;font-size:13px}.ph1 b{font-size:15px}.ph1 .gr{flex:1}
.pick{color:var(--ac);font-size:12.5px;border:1px solid #2c6e64;border-radius:10px;padding:4px 8px}
.bands{display:flex;gap:5px;margin:10px 0 2px}.bands span{flex:1;text-align:center;padding:6px 0;border-radius:9px;border:1px solid var(--line);font-size:11.5px;color:var(--dim)}.bands .on{border-color:var(--ac);color:#dffdf6;background:#123a33}
.row4{flex:1;align-content:end;display:grid;grid-template-columns:repeat(4,1fr);align-items:end;padding-top:6px}
.hint{font-size:11px;color:var(--dim);text-align:center;margin-top:4px}
`, `${head}${bar()}
<div class="top" style="height:270px"><span class="lbl">Kompressor · nedtryckning just nu</span>
  <div class="cmp">${gr('Kick', '−4.2', 38)}${gr('Mellan', '−1.1', 12)}${gr('Närvaro', '−0.4', 5)}${gr('Luft', '0.0', 0)}
  <div class="tf"><svg width="96" height="150" viewBox="0 0 96 150"><rect x="2" y="2" width="92" height="146" rx="8" fill="none" stroke="#262b33"/><line x1="6" y1="144" x2="90" y2="8" stroke="#3a424d" stroke-dasharray="3 4"/><polyline fill="none" stroke="#3fd3b0" stroke-width="2.5" points="6,144 52,70 90,52"/><circle cx="52" cy="70" r="4" fill="#e0a03c"/></svg>Kick: in → ut</div></div></div>
<div class="chain"><div class="blk">EQ<small>klang</small></div><span class="ar">→</span><div class="blk on">Kompressor<small>tryck</small></div><span class="ar">→</span><div class="blk">Limiter<small>volym</small></div><span class="ar">→</span><div class="blk">Ut<small>nivå</small></div></div>
<div class="panel">
  <div class="ph1"><b>Kompressor</b><span class="ms"><span>M</span><span>S</span></span><span class="gr"></span><span class="pick">Preset: Mjuk kick ▾</span></div>
  <div class="bands"><span class="on">Kick</span><span>Mellan</span><span>Närvaro</span><span>Luft</span><span class="ms" style="flex:0 0 auto;border:0;padding:0;align-items:center"><span>M</span><span class="so">S</span></span></div>
  <div class="row4">
    ${fader({ v: '4.0', unit: ':1', p: 45, z: 0, label: 'Styrka', h: 150 }).replace(/<div class="ms">.*?<\/div>/, '')}
    ${fader({ v: '−24', unit: 'dB', p: 60, z: 100, label: 'Startar vid', h: 150 }).replace(/<div class="ms">.*?<\/div>/, '')}
    ${fader({ v: '3', unit: 'ms', p: 18, z: 0, label: 'Reaktion', h: 150 }).replace(/<div class="ms">.*?<\/div>/, '')}
    ${fader({ v: '100', unit: 'ms', p: 30, z: 0, label: 'Släpper', h: 150 }).replace(/<div class="ms">.*?<\/div>/, '')}
  </div>
  <div class="hint">Tryck på ett block i flödet ovan – grafen visar alltid det du ändrar</div>
</div>${nav}`);
writeFileSync('s1-delad.html', A); writeFileSync('s2-floede.html', B);
