const fs=require('fs');const turf=require('@turf/turf');
const r=require('./metro_raw.json');
const nodes={},ways={},rels={};
for(const e of r.elements){if(e.type=='node')nodes[e.id]=e;else if(e.type=='way')ways[e.id]=e;else rels[e.id]=e;}
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson'));
function comunaOf(lon,lat){const p=turf.point([lon,lat]);for(const f of comunas.features)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;}
const main={L1:2943868,L2:3636603,L3:2193874,L4:444961,L4A:444982,L5:444964,L6:7732975};
const colors={L1:'#e2231a',L2:'#ffbe2e',L3:'#8b5a2b',L4:'#1f3a93',L4A:'#00a3e0',L5:'#00965e',L6:'#8e16a1'};
const stations={};const lines={};
const norm=s=>{s=s.replace(/\s*\(.*\)$/,'').trim();return /^Estaci[oó]n Central$/i.test(s)?'Estación Central':s.replace(/^Estaci[oó]n\s+/i,'');};
for(const [L,id] of Object.entries(main)){
  const rel=rels[id];const order=[];
  for(const m of rel.members){if(m.type!='node'||!/stop/.test(m.role))continue;const n=nodes[m.ref];if(!n||!n.tags)continue;const nm=norm(n.tags.name||'?');
    order.push(nm);stations[nm]=stations[nm]||{name:nm,lines:[],pts:[]};if(!stations[nm].lines.includes(L))stations[nm].lines.push(L);stations[nm].pts.push([n.lon,n.lat]);}
  const segs=rel.members.filter(m=>m.type=='way').map(m=>ways[m.ref]).filter(Boolean).map(w=>w.nodes.map(i=>[+nodes[i].lat.toFixed(5),+nodes[i].lon.toFixed(5)]));
  lines[L]={id:L,name:L.replace('L','Línea '),color:colors[L],stations:order,segs};
}
const out=Object.values(stations).map(s=>{const lon=s.pts.reduce((a,p)=>a+p[0],0)/s.pts.length,lat=s.pts.reduce((a,p)=>a+p[1],0)/s.pts.length;return{name:s.name,lines:s.lines,lat:+lat.toFixed(5),lon:+lon.toFixed(5),comuna:comunaOf(lon,lat)}});
console.log(out.length,'stations');
for(const s of out)if(!s.comuna||s.name=='?')console.log('PROBLEM',s);
console.log(out.filter(s=>s.lines.length>1).map(s=>s.name+':'+s.lines.join('/')).join(', '));
console.log(out.map(s=>s.name).sort().join(' | '));
fs.writeFileSync('metro.json',JSON.stringify({lines,stations:out}));
