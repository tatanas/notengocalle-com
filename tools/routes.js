const fs=require('fs');
const lm=JSON.parse(fs.readFileSync('landmarks.json'));
const hubsNames=["Palacio de La Moneda","Plaza Italia (Plaza Baquedano)","Costanera Center / Gran Torre Santiago","Estadio Nacional","Estadio Monumental (Colo-Colo)","Aeropuerto Arturo Merino Benítez","PUC – Campus San Joaquín","Universidad del Desarrollo (UDD)","Portal La Dehesa","Parque Arauco","Mall Plaza Vespucio","Plaza de Maipú","Plaza de Puente Alto","Mall Plaza Oeste","Mall Plaza Norte","Plaza Ñuñoa","Plaza Egaña","USACH","U. de Chile – Beauchef (FCFM)","U. de Chile – Juan Gómez Millas","Mall Plaza Tobalaba","Ciudad Empresarial","Templo Votivo de Maipú","Plaza de San Bernardo","Clínica Alemana","Pueblito Los Dominicos","Barrio Italia","Parque O'Higgins","Estación Central (ferrocarriles)","Barrio Bellavista","Hospital Sótero del Río","Mall Arauco Maipú","Universidad Adolfo Ibáñez – Peñalolén","Clínica Las Condes","Chicureo","Cementerio General","Mall Plaza Egaña","Parque Bicentenario (Vitacura)","La Vega Central","Estadio Bicentenario de La Florida","Museo Interactivo Mirador (MIM)","Hospital Clínico U. de Chile (J.J. Aguirre)","Colegio Verbo Divino","Saint George's College","Santiago College","Mall Plaza Los Dominicos","Universidad de los Andes","Parque Padre Hurtado","Mall Florida Center","Cerro Santa Lucía"];
const hubs=hubsNames.map(n=>{const h=lm.find(l=>l.name===n);if(!h)throw new Error('no hub '+n);return h;});
const ORIENTE=new Set(['Las Condes','Vitacura','Lo Barnechea','Providencia','Ñuñoa','La Reina']);
const km=(a,b)=>Math.hypot((a.lon-b.lon)*93,(a.lat-b.lat)*111);
// deterministic PRNG
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const pairs=[];const seen=new Set();let tries=0;
while(pairs.length<150&&tries<20000){tries++;
  const a=hubs[Math.floor(rnd()*hubs.length)],b=hubs[Math.floor(rnd()*hubs.length)];
  if(a===b)continue;const d=km(a,b);if(d<4||d>26)continue;
  const k=[a.id,b.id].sort().join('-');if(seen.has(k))continue;
  const ori=ORIENTE.has(a.comuna)||ORIENTE.has(b.comuna);
  if(!ori&&pairs.filter(p=>!p.ori).length>=60)continue;
  seen.add(k);pairs.push({a,b,ori});}
const nice=s=>s.replace(/^Avenida /,'Av. ').replace(/^Autopista /,'Autopista ').replace(/ Lateral$/,'').replace(/^Caletera /,'').replace(/ (Norte|Sur|Oriente|Poniente)$/,(m)=>/Vespucio|Padre Hurtado|Manquehue/.test(s)?'':m).trim();
const canon=s=>{s=nice(s);
  if(/Vespucio/.test(s))return 'Américo Vespucio';
  if(/Costanera Norte/.test(s))return 'Costanera Norte';
  if(/Libertador Bernardo O.Higgins/.test(s))return 'Alameda';
  if(/Presidente Kennedy/.test(s))return 'Av. Kennedy';
  if(/Autopista Central|General Velásquez/.test(s))return 'Autopista Central';
  if(/Vicuña Mackenna/.test(s))return 'Av. Vicuña Mackenna';
  if(/^Ruta 68|Autopista del Pacífico/.test(s))return 'Ruta 68';
  if(/^Ruta 78|Autopista del Sol/.test(s))return 'Autopista del Sol';
  if(/Gran Avenida/.test(s))return 'Gran Avenida';
  if(/Padre Hurtado/.test(s))return 'Av. Padre Hurtado';
  if(/Manquehue/.test(s)&&/^Av/.test(s))return 'Av. Manquehue';
  if(/Costanera Sur|Escrivá de Balaguer/.test(s))return 'Costanera Sur / Escrivá de Balaguer';
  if(/Túnel San Cristóbal/.test(s))return 'Túnel San Cristóbal';
  return s;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const out=[];const cache=fs.existsSync('osrmcache.json')?JSON.parse(fs.readFileSync('osrmcache.json')):{};
for(const p of pairs){
  const url=`https://router.project-osrm.org/route/v1/driving/${p.a.lon},${p.a.lat};${p.b.lon},${p.b.lat}?steps=true&overview=simplified&geometries=geojson`;
  let j=cache[url];
  if(!j){try{j=await (await fetch(url,{headers:{'User-Agent':'SantiagoQuiz/1.0'}})).json();}catch(e){console.log('ERR',e.message);await sleep(2000);continue;}
  cache[url]=j;fs.writeFileSync('osrmcache.json',JSON.stringify(cache));await sleep(1000);}
  if(!j.routes||!j.routes[0]){console.log('no route',p.a.name,p.b.name);continue;}
  const r=j.routes[0];const per={};const order=[];
  for(const st of r.legs[0].steps){const n=st.name||st.ref||'';if(!n)continue;const c=canon(n);if(!per[c]){per[c]=0;order.push(c);}per[c]+=st.distance;}
  const total=r.distance;
  let main=order.filter(c=>per[c]>=Math.min(700,0.08*total)||per[c]>=0.15*total);
  if(main.length>5)main=main.sort((x,y)=>per[y]-per[x]).slice(0,5).sort((x,y)=>order.indexOf(x)-order.indexOf(y));
  if(main.length<2){console.log('skip short',p.a.name,'->',p.b.name,order.join(','));continue;}
  out.push({id:'r'+out.length,from:p.a.id,to:p.b.id,km:+(total/1000).toFixed(1),min:Math.round(r.duration/60),streets:main,geom:r.geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)])});
  console.log(p.a.name,'->',p.b.name,'|',main.join(' → '));
}
fs.writeFileSync('routes.json',JSON.stringify(out));console.log(out.length,'routes');})();
