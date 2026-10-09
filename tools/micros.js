// Recorridos de micro importantes (GTFS Red): los más frecuentes + los que pasan cerca de casa y del campus.
const fs=require('fs');const readline=require('readline');const turf=require('@turf/turf');const G='gtfs/';
const csv=f=>{const L=fs.readFileSync(G+f,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);const h=L.shift().split(',');return L.map(l=>{const p=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,p[i]]));});};
const sec=t=>{const [h,m,s]=t.split(':').map(Number);return h*3600+m*60+s;};
(async()=>{
const routes=Object.fromEntries(csv('routes.txt').map(r=>[r.route_id,r]));const trips=csv('trips.txt');const freqs=csv('frequencies.txt');
const fBy={};for(const f of freqs)(fBy[f.trip_id]=fBy[f.trip_id]||[]).push(f);
const best={}; // route -> {trip, headway} (ida, día laboral, 10:00)
for(const t of trips){const r=routes[t.route_id];if(!r||r.route_type!=='3'||t.service_id!=='L'||t.direction_id!=='0')continue;const f=(fBy[t.trip_id]||[]).find(f=>sec(f.start_time)<=36000&&36000<sec(f.end_time));if(!f)continue;
  if(!best[t.route_id]||+f.headway_secs<best[t.route_id].headway)best[t.route_id]={trip:t,headway:+f.headway_secs};}
// shapes
const need=new Set(Object.values(best).map(b=>b.trip.shape_id));const shp={};
const rl=readline.createInterface({input:fs.createReadStream(G+'shapes.txt')});let first=true;
for await(const line of rl){if(first){first=false;continue;}const p=line.split(',');if(!need.has(p[0]))continue;(shp[p[0]]=shp[p[0]]||[]).push([+p[3],+p[1],+p[2]]);}
const KX=92.9,KY=111.2;const near=(g,pt,r)=>g.some(p=>Math.hypot((p[0]-pt[0])*KY,(p[1]-pt[1])*KX)<r);
const HOME=[-33.3426,-70.5461],SJ=[-33.4988,-70.6130];
const all=Object.entries(best).map(([id,b])=>{const g=(shp[b.trip.shape_id]||[]).sort((a,b)=>a[0]-b[0]).map(p=>[p[1],p[2]]);let km=0;for(let i=0;i<g.length-1;i++)km+=Math.hypot((g[i][0]-g[i+1][0])*KY,(g[i][1]-g[i+1][1])*KX);
  return {id,name:routes[id].route_short_name,long:routes[id].route_long_name,headway:b.headway,km,g,home:near(g,HOME,0.7),sj:near(g,SJ,0.5)};}).filter(r=>r.g.length>5&&!/e$|N$|^N/.test(r.name));
const pick=new Map();
for(const r of all.filter(r=>r.km>=14).sort((a,b)=>a.headway-b.headway).slice(0,22))pick.set(r.id,{...r,why:'troncal'});
for(const r of all.filter(r=>r.home).sort((a,b)=>a.headway-b.headway).slice(0,7))if(!pick.has(r.id))pick.set(r.id,{...r,why:'casa'});
for(const r of all.filter(r=>r.sj).sort((a,b)=>a.headway-b.headway).slice(0,7))if(!pick.has(r.id))pick.set(r.id,{...r,why:'campus'});
const out=[...pick.values()].map(r=>{const g=turf.simplify(turf.lineString(r.g.map(p=>[p[1],p[0]])),{tolerance:0.00015}).geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)]);
  return {name:r.name,long:r.long.replace(/^\(M\) /,'Metro '),min:Math.round(r.headway/60),km:+r.km.toFixed(0),why:r.why,g};});
fs.writeFileSync('micros.json',JSON.stringify(out));console.log(out.length,fs.statSync('micros.json').size);
for(const r of out)console.log(r.why.padEnd(8),r.name.padEnd(6),('cada '+r.min+' min').padEnd(12),r.km+' km',r.long);
})();
