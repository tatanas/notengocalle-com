// Rutas en auto "paso a paso": lista ordenada de calles relevantes con su geometría.
const fs=require('fs');const turf=require('@turf/turf');
const lm=JSON.parse(fs.readFileSync('landmarks.json'));
const streets=JSON.parse(fs.readFileSync('streets.json'));
const old=JSON.parse(fs.readFileSync('routes.json'));
const ORIG=[{id:'home',name:'Casa (Los Trapenses)',lat:-33.3426,lon:-70.5461},
  (()=>{const s=lm.find(l=>/Campus San Joaquín/.test(l.name));return {id:'sj',name:'Campus San Joaquín UC',lat:s.lat,lon:s.lon};})()];
const km=(a,b)=>Math.hypot((a.lon-b.lon)*92.9,(a.lat-b.lat)*111.2);
const canon=s=>{s=s.replace(/^Avenida /,'Av. ').replace(/ Lateral$/,'').replace(/^Caletera /,'').trim();
  if(/Vespucio/.test(s))return 'Américo Vespucio';
  if(/Costanera Norte/.test(s))return 'Costanera Norte';
  if(/Libertador Bernardo O.Higgins/.test(s))return 'Alameda';
  if(/Presidente Kennedy/.test(s))return 'Av. Kennedy';
  if(/Autopista Central|General Velásquez/.test(s))return 'Autopista Central';
  if(/Vicuña Mackenna/.test(s))return 'Av. Vicuña Mackenna';
  if(/^Ruta 68|Autopista del Pacífico/.test(s))return 'Ruta 68';
  if(/^Ruta 78|Autopista del Sol/.test(s))return 'Autopista del Sol';
  if(/^Ruta 5|Panamericana/.test(s))return 'Ruta 5';
  if(/Gran Avenida/.test(s))return 'Gran Avenida';
  if(/Padre Hurtado/.test(s)&&/^Av/.test(s))return 'Av. Padre Hurtado';
  if(/Manquehue/.test(s)&&/^Av/.test(s))return 'Av. Manquehue';
  if(/Costanera Sur|Escrivá de Balaguer/.test(s))return 'Costanera Sur (Escrivá de Balaguer)';
  if(/Túnel San Cristóbal/.test(s))return 'Túnel San Cristóbal';
  return s.replace(/ (Norte|Sur|Oriente|Poniente)$/,m=>/^Av\./.test(s)?'':m);};
