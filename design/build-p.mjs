// Tre förslag på en lättare, mindre "intryckt" layout med premiumkänsla – samma innehåll (Live: kompressorn,
// Fil: Snabb med en låt) i tre stilar. Kör: node design/build-p.mjs (skriver p1/p2/p3 .html; bilder via Playwright).
import { writeFileSync } from 'node:fs';

const status = '<div class="sb"><span>20:27</span><span>5G ▮▮▮ 61</span></div>';
const wave = (n = 120, seed = 3) => { let s = seed, out = ''; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; const h = 18 + (s % 1000) / 1000 * 62 * (0.55 + 0.45 * Math.sin(i / 9)); out += `<i style="height:${h.toFixed(0)}%"></i>`; } return out; };
const spec = (n = 26) => Array.from({ length: n }, (_, i) => `<i style="height:${(78 - i * 2.1 + Math.sin(i) * 6).toFixed(0)}%"></i>`).join('');

/* ---------------- 1. Luft ---------------- */
const p1css = `
*{box-sizing:border-box;margin:0}body{background:#07080a;display:flex;gap:28px;padding:28px;font:15px/1.35 'Inter',system-ui,-apple-system,Roboto,sans-serif;color:#eceff2}
.ph{width:412px;height:915px;border-radius:34px;overflow:hidden;background:#101215;display:flex;flex-direction:column;position:relative}
.sb{height:30px;display:flex;justify-content:space-between;padding:8px 24px 0;font-size:12px;color:#8a9099}
.hd{display:flex;align-items:center;padding:10px 24px 0;gap:14px}.hd h1{font-size:26px;font-weight:650;letter-spacing:-.5px;flex:1}
.ic{width:30px;height:30px;display:grid;place-items:center;color:#7d8590;font-size:17px}.ic.on{color:#5ee0c0}
.sub{display:flex;align-items:baseline;gap:10px;padding:14px 24px 0}.sub .pre{font-size:15px;font-weight:600}.sub .pre small{color:#7d8590;font-weight:500;margin-left:6px}.sub .grow{flex:1}
.ab{display:flex;gap:2px;font-size:13px;font-weight:600}.ab span{padding:5px 11px;border-radius:20px;color:#7d8590}.ab .on{background:#1d2a27;color:#5ee0c0}
.graph{height:250px;margin:16px 0 0;position:relative;padding:0 24px}
.graph .cap{display:flex;justify-content:space-between;font-size:11px;color:#6d7480;letter-spacing:.6px;text-transform:uppercase}
.bars{position:absolute;left:24px;right:24px;top:34px;bottom:10px;display:flex;align-items:flex-end;gap:3px}.bars i{flex:1;border-radius:3px 3px 0 0;background:linear-gradient(#5ee0c0,#5ee0c033)}
.wave{position:absolute;left:24px;right:24px;top:30px;bottom:50px;display:flex;align-items:center;gap:1.5px}.wave i{flex:1;background:#5ee0c0;opacity:.75;border-radius:1px}
.ply{position:absolute;left:24px;right:24px;bottom:4px;display:flex;align-items:center;gap:18px;font-size:13px;color:#7d8590}.ply b{width:40px;height:40px;border-radius:50%;background:#eceff2;color:#101215;display:grid;place-items:center;font-size:15px}
.ply .grow{flex:1}.ply .rend{color:#5ee0c0;font-weight:600}
.tabs{display:flex;gap:20px;padding:22px 24px 0;font-size:14px;color:#6d7480;white-space:nowrap;overflow:hidden}
.tabs span{position:relative;padding-bottom:8px}.tabs .on{color:#eceff2;font-weight:600}.tabs .on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:#5ee0c0}
.tabs .off{opacity:.45}
.rule{height:1px;background:#1c2026;margin:0 24px}
.pnl{flex:1;padding:18px 24px 0;display:flex;flex-direction:column;gap:22px}
.ph2{display:flex;align-items:center;gap:10px}.ph2 b{font-size:18px;font-weight:650}.ph2 small{color:#6d7480}.ph2 .grow{flex:1}.ph2 .lnk{color:#5ee0c0;font-size:13px}
.seg{display:flex;gap:16px;font-size:13px;color:#6d7480}.seg .on{color:#eceff2;font-weight:600}
.row .t{display:flex;align-items:baseline}.row .t span{font-size:14px;color:#aab1ba}.row .t b{margin-left:auto;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}.row .t b small{font-size:12px;color:#6d7480;margin-left:3px;font-weight:500}
.trk{height:2px;background:#262b33;border-radius:1px;margin-top:12px;position:relative}.trk em{position:absolute;left:0;top:0;bottom:0;background:#5ee0c0;border-radius:1px}.trk i{position:absolute;top:-7px;width:16px;height:16px;border-radius:50%;background:#eceff2;margin-left:-8px;box-shadow:0 2px 8px #0008}
.foot{position:absolute;left:24px;right:24px;bottom:22px;font-size:12px;color:#5d646e;display:flex;justify-content:space-between}
.lbl{position:absolute;top:0;left:0;padding:6px 10px;border-radius:0 0 12px 0;font:700 12px system-ui;color:#101215;background:#5ee0c0}
`;
const p1live = `<div class="ph">${status}
  <div class="hd"><h1>Masterlab</h1><span class="ic on">🎧</span><span class="ic on">◉</span><span class="ic">☰</span></div>
  <div class="sub"><span class="pre">Mjuk kick<small>ändrad</small></span><span class="grow"></span><span class="ab"><span>Före</span><span class="on">Efter</span></span></div>
  <div class="graph"><div class="cap"><span>Mastrat · allt ljud</span><span>−14 LUFS</span></div><div class="bars">${spec()}</div></div>
  <div class="tabs"><span>Snabb</span><span>In</span><span>EQ 1</span><span class="on">Kompr.</span><span>EQ 2</span><span>Limiter</span><span>Ut</span></div>
  <div class="rule"></div>
  <div class="pnl">
    <div class="ph2"><b>Kompressor</b><small>4 band</small><span class="grow"></span><span class="lnk">Preset</span></div>
    <div class="seg"><span>Hela låten</span><span class="on">Kick</span><span>Mellan</span><span>Närvaro</span><span>Luft</span></div>
    <div class="row"><div class="t"><span>Styrka</span><b>4.0<small>:1</small></b></div><div class="trk"><em style="width:22%"></em><i style="left:22%"></i></div></div>
    <div class="row"><div class="t"><span>Startar vid</span><b>−19<small>dB</small></b></div><div class="trk"><em style="width:68%"></em><i style="left:68%"></i></div></div>
    <div class="row"><div class="t"><span>Reaktion</span><b>3<small>ms</small></b></div><div class="trk"><em style="width:12%"></em><i style="left:12%"></i></div></div>
    <div class="row"><div class="t"><span>Släpper</span><b>100<small>ms</small></b></div><div class="trk"><em style="width:20%"></em><i style="left:20%"></i></div></div>
  </div>
  <div class="foot"><span>Tryck och håll på ett värde: ⓘ · ↺ · S</span><span>↶</span></div>
  <div class="lbl">1 · Luft</div></div>`;
