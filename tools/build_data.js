const fs=require('fs');const turf=require('@turf/turf');
const OUT=process.argv[2];
const CORE=["Santiago","Cerrillos","Cerro Navia","Conchalí","El Bosque","Estación Central","Huechuraba","Independencia","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","Ñuñoa","Pedro Aguirre Cerda","Peñalolén","Providencia","Pudahuel","Quilicura","Quinta Normal","Recoleta","Renca","San Joaquín","San Miguel","San Ramón","Vitacura","Puente Alto","San Bernardo"];
const PERI=["Colina","Lampa","Padre Hurtado","Pirque","Calera de Tango","Peñaflor","Talagante","Buin"];
const gj=JSON.parse(fs.readFileSync('comunas_s.geojson'));
const feats=gj.features.map(f=>{
  const name=f.properties.name;
  let lp=turf.centerOfMass(f);if(!turf.booleanPointInPolygon(lp,f))lp=turf.pointOnFeature(f);
  // nudge label for weird shapes using a coarse interior grid search (max distance to border)
  const bb=turf.bbox(f);const line=turf.polygonToLine(f);let best=null,bd=-1;
  const N=18;for(let i=1;i<N;i++)for(let j=1;j<N;j++){const p=turf.point([bb[0]+(bb[2]-bb[0])*i/N,bb[1]+(bb[3]-bb[1])*j/N]);if(!turf.booleanPointInPolygon(p,f))continue;
    const d=turf.pointToLineDistance(p,line.type==='FeatureCollection'?line.features[0]:line);
    const dc=turf.distance(p,lp);const score=d-0.15*dc;if(score>bd){bd=score;best=p;}}
  if(best)lp=best;
  return {type:'Feature',properties:{name,group:CORE.includes(name)?'core':PERI.includes(name)?'peri':'rural',
    lab:lp.geometry.coordinates.map(x=>+x.toFixed(4)),km2:+(turf.area(f)/1e6).toFixed(1)},geometry:f.geometry};
});
// neighbors
const bbs=feats.map(f=>turf.bbox(f));
for(let i=0;i<feats.length;i++){const nb=[];for(let j=0;j<feats.length;j++){if(i==j)continue;const a=bbs[i],b=bbs[j];
  if(a[0]>b[2]+0.01||b[0]>a[2]+0.01||a[1]>b[3]+0.01||b[1]>a[3]+0.01)continue;
  if(!turf.booleanIntersects(turf.buffer(feats[i],0.08),feats[j]))continue;
  // límite compartido: puntos del borde de j (cada ~50 m) que quedan a <60 m de i
  const bi=turf.buffer(feats[i],0.06);const ring=turf.polygonToLine(feats[j]);const lines=ring.type==='FeatureCollection'?ring.features:[ring];
  let shared=0;for(const ln of lines){const L=turf.length(ln);for(let d=0;d<L;d+=0.05){if(turf.booleanPointInPolygon(turf.along(ln,d),bi))shared+=0.05;}}
  if(shared>=0.3)nb.push(feats[j].properties.name);}
  feats[i].properties.nb=nb;}
const metro=JSON.parse(fs.readFileSync('metro.json'));
const streets=JSON.parse(fs.readFileSync('streets.json'));
const landmarks=JSON.parse(fs.readFileSync('landmarks.json'));
const routes=JSON.parse(fs.readFileSync('routes.json'));
const cerros=JSON.parse(fs.readFileSync('cerros.json')).map(({osm,wikidata,...c})=>c);
const photos=JSON.parse(fs.readFileSync(fs.existsSync('photos_final.json')?'photos_final.json':'photos.json'));
const steps=fs.existsSync('steproutes.json')?JSON.parse(fs.readFileSync('steproutes.json')):[];
const transit=fs.existsSync('transit.json')?JSON.parse(fs.readFileSync('transit.json')):[];
// relaciones calle-calle / calle-comuna
const rel=require('./relations.js');const {distPL}=rel;
const R=rel(streets,feats);
// calles vecinas: distancia media desde puntos de la calle a la otra (cercanía "real", no solo un punto)
for(const s of streets){
  const pts=s.lines.flat().filter((_,i,a)=>i%Math.max(1,Math.floor(a.length/40))==0);
  const sc=streets.filter(o=>o!==s).map(o=>{const ds=pts.map(p=>distPL(p,o.lines)).sort((a,b)=>a-b);const half=ds.slice(0,Math.max(3,Math.ceil(ds.length/2)));return [o.name,+(half.reduce((x,y)=>x+y,0)/half.length).toFixed(2)];});
  s.nb=sc.sort((a,b)=>a[1]-b[1]).slice(0,12);
}
// lugar -> calles y estaciones más cercanas
const near=(lat,lon)=>({ns:streets.map(o=>[o.name,+distPL([lat,lon],o.lines).toFixed(2)]).sort((a,b)=>a[1]-b[1]).slice(0,6),
  nm:metro.stations.map(o=>[o.name,+Math.hypot((o.lat-lat)*111.2,(o.lon-lon)*92.9).toFixed(2)]).sort((a,b)=>a[1]-b[1]).slice(0,4)});