const MAJOR=new Set(streets.map(s=>canon(s.name.replace(/\s*\(.*\)/,'').replace(/^Av\. /,'Avenida '))));
['Américo Vespucio','Costanera Norte','Alameda','Av. Kennedy','Autopista Central','Av. Vicuña Mackenna','Gran Avenida','Autopista del Sol','Ruta 68'].forEach(n=>MAJOR.add(n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cache=fs.existsSync('osrmcache2.json')?JSON.parse(fs.readFileSync('osrmcache2.json')):{};
let dirty=0;
async function osrm(a,b){
  const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?steps=true&overview=false&geometries=geojson`;
  if(cache[url])return cache[url];
  for(let t=0;t<4;t++){try{const r=await fetch(url,{headers:{'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz)'}});
      if(r.status!==200){await sleep(4000*(t+1));continue;}
      const j=await r.json();if(!j.routes)return null;
      // guardar solo lo necesario
      const R=j.routes[0];const slim={d:R.distance,t:R.duration,s:R.legs[0].steps.map(s=>({n:s.rotary_name||s.name||'',ref:s.ref||'',d:s.distance,g:s.geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)])}))};
      cache[url]=slim;if(++dirty%15==0)fs.writeFileSync('osrmcache2.json',JSON.stringify(cache));await sleep(1000);return slim;
    }catch(e){await sleep(3000);}}
  return null;
}
function build(R){
  // 1) nombrar y unir tramos consecutivos de la misma calle
  const raw=[];for(const s of R.s){const n=s.n?canon(s.n):(s.ref?canon('Ruta '+s.ref.split(';')[0]):'');
    const last=raw[raw.length-1];
    if(last&&(n===last.n||!n)){last.d+=s.d;last.g.push(...s.g);}else if(n)raw.push({n,d:s.d,g:s.g.slice()});
    else if(!last)raw.push({n:'',d:s.d,g:s.g.slice()});}
  // 2) quedarse con las calles relevantes; lo chico se pega al tramo anterior
  const keep=[];for(const s of raw){const big=s.n&&(s.d>=500||(s.d>=250&&(MAJOR.has(s.n)||/^Rotonda/.test(s.n))));
    const last=keep[keep.length-1];
    if(big){if(last&&last.n===s.n){last.d+=s.d;last.g.push(...s.g);}else keep.push({n:s.n,d:s.d,g:s.g.slice()});}
    else if(last){last.g.push(...s.g);last.d+=s.d;}
    else keep.push({n:'',d:s.d,g:s.g.slice(),pre:true});}
  // tramo inicial sin calle relevante: se pega al primero real
  if(keep.length>1&&keep[0].pre){keep[1].g=keep[0].g.concat(keep[1].g);keep[1].d+=keep[0].d;keep.shift();}
  if(keep.length<3||keep.some(s=>!s.n))return null;
  return keep.map(s=>{let g=s.g;if(g.length>4){g=turf.simplify(turf.lineString(g.map(p=>[p[1],p[0]])),{tolerance:0.00018}).geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)]);}
    return {n:s.n,km:+(s.d/1000).toFixed(1),g};});
}
(async()=>{
  const jobs=[];
  const hubs=new Set(old.flatMap(r=>[r.from,r.to]));
  for(const O of ORIG){for(const l of lm){if(km(O,l)<3)continue;jobs.push({o:O.id,dir:'out',a:O,b:l,key:O.id+'>'+l.id});if(hubs.has(l.id))jobs.push({o:O.id,dir:'in',a:l,b:O,key:l.id+'>'+O.id});}}
  const byId=Object.fromEntries(lm.map(l=>[l.id,l]));
  for(const r of old)jobs.push({o:null,a:byId[r.from],b:byId[r.to],key:r.from+'>'+r.to});
  console.log('jobs',jobs.length);
  const out=[];let skipped=0;
  for(const j of jobs){const R=await osrm(j.a,j.b);if(!R){skipped++;continue;}const steps=build(R);if(!steps){skipped++;continue;}
    out.push({k:j.key,o:j.o,from:j.a.id.length>4?j.a.id:j.a.id,to:j.b.id,km:+(R.d/1000).toFixed(1),min:Math.round(R.t/60),steps});}
  fs.writeFileSync('osrmcache2.json',JSON.stringify(cache));
  // distractores: calles (de cualquier ruta) que pasan cerca del punto donde empieza cada paso
  const pts=[];for(const r of out)for(const s of r.steps)for(let i=0;i<s.g.length;i+=3)pts.push({n:s.n,p:s.g[i]});
  const CELL=0.01;const grid=new Map();for(const q of pts){const k=Math.floor(q.p[0]/CELL)+','+Math.floor(q.p[1]/CELL);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(q);}
  const freq={};for(const r of out)for(const s of r.steps)freq[s.n]=(freq[s.n]||0)+1;
  for(const r of out){const names=new Set(r.steps.map(s=>s.n));
    for(const s of r.steps){const p=s.g[0];const cx=Math.floor(p[0]/CELL),cy=Math.floor(p[1]/CELL);const cand={};
      for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const q of grid.get(x+','+y)||[]){if(names.has(q.n))continue;const d=Math.hypot((q.p[0]-p[0])*111.2,(q.p[1]-p[1])*92.9);if(d<1.0&&(cand[q.n]===undefined||d<cand[q.n]))cand[q.n]=d;}
      s.x=Object.entries(cand).sort((a,b)=>(a[1]-Math.min(0.4,(freq[a[0]]||0)*0.01))-(b[1]-Math.min(0.4,(freq[b[0]]||0)*0.01))).slice(0,6).map(e=>e[0]);}}
  fs.writeFileSync('steproutes.json',JSON.stringify(out));
  console.log('rutas',out.length,'omitidas',skipped,'bytes',fs.statSync('steproutes.json').size);
  const h=out.find(r=>r.o==='home'&&/Escuela Militar/.test(byId[r.to]?.name||''));if(h)console.log('Casa -> Escuela Militar:',h.steps.map(s=>s.n+' ('+s.km+')').join(' → '));
})();