const p1fil = `<div class="ph">${status}
  <div class="hd"><h1>Fil</h1><span class="ic on">🎧</span><span class="ic">◉</span><span class="ic">☰</span></div>
  <div class="sub"><span class="pre">Home of Almost<small>✓ sparad</small></span><span class="grow"></span><span class="ab"><span>A</span><span class="on">B</span></span></div>
  <div class="graph"><div class="cap"><span>Våg · Spektrum · Mätare</span><span>−14.0 LUFS · −1.0 dBTP</span></div><div class="wave">${wave()}</div>
    <div class="ply"><b>▶</b><span>0:00 / 4:32</span><span class="grow"></span><span>⟲</span><span>👂</span><span class="rend">Rendera</span></div></div>
  <div class="tabs"><span class="on">Snabb</span><span>In</span><span>EQ 1</span><span>Kompr.</span><span>EQ 2</span><span>Färg</span><span>Limiter</span></div>
  <div class="rule"></div>
  <div class="pnl">
    <div class="ph2"><b>Suno-fix</b><small>huvudpreset</small><span class="grow"></span><span class="lnk">✨ Auto</span></div>
    <div class="row"><div class="t"><span>Kick-anslag</span><b>−15</b></div><div class="trk"><em style="width:42%"></em><i style="left:42%"></i></div></div>
    <div class="row"><div class="t"><span>S-ljud</span><b>35<small>%</small></b></div><div class="trk"><em style="width:35%"></em><i style="left:35%"></i></div></div>
    <div class="row"><div class="t"><span>Mjuk topp</span><b>40<small>%</small></b></div><div class="trk"><em style="width:40%"></em><i style="left:40%"></i></div></div>
    <div class="row"><div class="t"><span>Soft clip</span><b>1.5<small>dB</small></b></div><div class="trk"><em style="width:25%"></em><i style="left:25%"></i></div></div>
  </div>
  <div class="foot"><span>⤓ Export</span><span>↶</span></div>
  <div class="lbl">1 · Luft</div></div>`;

