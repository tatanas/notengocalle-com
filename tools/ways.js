// índice de vías con nombre (desde btiles) -> ways_named.json {name:[[ [lat,lon],... ], ...]}
const fs=require('fs');const seen=new Set();const idx={};const rb=[];
for(const f of fs.readdirSync('btiles')){const j=JSON.parse(fs.readFileSync('btiles/'+f));for(const w of j.elements){if(w.type!=='way'||!w.geometry||seen.has(w.id))continue;seen.add(w.id);const t=w.tags;if(!t.highway||!t.name||/^(service|track|path|footway|cycleway|steps)$/.test(t.highway))continue;
  const g=w.geometry.map(p=>[+p.lat.toFixed(5),+p.lon.toFixed(5)]);(idx[t.name]=idx[t.name]||[]).push(g);
  if(t.junction&&/^Rotonda/.test(t.name))rb.push({n:t.name,g});}}
fs.writeFileSync('ways_named.json',JSON.stringify(idx));fs.writeFileSync('rb_raw.json',JSON.stringify(rb));console.log(Object.keys(idx).length,rb.length);
