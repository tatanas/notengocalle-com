const fs=require('fs');const seen=new Set();const idx={};
for(const f of fs.readdirSync('btiles')){const j=JSON.parse(fs.readFileSync('btiles/'+f));for(const w of j.elements){if(w.type!=='way'||!w.geometry||seen.has(w.id))continue;seen.add(w.id);const t=w.tags;const n=t.name||(t.railway?'(rail) '+(t.operator||t.usage||''):null);if(!n)continue;
 let d=0;for(let i=0;i<w.geometry.length-1;i++)d+=Math.hypot((w.geometry[i].lat-w.geometry[i+1].lat)*111.2,(w.geometry[i].lon-w.geometry[i+1].lon)*92.9);
 const k=n+' | '+(t.highway||t.waterway||t.railway)+(t.junction?' ['+t.junction+']':'');const o=idx[k]||(idx[k]={km:0,lat:w.geometry[0].lat,lon:w.geometry[0].lon});o.km+=d;}}
fs.writeFileSync('nameidx.json',JSON.stringify(idx));console.log(Object.keys(idx).length);
