// små hjälpare för mockupernas grafer
const W=384;
const xf=(f)=>Math.log(f/20)/Math.log(1000)*W;
export function spec(H,{curve=true,pts=false,ref=true,sel=-1}={}){
  const edges=[20,60,100,150,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000];
  const lv=[.78,.86,.83,.78,.72,.69,.66,.63,.6,.58,.57,.55,.53,.52,.5,.49,.5,.52,.5,.46,.42,.38,.32,.24];
  let s=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<24;i++){const x0=xf(edges[i])+1,x1=xf(edges[i+1])-1,h=lv[i]*(H-40)*.85;s+=`<rect x="${x0}" y="${H-18-h}" width="${x1-x0}" height="${h}" rx="2" fill="#2f6fd0" opacity=".55"/>`}
  const y0=(H-18)/2+8;
  for(const v of [-6,0,6]){const y=y0-v*(H-50)/24;s+=`<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${v?'#1d232b':'#3a424d'}" ${v?'stroke-dasharray="3 5"':''}/>`;s+=`<text x="${W-6}" y="${y-3}" font-size="9" fill="#5d6773" text-anchor="end">${v>0?'+':''}${v} dB</text>`}
  for(const f of [100,1000,10000])s+=`<text x="${xf(f)}" y="${H-5}" font-size="10" fill="#6b7582" text-anchor="middle">${f>=1000?f/1000+' kHz':f+' Hz'}</text>`;
  if(ref)s+=`<polyline fill="none" stroke="#e08a3c" stroke-width="1.6" stroke-dasharray="5 4" points="${[[20,.82],[60,.86],[200,.73],[1000,.6],[4000,.55],[10000,.44],[20000,.3]].map(([f,l])=>`${xf(f)},${H-18-l*(H-40)*.85}`).join(' ')}"/>`;
  const g=[[20,1.5],[60,2],[120,1],[300,-1.5],[700,-.5],[2000,0],[4000,1],[8000,2],[16000,2.5],[20000,2.5]];
  if(curve)s+=`<polyline fill="none" stroke="#3fd3b0" stroke-width="3" stroke-linejoin="round" points="${g.map(([f,v])=>`${xf(f)},${y0-v*(H-50)/24}`).join(' ')}"/>`;
  if(pts)[[80,1.6],[300,-1.5],[1000,-.4],[3500,.8],[10000,2.2]].forEach(([f,v],i)=>{const x=xf(f),y=y0-v*(H-50)/24;s+=`<circle cx="${x}" cy="${y}" r="${i===sel?12:9}" fill="${i===sel?'#3fd3b0':'#eafff9'}" stroke="${i===sel?'#eafff9':'#3fd3b0'}" stroke-width="3"/><text x="${x}" y="${y+4}" font-size="11" font-weight="700" text-anchor="middle" fill="#06302a">${i+1}</text>`});
  return s+'</svg>';
}
export function fader({v,p,label,m='',s='',h=150,z=50,unit=''}){
  const lo=Math.min(p,z),hi=Math.max(p,z);
  return `<div class="fd"><b>${v}</b>${unit?`<small style="margin-top:-4px">${unit}</small>`:''}<div class="tr" style="height:${h}px"><em style="bottom:${lo}%;top:${100-hi}%"></em><i style="bottom:calc(${p}% - 8px)"></i></div><div class="ms"><span class="${m}">M</span><span class="${s}">S</span></div>${label}</div>`;
}
