const fs=require('fs');const W=require('./ways_named.json');const rb=require('./rb_raw.json');const {distPL}=require('./relations.js');
const KX=92.9,KY=111.2;const d=(a,b)=>Math.hypot((a[0]-b[0])*KY,(a[1]-b[1])*KX);
const nice=n=>{n=n.replace(/^Avenida /,'Av. ');if(/Vespucio/.test(n))return 'Américo Vespucio';if(/Kennedy/.test(n))return 'Av. Presidente Kennedy';if(/Costanera Norte/.test(n))return 'Costanera Norte';if(/Padre Hurtado/.test(n)&&/^Av/.test(n))return 'Av. Padre Hurtado';if(/Escrivá de Balaguer/.test(n))return 'Av. Monseñor Escrivá de Balaguer';
  return n.replace(/ (Norte|Sur|Oriente|Poniente)$/,m=>/^Av\./.test(n)?'':m);};
// --- rotondas
const R={};for(const r of rb)(R[r.n]=R[r.n]||[]).push(...r.g);
const rot=[];
for(const [n,pts] of Object.entries(R)){const c=[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];const st={};
  for(const [wn,ws] of Object.entries(W)){if(/^Rotonda|^Pasaje|Caletera|Enlace|Salida|Acceso/.test(wn))continue;
    for(const w of ws){if(Math.abs(w[0][0]-c[0])>0.02&&Math.abs(w[w.length-1][0]-c[0])>0.02)continue;let near=false;for(const e of w){if(d(e,c)>0.4)continue;if(pts.some(p=>d(p,e)<0.03)){near=true;break;}}
      if(near){let len=0;for(let i=0;i<w.length-1;i++)len+=d(w[i],w[i+1]);const k=nice(wn);st[k]=(st[k]||0)+len;}}}
  // largo total de cada calle en la ciudad (para descartar pasajes)
  const names=Object.keys(st).filter(k=>{const o=Object.keys(W).filter(x=>nice(x)===k).flatMap(x=>W[x]);let L=0;for(const w of o)for(let i=0;i<w.length-1;i++)L+=d(w[i],w[i+1]);return L>=0.8;});
  if(names.length>=3)rot.push({name:n,c:[+c[0].toFixed(5),+c[1].toFixed(5)],streets:names});
  console.log(n.padEnd(34),c.map(x=>x.toFixed(3)).join(','),'|',names.join(', '));}
fs.writeFileSync('rotondas.json',JSON.stringify(rot));console.log(rot.length,'rotondas');
// --- calles a lo largo de cada línea de metro
const metro=require('./metro.json');const streets=require('./streets.json').filter(s=>s.kind==='calle'||s.kind==='autopista');
const along={};
for(const [L,ln] of Object.entries(metro.lines)){const sts=ln.stations.map(n=>metro.stations.find(s=>s.name===n)).filter(Boolean);const per={};let tot=0;
  for(let i=0;i<sts.length-1;i++){const a=sts[i],b=sts[i+1];const len=d([a.lat,a.lon],[b.lat,b.lon]);const n=Math.max(2,Math.ceil(len/0.05));
    for(let k=0;k<n;k++){const t=k/n;const p=[a.lat+(b.lat-a.lat)*t,a.lon+(b.lon-a.lon)*t];tot+=len/n;let best=null,bd=0.13;for(const s of streets){const dd=distPL(p,s.lines);if(dd<bd){bd=dd;best=s.name;}}if(best)per[best]=(per[best]||0)+len/n;}}
  along[L]=Object.entries(per).filter(([,v])=>v>=1.0).sort((a,b)=>b[1]-a[1]).map(([n,v])=>[n,+v.toFixed(1)]);
  console.log(L,tot.toFixed(1)+'km:',along[L].map(x=>x.join(' ')).join(', '));}
fs.writeFileSync('metroalong.json',JSON.stringify(along));
