const fs=require('fs');const o2g=require('osmtogeojson');const turf=require('@turf/turf');
const raw=JSON.parse(fs.readFileSync('comunas_raw.json'));
const gj=o2g(raw);
const feats=gj.features.filter(f=>f.id.startsWith('relation')&&/Polygon/.test(f.geometry.type));
for(const f of feats){const c=turf.centroid(f).geometry.coordinates;console.log(f.properties.name,'|',f.geometry.type,'|',c.map(x=>x.toFixed(3)).join(','),'|',(turf.area(f)/1e6).toFixed(0));}
fs.writeFileSync('comunas_all.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