/* ---------------- 2. Glas ---------------- */
const p2css = `
*{box-sizing:border-box;margin:0}body{background:#07080a;display:flex;gap:28px;padding:28px;font:15px/1.35 system-ui,-apple-system,Roboto,sans-serif;color:#f1f3f6}
.ph{width:412px;height:915px;border-radius:34px;overflow:hidden;position:relative;display:flex;flex-direction:column;
  background:radial-gradient(120% 60% at 20% 0%,#1f3a36 0%,#121519 55%),#121519}
.sb{height:30px;display:flex;justify-content:space-between;padding:8px 24px 0;font-size:12px;color:#9aa3ad}
.hd{display:flex;align-items:center;padding:8px 18px 0;gap:8px}.hd h1{font-size:22px;font-weight:700;flex:1;letter-spacing:-.3px}
.pill{height:34px;padding:0 12px;border-radius:17px;display:flex;align-items:center;gap:6px;font-size:13px;background:#ffffff10;backdrop-filter:blur(10px);border:1px solid #ffffff14}
.pill.on{background:#5ee0c022;border-color:#5ee0c055;color:#bff5e7}
.glass{background:#ffffff0c;border:1px solid #ffffff12;border-radius:24px;box-shadow:0 10px 30px #0006,inset 0 1px 0 #ffffff10}
.hero{margin:12px 14px 0;height:250px;position:relative;overflow:hidden}
.hero .cap{position:absolute;left:16px;top:12px;right:16px;display:flex;justify-content:space-between;font-size:12px;color:#aab3bd}
.hero .cap b{font-size:13px;color:#f1f3f6}
.bars{position:absolute;left:16px;right:16px;top:44px;bottom:16px;display:flex;align-items:flex-end;gap:4px}.bars i{flex:1;border-radius:6px;background:linear-gradient(#7ff0d4,#5ee0c022)}
.wave{position:absolute;left:16px;right:16px;top:42px;bottom:66px;display:flex;align-items:center;gap:1.5px}.wave i{flex:1;background:linear-gradient(#9ff3df,#5ee0c0);border-radius:2px;opacity:.85}
.ply{position:absolute;left:14px;right:14px;bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;color:#aab3bd}.ply b{width:42px;height:42px;border-radius:50%;background:#f1f3f6;color:#121519;display:grid;place-items:center}
.ply .grow{flex:1}.ply .r{height:36px;padding:0 14px;border-radius:18px;display:grid;place-items:center;background:#5ee0c0;color:#08241e;font-weight:700}
.list{margin:12px 14px 0;padding:6px 16px;flex:1;margin-bottom:96px;display:flex;flex-direction:column}
.lh{display:flex;align-items:center;gap:8px;padding:10px 0 8px}.lh b{font-size:17px}.lh small{color:#9aa3ad}.lh .grow{flex:1}.lh .pill{height:30px;font-size:12px}
.seg{display:flex;padding:3px;border-radius:14px;background:#00000033;margin:4px 0 8px}.seg span{flex:1;text-align:center;padding:6px 0;border-radius:11px;font-size:12.5px;color:#9aa3ad}.seg .on{background:#ffffff1a;color:#fff;font-weight:600}
.r1{padding:12px 0;border-top:1px solid #ffffff10}.r1 .t{display:flex;align-items:center;font-size:14.5px}.r1 .t b{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}.r1 .t small{color:#9aa3ad;margin-left:3px}
.trk{height:6px;border-radius:3px;background:#ffffff14;margin-top:10px;position:relative}.trk em{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#3fc6a6,#7ff0d4)}.trk i{position:absolute;top:-6px;width:18px;height:18px;border-radius:50%;background:#fff;margin-left:-9px;box-shadow:0 2px 10px #0009}
.dock{position:absolute;left:14px;right:14px;bottom:18px;height:66px;display:flex;align-items:center;justify-content:space-around;padding:0 6px}
.dock span{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;color:#9aa3ad;min-width:0}.dock span i{font-style:normal;font-size:17px;line-height:1}
.dock .on{color:#7ff0d4}.dock .on i{width:36px;height:26px;border-radius:13px;display:grid;place-items:center;background:#5ee0c022}
.lbl{position:absolute;top:0;left:0;padding:6px 10px;border-radius:0 0 12px 0;font:700 12px system-ui;color:#08241e;background:#7ff0d4}
`;
const dock = (items, on) => `<div class="dock glass">${items.map(([ic, l]) => `<span class="${l === on ? 'on' : ''}"><i>${ic}</i>${l}</span>`).join('')}</div>`;
const p2live = `<div class="ph">${status}
  <div class="hd"><h1>Masterlab</h1><span class="pill on">🎧</span><span class="pill on">◉ På</span><span class="pill">☰</span></div>
  <div class="hd" style="padding-top:10px"><span class="pill" style="flex:1">🥁 <b style="font-weight:600">Mjuk kick</b><span style="margin-left:auto;color:#9aa3ad">▾</span></span><span class="pill">Före · <b style="color:#7ff0d4">Efter</b></span></div>
  <div class="hero glass"><div class="cap"><b>Mastrat</b><span>allt ljud · −14 LUFS</span></div><div class="bars">${spec(22)}</div></div>
  <div class="list glass">
    <div class="lh"><b>Kompressor</b><small>Kick · 0–120 Hz</small><span class="grow"></span><span class="pill">Preset ▾</span></div>
    <div class="seg"><span>Hela</span><span class="on">Kick</span><span>Mellan</span><span>Närvaro</span><span>Luft</span></div>
    <div class="r1"><div class="t">Styrka<b>4.0</b><small>:1</small></div><div class="trk"><em style="width:22%"></em><i style="left:22%"></i></div></div>
    <div class="r1"><div class="t">Startar vid<b>−19</b><small>dB</small></div><div class="trk"><em style="width:68%"></em><i style="left:68%"></i></div></div>
    <div class="r1"><div class="t">Reaktion<b>3</b><small>ms</small></div><div class="trk"><em style="width:12%"></em><i style="left:12%"></i></div></div>
  </div>
  ${dock([['✦', 'Snabb'], ['↘', 'In'], ['≋', 'EQ'], ['◐', 'Kompr.'], ['▤', 'Limiter'], ['↗', 'Ut']], 'Kompr.')}
  <div class="lbl">2 · Glas</div></div>`;
