// Rutas en micro + metro (GTFS de Red, DTPM). Día laboral, media mañana.
const fs=require('fs');const readline=require('readline');
const G='gtfs/';
function parseCSV(file){const txt=fs.readFileSync(G+file,'utf8').replace(/^﻿/,'');const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<txt.length;i++){const c=txt[i];
    if(q){if(c==='"'){if(txt[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c!=='\r')cur+=c;}
  if(cur||row.length){row.push(cur);rows.push(row);}
  const h=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
const sec=t=>{const [h,m,s]=t.split(':').map(Number);return h*3600+m*60+s;};
const KX=92.9,KY=111.2;const dkm=(a,b)=>Math.hypot((a.lat-b.lat)*KY,(a.lon-b.lon)*KX);
(async()=>{
const routes=Object.fromEntries(parseCSV('routes.txt').map(r=>[r.route_id,r]));
const trips=parseCSV('trips.txt');const freqs=parseCSV('frequencies.txt');
const stopsRaw=parseCSV('stops.txt');
const stopById={};for(const s of stopsRaw)stopById[s.stop_id]=s;
// --- elegir un viaje representativo por recorrido+sentido
const fByTrip={};for(const f of freqs)(fByTrip[f.trip_id]=fByTrip[f.trip_id]||[]).push(f);
const chosen={}; // key route|dir -> {trip, headway}
const want=[10*3600,8*3600,18*3600,13*3600];
for(const t of trips){const r=routes[t.route_id];if(!r)continue;const key=t.route_id+'|'+t.direction_id;
  if(r.route_type==='3'){ if(t.service_id!=='L')continue; if(/N$|^N|e$/.test(''))continue;
    const fs_=fByTrip[t.trip_id];if(!fs_)continue;
    for(let w=0;w<want.length;w++){const f=fs_.find(f=>sec(f.start_time)<=want[w]&&want[w]<sec(f.end_time));if(f){const c=chosen[key];if(!c||w<c.w){chosen[key]={trip:t,headway:+f.headway_secs,w};}break;}}
  }}
// metro/tren: el viaje con más paradas (se resuelve al leer stop_times)
const railTrips={};for(const t of trips){const r=routes[t.route_id];if(r&&r.route_type!=='3'&&!/Ruta (Roja|Verde)/.test(t.trip_headsign)&&(t.service_id==='LJ'||t.service_id==='L'))railTrips[t.trip_id]=t;}
const busTripIds=new Set(Object.values(chosen).map(c=>c.trip.trip_id));
const st={}; // trip -> [{s,t}]
const rl=readline.createInterface({input:fs.createReadStream(G+'stop_times.txt')});let first=true;
for await(const line of rl){if(first){first=false;continue;}const i=line.indexOf(',');const id=line.slice(0,i);if(!busTripIds.has(id)&&!railTrips[id])continue;
  const p=line.split(',');(st[id]=st[id]||[]).push({s:p[3],t:sec(p[1]),q:+p[4]});}
for(const [id,t] of Object.entries(railTrips)){const a=st[id];if(!a)continue;const key=t.route_id+'|'+t.direction_id;const c=chosen[key];if(!c||a.length>st[c.trip.trip_id].length)chosen[key]={trip:t,headway:t.route_id.startsWith('MT')?900:240,w:0};}
// --- patrones
const S=[];const sIdx={};const stopIndex=id=>{if(sIdx[id]===undefined){const s=stopById[id];const par=s.parent_station&&stopById[s.parent_station];
    let name=(par?par.stop_name:s.stop_name).replace(/^[A-Z]{1,3}\d+-/,'').replace(/^Parada( \d+)? \/ /,'').replace(/\(M\) /,'Metro ').trim();
    sIdx[id]=S.push({id,name,metro:!!par,lat:+s.stop_lat,lon:+s.stop_lon,pat:[]})-1;}return sIdx[id];};
const P=[];
for(const [key,c] of Object.entries(chosen)){const a=(st[c.trip.trip_id]||[]).sort((x,y)=>x.q-y.q);if(a.length<2)continue;const r=routes[c.trip.route_id];
  const type=r.route_type==='3'?'bus':r.route_type==='1'?'metro':'tren';
  const p={name:r.route_short_name,type,head:c.trip.trip_headsign,headway:c.headway,stops:a.map(x=>stopIndex(x.s)),t:a.map(x=>x.t-a[0].t)};
  const pi=P.push(p)-1;p.stops.forEach((s,i)=>S[s].pat.push([pi,i]));}
console.log('patrones',P.length,'paraderos',S.length);
// --- vecinos a pie
const CELL=0.004;const grid=new Map();S.forEach((s,i)=>{const k=Math.floor(s.lat/CELL)+','+Math.floor(s.lon/CELL);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
function nearStops(pt,r){const out=[];const n=Math.ceil(r/ (CELL*KX))+1;const cx=Math.floor(pt.lat/CELL),cy=Math.floor(pt.lon/CELL);
  for(let x=cx-n;x<=cx+n;x++)for(let y=cy-n;y<=cy+n;y++)for(const i of grid.get(x+','+y)||[]){const d=dkm(pt,S[i]);if(d<=r)out.push([i,d]);}return out;}
const WALK=1.3/ (4.6/3.6) *1000; // seg por km (4,6 km/h, con rodeo 1,3)
S.forEach((s,i)=>{s.nb=nearStops(s,0.25).filter(x=>x[0]!==i);});
const off=[];let N=S.length;for(const p of P){off.push(N);N+=p.stops.length;}
// --- Dijkstra
class Heap{constructor(){this.a=[];}push(x){const a=this.a;a.push(x);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
  pop(){const a=this.a;const t=a[0];const l=a.pop();if(a.length){a[0]=l;let i=0;for(;;){let m=i;const x=2*i+1,y=x+1;if(x<a.length&&a[x][0]<a[m][0])m=x;if(y<a.length&&a[y][0]<a[m][0])m=y;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}return t;}
  get size(){return this.a.length;}}
const PEN=300; // penalización por subirse a un vehículo (evita transbordos rebuscados)
function dijkstra(orig){
  const dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1);const h=new Heap();
  let os=nearStops(orig,0.7);if(!os.length)os=nearStops(orig,1.6).sort((a,b)=>a[1]-b[1]).slice(0,4);
  for(const [i,d] of os){dist[i]=d*WALK;h.push([dist[i],i]);}
  const patOf=n=>{let lo=0,hi=P.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(off[m]<=n)lo=m;else hi=m-1;}return lo;};
  while(h.size){const [d,u]=h.pop();if(d>dist[u])continue;
    const relax=(v,w)=>{if(d+w<dist[v]){dist[v]=d+w;prev[v]=u;h.push([d+w,v]);}};
    if(u<S.length){const s=S[u];for(const [v,dd] of s.nb)relax(v,dd*WALK+30);
      for(const [pi,i] of s.pat){const p=P[pi];if(i<p.stops.length-1)relax(off[pi]+i,Math.min(p.headway/2,600)+PEN);}}
    else{const pi=patOf(u),i=u-off[pi],p=P[pi];relax(p.stops[i],0);if(i<p.stops.length-1)relax(u+1,p.t[i+1]-p.t[i]);}}
  return {dist,prev,patOf};
}
function reverseDijkstra(dest){
  const dist=new Float64Array(N).fill(Infinity);const h=new Heap();
  let ds=nearStops(dest,0.7);if(!ds.length)ds=nearStops(dest,1.6).sort((a,b)=>a[1]-b[1]).slice(0,4);
  for(const [i,d] of ds){dist[i]=d*WALK;h.push([dist[i],i]);}
  const patOf=n=>{let lo=0,hi=P.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(off[m]<=n)lo=m;else hi=m-1;}return lo;};
  while(h.size){const [d,u]=h.pop();if(d>dist[u])continue;
    const relax=(v,w)=>{if(d+w<dist[v]){dist[v]=d+w;h.push([d+w,v]);}};
    if(u<S.length){const s=S[u];for(const [v,dd] of s.nb)relax(v,dd*WALK+30);
      for(const [pi,i] of s.pat)relax(off[pi]+i,0);}                       // (bajarse aquí) invertido
    else{const pi=patOf(u),i=u-off[pi],p=P[pi];
      if(i<p.stops.length-1)relax(p.stops[i],Math.min(p.headway/2,600)+PEN); // (subirse aquí) invertido
      if(i>0)relax(u-1,p.t[i]-p.t[i-1]);}}
  return dist;
}
function pathTo(D,dest){
  let ds=nearStops(dest,0.7);if(!ds.length)ds=nearStops(dest,1.6).sort((a,b)=>a[1]-b[1]).slice(0,4);
  let best=-1,bc=Infinity,bw=0;for(const [i,d] of ds){const c=D.dist[i]+d*WALK;if(c<bc){bc=c;best=i;bw=d;}}
  if(best<0||!isFinite(bc))return null;
  const nodes=[];for(let u=best;u>=0;u=D.prev[u])nodes.push(u);nodes.reverse();
  const legs=[];let cur=null;
  for(const u of nodes){if(u>=S.length){const pi=D.patOf(u),i=u-off[pi];if(cur&&cur.p===pi)cur.j=i;else{cur={p:pi,i,j:i};legs.push(cur);}}else cur=null;}
  return {legs:legs.filter(l=>l.j>l.i),sec:bc,walkEnd:bw,first:nodes[0]};
}
// --- etiquetas, equivalentes y distractores
const lm=JSON.parse(fs.readFileSync('landmarks.json'));
const metroHub=s=>S[s].metro||/^Metro /.test(S[s].name);
function describe(leg,dest,RD){
  const p=P[leg.p];const A=S[p.stops[leg.i]],B=S[p.stops[leg.j]];const dur=p.t[leg.j]-p.t[leg.i];
  const board=q=>Math.min(q.headway/2,600)+PEN;
  const best=board(p)+RD[off[leg.p]+leg.i];
  const nearB=new Set(nearStops(B,0.3).map(x=>x[0]));
  const eq=new Set([p.name]);const cand=new Map();
  for(const [a] of nearStops(A,0.15))for(const [qi,ai] of S[a].pat){const q=P[qi];if(qi===leg.p||ai>=q.stops.length-1||eq.has(q.name))continue;
    const c=board(q)+RD[off[qi]+ai];if(!isFinite(c))continue;
    // ¿dónde conviene bajarse de q?
    let al=ai+1,bc=Infinity;for(let k=ai+1;k<q.stops.length;k++){const v=q.t[k]-q.t[ai]+RD[q.stops[k]];if(v<bc){bc=v;al=k;}}
    if(c<=best+180){if(q.type===p.type&&nearB.has(q.stops[al]))eq.add(q.name);else cand.set(q.name,null);continue;} // casi igual de buena: no se ofrece como incorrecta
    if(c<best+480){cand.set(q.name,null);continue;}                                                   // zona gris: tampoco
    if(al-ai<4){let k2=-1;for(let k=ai+3;k<q.stops.length;k++)if(metroHub(q.stops[k])&&(q.type!=='metro'||S[q.stops[k]].pat.some(([x])=>P[x].type==='metro'&&P[x].name!==q.name))){k2=k;break;}al=k2>0?k2:q.stops.length-1;}
    const old=cand.get(q.name);if(old===undefined||(old&&c<old.c))cand.set(q.name,{type:q.type,name:q.name,to:S[q.stops[al]].name,c,extra:Math.round((c-best)/60)});}
  const lab=(type,names,to)=>(type==='bus'?'Micro ':type==='metro'?'Metro ':'Tren ')+names.join(' / ')+' → hasta '+to.replace(/^Metro /,type==='metro'?'':'Metro ');
  const names=[...eq].sort().slice(0,4);
  const xs=[...cand.values()].filter(c=>c&&!eq.has(c.name)).sort((a,b)=>((a.type===p.type?0:1)-(b.type===p.type?0:1))||a.c-b.c).slice(0,6);
  const g=[];for(let k=leg.i;k<=leg.j;k++){const s=S[p.stops[k]];g.push([+s.lat.toFixed(5),+s.lon.toFixed(5)]);}
  return {t:p.type,r:names,from:A.name,to:B.name,label:lab(p.type,names,B.name),n:leg.j-leg.i,min:Math.round(dur/60),g:g.length>40?g.filter((_,i)=>i%2===0||i===g.length-1):g,x:xs.map(c=>lab(c.type,[c.name],c.to)),xe:xs.map(c=>c.extra)};
}
// --- trabajos (mismos pares que las rutas en auto)
const old=JSON.parse(fs.readFileSync('routes.json'));const byId=Object.fromEntries(lm.map(l=>[l.id,l]));
const sj=lm.find(l=>/Campus San Joaquín/.test(l.name));
const ORIG=[{id:'home',name:'Casa (Los Trapenses)',lat:-33.3426,lon:-70.5461},{id:'sj',name:'Campus San Joaquín UC',lat:sj.lat,lon:sj.lon}];
const hubs=new Set(old.flatMap(r=>[r.from,r.to]));const jobs=[];
for(const O of ORIG)for(const l of lm){if(dkm(O,l)<3)continue;jobs.push({o:O.id,a:O,b:l});if(hubs.has(l.id))jobs.push({o:O.id,a:l,b:O});}
for(const r of old)jobs.push({o:null,a:byId[r.from],b:byId[r.to]});
const cacheD={};const cacheR={};const out=[];let skip=0;
for(const j of jobs){const D=cacheD[j.a.id]||(cacheD[j.a.id]=dijkstra(j.a));const R=pathTo(D,j.b);
  if(!R||R.legs.length<2||R.legs.length>4){skip++;continue;}
  const RD=cacheR[j.b.id]||(cacheR[j.b.id]=reverseDijkstra(j.b));
  const legs=R.legs.map(l=>describe(l,j.b,RD));if(legs.some(l=>l.x.length<2)){skip++;continue;}
  out.push({k:j.a.id+'>'+j.b.id,o:j.o,from:j.a.id,to:j.b.id,min:Math.round(R.sec/60),walk:Math.round(R.walkEnd*1000),legs});}
fs.writeFileSync('transit.json',JSON.stringify(out));
console.log('itinerarios',out.length,'omitidos',skip,'bytes',fs.statSync('transit.json').size);
for(const n of ['Escuela Militar','Palacio de La Moneda','Estadio Nacional','PUC – Campus San Joaquín','Mall Plaza Vespucio']){const r=out.find(r=>r.o==='home'&&r.from==='home'&&byId[r.to].name===n);if(r)console.log('Casa →',n,'('+r.min+' min):',r.legs.map(l=>l.label+' ['+l.min+"']").join(' ⇒ '),'\n    distractores 1:',r.legs[0].x.slice(0,3).join(' | '));}
for(const n of ['Costanera Center / Gran Torre Santiago','Palacio de La Moneda','Portal La Dehesa']){const r=out.find(r=>r.from==='sj'&&byId[r.to].name===n);if(r)console.log('SJ →',n,'('+r.min+' min):',r.legs.map(l=>l.label).join(' ⇒ '));}
})();