for(const l of landmarks)Object.assign(l,near(l.lat,l.lon));
for(const st of metro.stations)st.ns=near(st.lat,st.lon).ns.slice(0,4);

// lugares en el límite entre comunas: aceptar ambas
const lines=feats.map(f=>({n:f.properties.name,g:f.properties.group,l:turf.polygonToLine(f),bb:turf.bbox(f)}));
function altsNear(lat,lon,own,km){const pt=turf.point([lon,lat]);const out=[];
  for(const o of lines){if(o.n===own)continue;if(lon<o.bb[0]-0.01||lon>o.bb[2]+0.01||lat<o.bb[1]-0.01||lat>o.bb[3]+0.01)continue;
    const ls=o.l.type==='FeatureCollection'?o.l.features:[o.l];const d=Math.min(...ls.map(l=>turf.pointToLineDistance(pt,l)));
    if(d<=km||turf.booleanPointInPolygon(pt,feats.find(f=>f.properties.name===o.n)))out.push(o.n);}
  return out;}
let nAlt=0;
for(const l of landmarks){const a=altsNear(l.lat,l.lon,l.comuna,0.15);const al=[...new Set([...(l.alt||[]),...a])].filter(c=>c!==l.comuna);if(al.length){l.alt=al;nAlt++;}}
for(const st of metro.stations){const a=altsNear(st.lat,st.lon,st.comuna,0.12);if(a.length){st.alt=a;nAlt++;}}
for(const c of cerros){const a=altsNear(c.lat,c.lon,c.comuna,0.3);if(a.length){c.alt=a;nAlt++;}}
console.log('elementos con comuna alternativa (límite):',nAlt);
const rd=f=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;
const zones=rd('zones.json')||[];const chile=rd('chile.json');const metroAlong=rd('metroalong.json')||{};
const norm0=n=>n.replace(/^Av\. /,'');
const rotondas=(rd('rotondas.json')||[]).map(r=>({...r,streets:r.streets.filter((n,i,a)=>a.findIndex(x=>norm0(x)===norm0(n))===i)})).filter(r=>r.streets.length>=3);
const micros=rd('micros.json')||[];
{const pp=rd('parkphotos.json');if(pp&&chile&&chile.parks){const BADP=new Set([17,22,32,33,34,36,37,38,39,40,41,42,62,66,67,68,69,71,73,74,78,81,88,89,91,99,100,101,107,108,109,113,116,119,121,130,136,137,139,141,144,147,148,151,153,163,164,169,172]);let i=0;const keep={};
  for(const [k,v] of Object.entries(pp)){for(const x of v){if(!BADP.has(i))(keep[k]=keep[k]||[]).push(x);i++;}}
  for(const p of chile.parks)if(keep[p.name])photos['p:'+p.name]=keep[p.name];console.log('parques con foto',Object.keys(keep).length);}}
{ // cruces en rotondas: las calles que llegan a una misma rotonda se consideran conectadas
  const nk=n=>n.replace(/^Av\. /,'').replace(/\s*\(.*\)/,'').toLowerCase();const byK={};for(const st of streets)byK[nk(st.name)]=st.name;let add=0;
  for(const r of rotondas){const ours=[...new Set(r.streets.map(n=>byK[nk(n)]).filter(Boolean))];
    for(let i=0;i<ours.length;i++)for(let j=i+1;j<ours.length;j++){const a=ours[i],b=ours[j];if(R.inter.some(x=>(x.a===a&&x.b===b)||(x.a===b&&x.b===a)))continue;
      const cf=feats.filter(f=>turf.booleanPointInPolygon([r.c[1],r.c[0]],f)).map(f=>f.properties.name);R.inter.push({a,b,pts:[r.c],comunas:cf,rot:r.name});add++;}}
  console.log('cruces totales',R.inter.length,'(por rotonda +'+add+')');}
const borders=fs.existsSync('borders.json')?JSON.parse(fs.readFileSync('borders.json')):[];
const data={comunas:{type:'FeatureCollection',features:feats},metro,streets,landmarks,routes:[],cerros,photos,inter:R.inter,para:R.para,borders:[],steps:steps.filter(r=>!r.o),transit,micros,zones,chile,metroAlong,rotondas,built:new Date().toISOString().slice(0,10)};
fs.writeFileSync(OUT,'// Datos generados desde OpenStreetMap (ODbL) y OSRM. No editar a mano: ver tools/\nwindow.DATA='+JSON.stringify(data)+';\n');
console.log('wrote',OUT,fs.statSync(OUT).size,'bytes');
console.log(feats.filter(f=>f.properties.group=='core').map(f=>f.properties.name+': '+f.properties.nb.join(',')).slice(0,6).join('\n'));
