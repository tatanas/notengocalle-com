S=r'C:\Users\tatan\AppData\Local\Temp\claude\c--Users-tatan-OneDrive-Documents-Webadas-Santiago\f225289a-dede-4696-ae8a-ee96dd25299f\scratchpad'
# --- relations.js: calles en todas las comunas a <60 m (límites como Kennedy cuentan para ambas)
p=S+r'\relations.js';s=open(p,encoding='utf8').read()
a="  const comunaOf=(lat,lon)=>{const p=turf.point([lon,lat]);for(const f of comunas)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};"
b="""  const comunaOf=(lat,lon)=>{const p=turf.point([lon,lat]);for(const f of comunas)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};
  const bufs=comunas.filter(f=>f.properties.group!=='rural').map(f=>({n:f.properties.name,b:turf.buffer(f,0.06),bb:turf.bbox(turf.buffer(f,0.06))}));
  const comunasAt=(lat,lon)=>{const p=[lon,lat];return bufs.filter(o=>lon>=o.bb[0]&&lon<=o.bb[2]&&lat>=o.bb[1]&&lat<=o.bb[3]&&turf.booleanPointInPolygon(p,o.b)).map(o=>o.n);};"""
assert a in s; s=s.replace(a,b)
a="for(const p of sm){const c=comunaOf(p[0],p[1]);if(c)per[c]=(per[c]||0)+50;}"
b="for(const p of sm){for(const c of comunasAt(p[0],p[1]))per[c]=(per[c]||0)+50;}"
assert a in s; s=s.replace(a,b)
a="comunas:[...new Set(pts.map(p=>comunaOf(p[0],p[1])).filter(Boolean))]"
b="comunas:[...new Set(pts.flatMap(p=>comunasAt(p[0],p[1])))]"
assert a in s; s=s.replace(a,b)
open(p,'w',encoding='utf8').write(s)

# --- build_data.js: comunas alternativas por cercanía al límite + fronteras
p=S+r'\build_data.js';s=open(p,encoding='utf8').read()
a="const data={comunas:"
b="""// lugares en el límite entre comunas: aceptar ambas
const lines=feats.map(f=>({n:f.properties.name,g:f.properties.group,l:turf.polygonToLine(f),bb:turf.bbox(f)}));
function altsNear(lat,lon,own,km){const pt=turf.point([lon,lat]);const out=[];
  for(const o of lines){if(o.n===own)continue;if(lon<o.bb[0]-0.01||lon>o.bb[2]+0.01||lat<o.bb[1]-0.01||lat>o.bb[3]+0.01)continue;
    const ls=o.l.type==='FeatureCollection'?o.l.features:[o.l];const d=Math.min(...ls.map(l=>turf.pointToLineDistance(pt,l)));
    if(d<=km||turf.booleanPointInPolygon(pt,feats.find(f=>f.properties.name===o.n)))out.push(o.n);}
  return out;}
let nAlt=0;
for(const l of landmarks){const a=altsNear(l.lat,l.lon,l.comuna,0.15);const al=[...new Set([...(l.alt||[]),...a])].filter(c=>c!==l.comuna);if(al.length){l.alt=al;nAlt++;}}
for(const st of metro.stations){const a=altsNear(st.lat,st.lon,st.comuna,0.12);if(a.length){st.alt=a;nAlt++;}}
for(const c of cerros){const a=altsNear(c.lat,c.lon,c.comuna,0.3);if(a.length){c.alt=a;nAlt++;}}
console.log('elementos con comuna alternativa (límite):',nAlt);
const borders=fs.existsSync('borders.json')?JSON.parse(fs.readFileSync('borders.json')):[];
const data={comunas:"""
assert a in s; s=s.replace(a,b,1)
s=s.replace("inter:R.inter,para:R.para,","inter:R.inter,para:R.para,borders,")
open(p,'w',encoding='utf8').write(s)
print('ok')
