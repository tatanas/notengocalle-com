// ¿Qué define cada límite entre comunas? Recorre el borde compartido y busca la calle/río/canal que lo sigue.
const fs=require('fs');const turf=require('@turf/turf');
const CORE=["Santiago","Cerrillos","Cerro Navia","Conchalí","El Bosque","Estación Central","Huechuraba","Independencia","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","Ñuñoa","Pedro Aguirre Cerda","Peñalolén","Providencia","Pudahuel","Quilicura","Quinta Normal","Recoleta","Renca","San Joaquín","San Miguel","San Ramón","Vitacura","Puente Alto","San Bernardo"];
const all=JSON.parse(fs.readFileSync('comunas_all.geojson')).features;
const com=all.filter(f=>CORE.includes(f.properties.name));
const KX=92.9,KY=111.2;
// --- features
const seen=new Set();const segs=[];const CELL=0.003;const grid=new Map();
const typeOf=t=>t.waterway?({river:'río',canal:'canal',stream:'estero',drain:'canal',ditch:'acequia'}[t.waterway]||'cauce'):t.railway?'vía férrea':'calle';
const nice=n=>{if(n===n.toLowerCase())n=n.replace(/(^|\s)\S/g,c=>c.toUpperCase());n=n.replace(/^Avenida /,'Av. ');
  if(/Vespucio/.test(n))return 'Américo Vespucio';
  if(/Kennedy/.test(n))return 'Av. Presidente Kennedy';
  if(/Costanera Norte/.test(n))return 'Costanera Norte';
  if(/Autopista Central|General Velásquez|^Ruta 5|Panamericana/.test(n))return 'Autopista Central / Ruta 5';
  if(/Vicuña Mackenna/.test(n))return 'Av. Vicuña Mackenna';
  if(/Padre Hurtado/.test(n)&&/^Av/.test(n))return 'Av. Padre Hurtado';
  if(/Libertador Bernardo O.Higgins/.test(n))return 'Alameda';
  if(/^Canal San Carlos/.test(n))return 'Canal San Carlos (junto a Av. Tobalaba)';
  if(/Mapocho/.test(n)&&/R[ií]o/.test(n))return 'Río Mapocho';
  if(/Zanj[oó]n de la Aguada/.test(n))return 'Zanjón de la Aguada';
  return n.replace(/ (Norte|Sur|Oriente|Poniente)$/,(m)=>/^Av\./.test(n)?'':m);};
