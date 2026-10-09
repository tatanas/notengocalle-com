const fs=require('fs');const turf=require('@turf/turf');
const L=require('./streetlist.js');
const raw={elements:[...require('./streets_raw.json').elements,...require('./streets_raw2.json').elements]};
const seen=new Set();raw.elements=raw.elements.filter(e=>!seen.has(e.id)&&seen.add(e.id));
for(const e of raw.elements)if(!e.tags.name&&e.tags.ref)e.tags.name='Ruta '+e.tags.ref;
for(const e of raw.elements)if(e.tags.ref=='78'&&/Isabel Riquelme/.test(e.tags.name))e.tags.name='Ruta 78';
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson'));
const regs=L.map(x=>new RegExp(x[1],'i'));
const groups=L.map(()=>[]);
for(const w of raw.elements){if(w.type!='way'||!w.geometry)continue;const nm=w.tags.name;
  const i=regs.findIndex((r,k)=>!(L[k][4]&&L[k][4].bt)&&r.test(nm));if(i<0)continue;
  groups[i].push({nm,hw:w.tags.highway,coords:w.geometry.map(p=>[p.lon,p.lat])});}
// calles agregadas: desde los cuadrantes completos (btiles/)
{const seenB=new Set();for(const f of fs.readdirSync('btiles')){const j=JSON.parse(fs.readFileSync('btiles/'+f));
  for(const w of j.elements){if(w.type!='way'||!w.geometry||seenB.has(w.id))continue;seenB.add(w.id);const t=w.tags;
    const isRail=t.railway==='rail'&&!t.highway&&!t.waterway;
    if(isRail&&(t.service||t.usage==='industrial'))continue;
    const nm=isRail?'(rail) '+(t.operator||''):t.name;if(!nm)continue;
    if(t.highway&&/^(service|track|path|footway|cycleway)$/.test(t.highway))continue;
    const i=regs.findIndex((r,k)=>{const o=L[k][4];if(!o||!o.bt||!r.test(nm))return false;const key=o.key||'highway';return key==='railway'?isRail:!!t[key];});
    if(i<0)continue;groups[i].push({nm,hw:t.highway||t.waterway||t.railway,coords:w.geometry.map(p=>[p.lon,p.lat])});}}}
const out=[];
const key=c=>c[0].toFixed(4)+','+c[1].toFixed(4);
for(let i=0;i<L.length;i++){
  const ws=groups[i];if(!ws.length){console.log('MISSING',L[i][0]);continue;}
  // components via union-find on endpoints proximity (~300m grid check)
  const par=ws.map((_,k)=>k);const f=k=>par[k]==k?k:(par[k]=f(par[k]));
  const near=(a,b)=>Math.abs(a[0]-b[0])<0.003&&Math.abs(a[1]-b[1])<0.003;
  for(let a=0;a<ws.length;a++)for(let b=a+1;b<ws.length;b++){
    const A=ws[a].coords,B=ws[b].coords;const ea=[A[0],A[A.length-1]],eb=[B[0],B[B.length-1]];
    if(ea.some(p=>eb.some(q=>near(p,q))))par[f(a)]=f(b);}
  const comp={};ws.forEach((w,k)=>{const r=f(k);(comp[r]=comp[r]||[]).push(w)});
  const comps=Object.values(comp).map(c=>({c,len:c.reduce((s,w)=>s+turf.length(turf.lineString(w.coords)),0)})).sort((a,b)=>b.len-a.len);
  // keep longest component, then grow with components within ~1.2 km of what's kept
  if(L[i][3]){const an=L[i][3];const d=c=>Math.min(...c.c.flatMap(w=>w.coords.map(p=>Math.hypot(p[0]-an[0],p[1]-an[1]))));comps.sort((a,b)=>d(a)-d(b));}
  const keep=[comps[0]];let rest=comps.slice(1),grew=true;
  const pts=c=>c.c.flatMap(w=>w.coords.filter((_,k)=>k%2==0||k==w.coords.length-1));
  const dist=(a,b)=>{let m=1e9;for(const p of a)for(const q of b){const dx=(p[0]-q[0])*93,dy=(p[1]-q[1])*111;const d=dx*dx+dy*dy;if(d<m)m=d;}return Math.sqrt(m);};
  while(grew){grew=false;const kp=keep.flatMap(pts);
    for(const c of rest){if(dist(pts(c),kp)<((L[i][4]&&L[i][4].gap)||1.2)){keep.push(c);rest=rest.filter(x=>x!==c);grew=true;break;}}}
  const lines=keep.flatMap(x=>x.c.map(w=>w.coords));
  const namesOf=keep.flatMap(x=>x.c.map(w=>w.nm));
  const ml=turf.simplify(turf.multiLineString(lines),{tolerance:0.00008,highQuality:false});
  const total=keep.reduce((s,x)=>s+x.len,0);
  // comunas crossed
  const cs=new Set();for(const l of lines)for(let k=0;k<l.length;k+=3){const p=turf.point(l[k]);for(const c of comunas.features)if(turf.booleanPointInPolygon(p,c)){cs.add(c.properties.name);break;}}
  const names=[...new Set(ws.map(w=>w.nm))];
  console.log(L[i][0].padEnd(40),total.toFixed(1).padStart(6),'km comps',comps.length,'kept',keep.length,'|',[...cs].join(', '),'|',names.slice(0,4).join(' / '));
  // tramos con nombres distintos (ej. una avenida que cambia de nombre a lo largo)
  const nice=n=>n.replace(/^Avenida /,'Av. ').replace(/^\(rail\).*/,'').replace(/ Lateral$/,'');
  let tr=null;{const keyOf=n=>nice(n).replace(/^Av\. /,'').replace(/^Canal de /,'Canal ').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const g={};lines.forEach((l,k)=>{const n=nice(namesOf[k]);if(!n||/^(Jardines|Puerto|Rotonda|Caletera|Pasaje)/.test(n))return;const key=keyOf(n);const o=g[key]||(g[key]={km:0,v:{}});const len=turf.length(turf.lineString(l));o.km+=len;o.v[n]=(o.v[n]||0)+len;});
    const big=Object.entries(g).filter(([,o])=>o.km>=((L[i][4]&&L[i][4].trMin)||1.5)).sort((a,b)=>b[1].km-a[1].km);
    if(big.length>=2&&ml.geometry.coordinates.length===lines.length){const keys=big.map(x=>x[0]);
      tr={n:big.map(([,o])=>[Object.entries(o.v).sort((a,b)=>b[1]-a[1])[0][0],+o.km.toFixed(1)]),i:namesOf.map(x=>keys.indexOf(keyOf(x)))};}}
  out.push({id:'s'+i,...(tr?{tr}:{}),name:L[i][0],kind:(L[i][4]&&L[i][4].kind)||(/Costanera Norte|Vespucio|Autopista|Ruta \d/.test(L[i][0])?'autopista':'calle'),hint:L[i][2],km:+total.toFixed(1),comunas:[...cs],lines:ml.geometry.coordinates.map(l=>l.map(p=>[+p[1].toFixed(5),+p[0].toFixed(5)]))});
}
fs.writeFileSync('streets.json',JSON.stringify(out));
console.log('bytes',fs.statSync('streets.json').size);
