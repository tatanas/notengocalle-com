const fs=require('fs');const turf=require('@turf/turf');
const list=require('./lmlist.js').filter(x=>x[2]&&x[4]!=='(fallback)');
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson'));
const comunaOf=(lon,lat)=>{const p=turf.point([lon,lat]);for(const f of comunas.features)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};
const cache=fs.existsSync('geocache.json')?JSON.parse(fs.readFileSync('geocache.json')):{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const out=[];
  for(const [name,cat,q,exp,desc] of list){
    let r=cache[q];
    if(r===undefined){
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=cl&viewbox=-70.95,-33.20,-70.30,-33.80&bounded=1&q='+encodeURIComponent(q);
      try{const res=await fetch(url,{headers:{'User-Agent':'SantiagoQuiz/1.0 personal study app','Accept-Language':'es'}});r=await res.json();}catch(e){r=null;}
      cache[q]=r;fs.writeFileSync('geocache.json',JSON.stringify(cache));await sleep(1100);
    }
    const hit=r&&r[0];
    const o={name,cat,exp,desc,q};
    if(hit){o.lat=+(+hit.lat).toFixed(5);o.lon=+(+hit.lon).toFixed(5);o.comuna=comunaOf(o.lon,o.lat);o.found=hit.display_name.slice(0,90);}
    out.push(o);
    console.log((hit?(o.comuna===exp?'OK  ':'DIFF'):'MISS'),name,'|',exp,'->',o.comuna,'|',o.found||'');
  }
  fs.writeFileSync('landmarks_geo.json',JSON.stringify(out,null,0));
})();
