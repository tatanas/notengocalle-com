// Tras agregar/quitar landmarks los ids (l0, l1…) se corren. Este script reasigna los ids de las rutas
// (steproutes.json, transit.json, routes.json) comparando coordenadas con la versión anterior de landmarks,
// y descarta las rutas cuyo origen o destino fue eliminado.
// Uso:  cp landmarks.json landmarks.prev.json   (ANTES de correr finalize_lm.js)
//       node geocode.js && node finalize_lm.js && node remap_routes.js
const fs=require('fs');
const old=JSON.parse(fs.readFileSync('landmarks.prev.json')),nw=JSON.parse(fs.readFileSync('landmarks.json'));
const map={home:'home',sj:'sj'};const gone=[];
for(const o of old){const m=nw.find(n=>Math.abs(n.lat-o.lat)<1e-5&&Math.abs(n.lon-o.lon)<1e-5);if(m)map[o.id]=m.id;else gone.push(o.name);}
console.log('landmarks que ya no están:',gone.join(', ')||'(ninguno)');
for(const f of ['steproutes.json','transit.json','routes.json']){const R=JSON.parse(fs.readFileSync(f));const out=[];
  for(const r of R){if(!map[r.from]||!map[r.to])continue;r.from=map[r.from];r.to=map[r.to];if(r.k)r.k=r.from+'>'+r.to;out.push(r);}
  fs.writeFileSync(f,JSON.stringify(out));console.log(f,R.length,'->',out.length);}
