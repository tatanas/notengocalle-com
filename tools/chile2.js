// Chile: más ciudades (con población) y parques nacionales. Reutiliza las regiones de chile.json.
const fs=require('fs');const turf=require('@turf/turf');
const base=JSON.parse(fs.readFileSync('chile.json'));const feats=base.regions.features;
const UA={'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz)'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cache=fs.existsSync('chilecache.json')?JSON.parse(fs.readFileSync('chilecache.json')):{};
async function get(url,wait){if(cache[url])return cache[url];for(let t=0;t<4;t++){try{const r=await fetch(url,{headers:UA});if(r.status!==200){await sleep(3000*(t+1));continue;}const j=await r.json();cache[url]=j;fs.writeFileSync('chilecache.json',JSON.stringify(cache));await sleep(wait);return j;}catch(e){await sleep(3000);}}return null;}
const regionOf=(lon,lat)=>{const f=feats.find(f=>turf.booleanPointInPolygon([lon,lat],f));if(f)return f.properties.name;let bd=1e9,rn=null;for(const f of feats){const l=turf.polygonToLine(f);for(const ln of (l.features||[l])){const parts=ln.geometry.type==='MultiLineString'?ln.geometry.coordinates.map(c=>turf.lineString(c)):[ln];for(const p of parts){const d=turf.pointToLineDistance([lon,lat],p);if(d<bd){bd=d;rn=f.properties.name;}}}}return rn;};
const cities=["Arica","Putre","Iquique","Alto Hospicio","Pozo Almonte","Tocopilla","Calama","San Pedro de Atacama","Mejillones","Antofagasta","Taltal","Chañaral","Diego de Almagro","Caldera","Copiapó","Vallenar","Huasco","La Serena","Coquimbo","Vicuña","Andacollo","Ovalle","Illapel","Los Vilos","La Ligua","Los Andes","San Felipe","Quillota","La Calera","Concón","Viña del Mar","Valparaíso","Quilpué","Villa Alemana","Casablanca","San Antonio","Santiago","Colina","Melipilla","Talagante","Buin","Rancagua","Rengo","San Fernando","Santa Cruz","Pichilemu","Curicó","Molina","Talca","Constitución","Linares","Parral","Cauquenes","San Carlos","Chillán","Tomé","Talcahuano","Concepción","Coronel","Lota","Arauco","Lebu","Cañete","Los Ángeles","Angol","Victoria","Lautaro","Temuco","Nueva Imperial","Villarrica","Pucón","Panguipulli","Valdivia","La Unión","Río Bueno","Osorno","Frutillar","Puerto Varas","Puerto Montt","Calbuco","Ancud","Castro","Quellón","Chaitén","Futaleufú","Coyhaique","Puerto Aysén","Chile Chico","Cochrane","Puerto Natales","Punta Arenas","Porvenir","Puerto Williams"];
const FIX={"San Pedro de Atacama":[-22.911,-68.200],"Santa Cruz":[-34.639,-71.365],"San Carlos":[-36.424,-71.958],"Victoria":[-38.233,-72.333],"La Unión":[-40.293,-73.083],"Arauco":[-37.246,-73.317],"Constitución":[-35.333,-72.412],"Molina":[-35.114,-71.283],"Colina":[-33.202,-70.675],"Buin":[-33.732,-70.742],"Vicuña":[-30.032,-70.708],"Cañete":[-37.801,-73.397],"Cochrane":[-47.254,-72.573],"Porvenir":[-53.296,-70.369]};
(async()=>{
  const out=[];
  for(const c of cities){
    const j=await get('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&extratags=1&q='+encodeURIComponent(c+', Chile'),1100);
    const h=j&&j[0];let lat=h?+h.lat:null,lon=h?+h.lon:null;if(FIX[c])[lat,lon]=FIX[c];if(lat==null){console.log('MISS',c);continue;}
    let pop=h&&h.extratags&&h.extratags.population?+String(h.extratags.population).replace(/\D/g,''):null;const q=h&&h.extratags&&h.extratags.wikidata;
    if(q){const w=await get('https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P1082&entity='+q,200);const cl=w&&w.claims&&w.claims.P1082;
      if(cl&&cl.length){const vals=cl.map(x=>({v:+x.mainsnak.datavalue.value.amount,t:(x.qualifiers&&x.qualifiers.P585&&x.qualifiers.P585[0].datavalue.value.time)||'',pref:x.rank==='preferred'})).sort((a,b)=>(b.pref-a.pref)||b.t.localeCompare(a.t));if(vals[0].v>0)pop=vals[0].v;}}
    const region=regionOf(lon,lat);out.push({name:c,lat:+lat.toFixed(3),lon:+lon.toFixed(3),region,cap:feats.some(f=>f.properties.cap===c),pop:pop||null});
    console.log(c.padEnd(22),lat.toFixed(2),lon.toFixed(2),(region||'?').padEnd(26),pop);
  }
  // parques nacionales
  const P=JSON.parse(fs.readFileSync('parks_raw.json'));const m={};
  for(const e of P.elements){let n=e.tags.name.replace(/^Parque Nacional (y Reserva Nacional )?/,'').trim();if(/Los Glaciares/.test(n))continue;if(!m[n]||e.type==='relation')m[n]={name:n,lat:+e.center.lat.toFixed(3),lon:+e.center.lon.toFixed(3)};}
  const parks=Object.values(m).map(p=>({...p,region:/Rapa Nui|Juan Fernández/.test(p.name)?'Valparaíso':regionOf(p.lon,p.lat)})).sort((a,b)=>b.lat-a.lat);
  console.log(parks.length,'parques:',parks.map(p=>p.name+' ['+p.region+']').join(' | '));
  fs.writeFileSync('chile.json',JSON.stringify({regions:base.regions,cities:out,parks}));console.log('ciudades',out.length,'sin población:',out.filter(c=>!c.pop).map(c=>c.name).join(', '));
})();