const p2fil = `<div class="ph">${status}
  <div class="hd"><h1>Fil</h1><span class="pill on">🎧</span><span class="pill">◉</span><span class="pill">☰</span></div>
  <div class="hd" style="padding-top:10px"><span class="pill" style="flex:1">🎵 <b style="font-weight:600">Home of Almost</b><span style="margin-left:auto;color:#7ff0d4">✓</span></span><span class="pill on">✨ Auto</span></div>
  <div class="hero glass"><div class="cap"><b>Suno-fix</b><span>−14.0 LUFS · −1.0 dBTP</span></div><div class="wave">${wave(100, 7)}</div>
    <div class="ply"><b>▶</b><span>0:00 / 4:32</span><span class="grow"></span><span>A | <b style="all:unset;color:#7ff0d4">B</b></span><span class="r">Rendera</span></div></div>
  <div class="list glass">
    <div class="lh"><b>Snabb</b><small>genvägar</small><span class="grow"></span><span class="pill">⤓ Export</span></div>
    <div class="r1"><div class="t">Kick-anslag<b>−15</b></div><div class="trk"><em style="width:42%"></em><i style="left:42%"></i></div></div>
    <div class="r1"><div class="t">S-ljud<b>35</b><small>%</small></div><div class="trk"><em style="width:35%"></em><i style="left:35%"></i></div></div>
    <div class="r1"><div class="t">Mjuk topp<b>40</b><small>%</small></div><div class="trk"><em style="width:40%"></em><i style="left:40%"></i></div></div>
  </div>
  ${dock([['✦', 'Snabb'], ['≋', 'EQ'], ['◐', 'Kompr.'], ['◈', 'Färg'], ['▤', 'Limiter'], ['↗', 'Ut']], 'Snabb')}
  <div class="lbl">2 · Glas</div></div>`;