for(const f of fs.readdirSync('btiles')){const j=JSON.parse(fs.readFileSync('btiles/'+f));
  for(const w of j.elements){if(w.type!=='way'||!w.geometry||seen.has(w.id))continue;seen.add(w.id);
    const t=w.tags;const name=t.name?nice(t.name):(t.railway?'Línea férrea':null);if(!name)continue;
    if(t.highway&&/^(service|track)$/.test(t.highway)&&!/^(Av\.|Avenida|Camino)/.test(name))continue;
    const ty=typeOf(t);
    for(let i=0;i<w.geometry.length-1;i++){const a=w.geometry[i],b=w.geometry[i+1];const s={n:name,t:ty,hw:t.highway||'',ax:a.lon*KX,ay:a.lat*KY,bx:b.lon*KX,by:b.lat*KY};
      const id=segs.push(s)-1;const x0=Math.floor(Math.min(a.lon,b.lon)/CELL),x1=Math.floor(Math.max(a.lon,b.lon)/CELL),y0=Math.floor(Math.min(a.lat,b.lat)/CELL),y1=Math.floor(Math.max(a.lat,b.lat)/CELL);
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x+','+y;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}}}}
console.log('segments',segs.length);
const rank={motorway:0,trunk:0,primary:1,secondary:1,tertiary:2,unclassified:3,residential:3,living_street:4,pedestrian:4,service:5,track:5,'':1};
function nearest(lon,lat,maxKm=0.07){
  const px=lon*KX,py=lat*KY;const cx=Math.floor(lon/CELL),cy=Math.floor(lat/CELL);let best=null,bd=1e9;
  for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){const L=grid.get(x+','+y);if(!L)continue;
    for(const id of L){const s=segs[id];const dx=s.bx-s.ax,dy=s.by-s.ay,l=dx*dx+dy*dy;let u=l?((px-s.ax)*dx+(py-s.ay)*dy)/l:0;u=Math.max(0,Math.min(1,u));
      let d=Math.hypot(s.ax+u*dx-px,s.ay+u*dy-py);
      // preferir vías importantes y cauces si están casi a la misma distancia
      if(s.n==='Costanera Norte')d+=0.06;
      d+= (s.t==='calle'?(rank[s.hw]??3)*0.008:(s.t==='río'||s.t==='canal'?-0.035:0.0));
      if(d<bd){bd=d;best=s;}}}
  return bd<=maxKm-(best&&(best.t==='río'||best.t==='canal')?0.035:0)?best:null;
}
// --- límites compartidos
const bb=f=>turf.bbox(f);const bbs=com.map(bb);
const buf=com.map(f=>turf.buffer(f,0.05));
const pairs={};
for(let i=0;i<com.length;i++){
  const A=com[i];const ringsF=turf.polygonToLine(A);const rings=(ringsF.type==='FeatureCollection'?ringsF.features:[ringsF]).flatMap(r=>r.geometry.type==='MultiLineString'?r.geometry.coordinates.map(c=>turf.lineString(c)):[r]);
  const cand=com.map((B,j)=>j).filter(j=>j>i&&!(bbs[i][0]>bbs[j][2]+0.01||bbs[j][0]>bbs[i][2]+0.01||bbs[i][1]>bbs[j][3]+0.01||bbs[j][1]>bbs[i][3]+0.01));
  for(const ring of rings){const L=turf.length(ring);let prev=null;
    for(let d=0;d<L;d+=0.04){const p=turf.along(ring,d).geometry.coordinates;
      const j=cand.find(j=>turf.booleanPointInPolygon(p,buf[j]));
      if(j===undefined){prev=null;continue;}
      const key=A.properties.name+'|'+com[j].properties.name;
      const P=pairs[key]||(pairs[key]={a:A.properties.name,b:com[j].properties.name,km:0,f:{},runs:[]});
      P.km+=0.04;const s=nearest(p[0],p[1]);const n=s?s.n:null;const t=s?s.t:null;
      if(n)P.f[n]=P.f[n]||{t,km:0},P.f[n]&&(P.f[n].km+=0.04);
      const ll=[+p[1].toFixed(5),+p[0].toFixed(5)];
      if(prev&&prev.key===key&&prev.n===n){prev.run.pts.push(ll);}else{const run={n,pts:prev&&prev.key===key?[prev.last,ll]:[ll]};P.runs.push(run);prev={key,n,run};}
      prev.last=ll;}}
}
// --- limpiar: features relevantes y runs simplificados
const out=[];
for(const P of Object.values(pairs)){if(P.km<0.3)continue;
  const feats=Object.entries(P.f).map(([n,v])=>({n,t:v.t,km:+v.km.toFixed(2)})).filter(x=>x.km>=0.25||x.km/P.km>=0.15).sort((a,b)=>b.km-a.km);
  const keep=new Set(feats.map(f=>f.n));
  const runs=P.runs.filter(r=>r.pts.length>1).map(r=>({n:keep.has(r.n)?r.n:null,pts:turf.simplify(turf.lineString(r.pts.map(p=>[p[1],p[0]])),{tolerance:0.0001}).geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)])}));
  const covered=feats.reduce((s,f)=>s+f.km,0);
  out.push({a:P.a,b:P.b,km:+P.km.toFixed(1),feats,free:+Math.max(0,P.km-covered).toFixed(1),runs});
}
out.sort((x,y)=>x.a.localeCompare(y.a)||x.b.localeCompare(y.b));
fs.writeFileSync('borders.json',JSON.stringify(out));
console.log(out.length,'pares',fs.statSync('borders.json').size,'bytes');
for(const P of out.filter(p=>/Las Condes|Vitacura|Providencia|Ñuñoa|Macul|San Joaquín/.test(p.a+p.b)))console.log(P.a,'|',P.b,P.km+'km','→',P.feats.slice(0,5).map(f=>`${f.n} (${f.t}, ${f.km})`).join('; '),'| sin:',P.free);
