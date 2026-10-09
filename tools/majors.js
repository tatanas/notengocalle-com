const fs=require('fs');const seen=new Set();const idx={};
for(const f of fs.readdirSync('btiles')){const j=JSON.parse(fs.readFileSync('btiles/'+f));for(const w of j.elements){if(w.type!=='way'||!w.geometry||seen.has(w.id))continue;seen.add(w.id);const t=w.tags;if(!t.name||!/^(motorway|trunk|primary|secondary|tertiary)$/.test(t.highway||''))continue;(idx[t.name]=idx[t.name]||[]).push(w.geometry.map(p=>[+p.lat.toFixed(5),+p.lon.toFixed(5)]));}}
fs.writeFileSync('majors.json',JSON.stringify(idx));console.log(Object.keys(idx).length);