/* ---------------- 3. Studio ---------------- */
const p3css = `
*{box-sizing:border-box;margin:0}body{background:#07080a;display:flex;gap:28px;padding:28px;font:14px/1.3 'Inter',system-ui,-apple-system,Roboto,sans-serif;color:#e6e8eb}
.ph{width:412px;height:915px;border-radius:34px;overflow:hidden;background:#0d0e10;display:flex;flex-direction:column;position:relative}
.sb{height:30px;display:flex;justify-content:space-between;padding:8px 22px 0;font-size:12px;color:#7f8690}
.hd{display:flex;align-items:center;gap:10px;padding:6px 18px 10px;border-bottom:1px solid #1b1e22}
.hd h1{font-size:15px;letter-spacing:2.5px;font-weight:700;text-transform:uppercase;flex:1}
.led{display:flex;align-items:center;gap:6px;font-size:11px;color:#7f8690;letter-spacing:1px;text-transform:uppercase}.led i{width:7px;height:7px;border-radius:50%;background:#2a2e33}.led.on i{background:#5ee0c0;box-shadow:0 0 8px #5ee0c0}
.strip{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #1b1e22;font-size:13px}.strip b{flex:1;font-weight:600}.strip .k{font:600 12px ui-monospace,monospace;color:#5ee0c0}
.ab{display:flex;border:1px solid #2a2e33;border-radius:6px;overflow:hidden;font:600 11px ui-monospace,monospace}.ab span{padding:5px 9px;color:#7f8690}.ab .on{background:#5ee0c0;color:#0d0e10}
.scope{height:230px;position:relative;border-bottom:1px solid #1b1e22;background:repeating-linear-gradient(0deg,#ffffff06 0 1px,transparent 1px 46px),repeating-linear-gradient(90deg,#ffffff05 0 1px,transparent 1px 58px)}
.scope .cap{position:absolute;left:18px;right:18px;top:10px;display:flex;justify-content:space-between;font:600 10.5px ui-monospace,monospace;color:#7f8690;letter-spacing:.5px}
.bars{position:absolute;left:18px;right:18px;top:34px;bottom:12px;display:flex;align-items:flex-end;gap:2px}.bars i{flex:1;background:#5ee0c0aa}
.wave{position:absolute;left:18px;right:18px;top:30px;bottom:44px;display:flex;align-items:center;gap:1px}.wave i{flex:1;background:#5ee0c0;opacity:.8}
.ply{position:absolute;left:18px;right:18px;bottom:8px;display:flex;align-items:center;gap:14px;font:600 12px ui-monospace,monospace;color:#7f8690}.ply b{color:#e6e8eb}.ply .grow{flex:1}.ply .r{border:1px solid #5ee0c0;color:#5ee0c0;padding:4px 10px;border-radius:5px}
.path{display:flex;align-items:center;padding:10px 12px;gap:0;border-bottom:1px solid #1b1e22;font:600 10.5px ui-monospace,monospace;color:#6c737d;letter-spacing:.5px}
.path span{flex:1;text-align:center;padding:6px 0;position:relative}.path span::after{content:'';position:absolute;left:50%;top:-4px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#5ee0c0}
.path span.off::after{background:#2a2e33}.path .on{color:#0d0e10;background:#e6e8eb;border-radius:4px}
.pnl{flex:1;padding:14px 18px;display:flex;flex-direction:column;gap:14px}
.ph2{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7f8690}.ph2 b{color:#e6e8eb;font-size:13px}.ph2 .grow{flex:1}
.bands{display:flex;border:1px solid #2a2e33;border-radius:6px;overflow:hidden}.bands span{flex:1;text-align:center;padding:7px 0;font:600 11px ui-monospace,monospace;color:#7f8690;border-left:1px solid #2a2e33}.bands span:first-child{border-left:0}.bands .on{background:#1b2a27;color:#5ee0c0}
.knobs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px 10px;margin-top:6px}
.kn{display:flex;flex-direction:column;align-items:center;gap:7px}
.dial{width:76px;height:76px;border-radius:50%;position:relative;background:conic-gradient(from 225deg,#5ee0c0 0 var(--v),#24282d var(--v) 270deg,transparent 270deg);display:grid;place-items:center}
.dial::before{content:'';position:absolute;inset:7px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#2a2e34,#16181b);box-shadow:0 4px 10px #000a,inset 0 1px 0 #ffffff14}
.dial b{position:relative;font:600 14px ui-monospace,monospace}
.kn small{font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#7f8690}
.gr{display:flex;align-items:center;gap:8px;font:600 11px ui-monospace,monospace;color:#7f8690}.gr .m{flex:1;height:6px;background:#1b1e22;border-radius:3px;position:relative;overflow:hidden}.gr .m em{position:absolute;right:0;top:0;bottom:0;background:#e0a03c}
.lbl{position:absolute;top:0;left:0;padding:6px 10px;border-radius:0 0 12px 0;font:700 12px system-ui;color:#0d0e10;background:#e6e8eb}
`;
const knob = (v, val, l) => `<div class="kn"><div class="dial" style="--v:${v}deg"><b>${val}</b></div><small>${l}</small></div>`;
const p3live = `<div class="ph">${status}
  <div class="hd"><h1>Masterlab</h1><span class="led on"><i></i>🎧</span><span class="led on"><i></i>Mastr</span><span style="color:#7f8690">☰</span></div>
  <div class="strip"><b>Mjuk kick •</b><span class="ab"><span>FÖRE</span><span class="on">EFTER</span></span><span style="color:#7f8690">↶</span></div>
  <div class="scope"><div class="cap"><span>SPECTRUM · ALLT LJUD</span><span>−14.0 LUFS</span></div><div class="bars">${spec(40)}</div></div>
  <div class="path"><span>SNABB</span><span>IN</span><span>EQ1</span><span class="on">COMP</span><span>EQ2</span><span>LIM</span><span>UT</span></div>
  <div class="pnl">
    <div class="ph2"><b>Kompressor</b><span>4-band</span><span class="grow"></span><span style="color:#5ee0c0">PRESET ▾</span></div>
    <div class="bands"><span>ALLA</span><span class="on">KICK</span><span>MID</span><span>NÄRV</span><span>LUFT</span></div>
    <div class="knobs">${knob(70, '4.0', 'Ratio')}${knob(180, '−19', 'Tröskel')}${knob(30, '3ms', 'Attack')}${knob(60, '100', 'Release')}${knob(120, '6.0', 'Knä')}${knob(150, '+2', 'Lyft')}</div>
    <div class="gr"><span>GR</span><div class="m"><em style="width:38%"></em></div><b style="color:#e0a03c">−3.1</b></div>
  </div>
  <div class="lbl">3 · Studio</div></div>`;
const p3fil = `<div class="ph">${status}
  <div class="hd"><h1>Fil</h1><span class="led on"><i></i>🎧</span><span class="led"><i></i>Mastr</span><span style="color:#7f8690">☰</span></div>
  <div class="strip"><b>Home of Almost ✓</b><span class="k">SUNO-FIX</span><span class="ab"><span>A</span><span class="on">B</span></span></div>
  <div class="scope"><div class="cap"><span>WAVE · 4:32</span><span>−14.0 LUFS · −1.0 dBTP</span></div><div class="wave">${wave(140, 11)}</div>
    <div class="ply"><b>▶ PLAY</b><span>0:00</span><span class="grow"></span><span>LOOP</span><span>👂</span><span class="r">RENDER</span></div></div>
  <div class="path"><span class="on">SNABB</span><span>IN</span><span>EQ1</span><span>COMP</span><span>EQ2</span><span>FÄRG</span><span>LIM</span></div>
  <div class="pnl">
    <div class="ph2"><b>Snabb</b><span>genväg</span><span class="grow"></span><span style="color:#5ee0c0">✨ AUTO</span></div>
    <div class="knobs">${knob(110, '−15', 'Kick')}${knob(95, '35%', 'S-ljud')}${knob(108, '40%', 'Mjuk topp')}${knob(68, '1.5', 'Clip')}${knob(55, '1.5', 'Lim')}${knob(150, '100%', 'Bredd')}</div>
    <div class="gr"><span>⤓</span><div class="m" style="background:none"></div><b style="color:#5ee0c0">EXPORT WAV</b></div>
  </div>
  <div class="lbl">3 · Studio</div></div>`;

const page = (title, css, a, b) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${a}${b}</body></html>`;
writeFileSync(new URL('./p1-luft.html', import.meta.url), page('Förslag 1 – Luft', p1css, p1live, p1fil));
writeFileSync(new URL('./p2-glas.html', import.meta.url), page('Förslag 2 – Glas', p2css, p2live, p2fil));
writeFileSync(new URL('./p3-studio.html', import.meta.url), page('Förslag 3 – Studio', p3css, p3live, p3fil));
console.log('ok');
