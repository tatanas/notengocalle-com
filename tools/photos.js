// Busca fotos libres (Wikimedia Commons) para landmarks, cerros y calles.
const fs=require('fs');
const UA={'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz; https://www.openstreetmap.org/) node-fetch'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cache=fs.existsSync('wmcache.json')?JSON.parse(fs.readFileSync('wmcache.json')):{};
let dirty=0;
async function api(host,params){
  const url=`https://${host}/w/api.php?`+new URLSearchParams({format:'json',formatversion:'2',...params});
  if(cache[url])return cache[url];
  for(let t=0;t<8;t++){
    try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),20000);
      const r=await fetch(url,{headers:UA,signal:ctl.signal});clearTimeout(to);
      if(r.status===429||r.status>=500){const ra=+(r.headers.get('retry-after')||0);await sleep(Math.max(ra*1000,4000*(t+1)));continue;}
      const j=await r.json();if(j.error){if(j.error.code==='maxlag'){await sleep(5000);continue;}return j;}
      cache[url]=j;if(++dirty%20==0)fs.writeFileSync('wmcache.json',JSON.stringify(cache));await sleep(150);return j;
    }catch(e){await sleep(3000);}}
  return {};
}
async function wd(q){
  const url='wd:'+q;if(cache[url])return cache[url];
  const j=await api('www.wikidata.org',{action:'wbgetentities',ids:q,props:'claims|sitelinks'});
  const e=j.entities&&j.entities[q];const out={img:null,cat:null,eswiki:null};
  if(e){const c=e.claims||{};
    if(c.P18)out.img=c.P18[0].mainsnak.datavalue&&c.P18[0].mainsnak.datavalue.value;
    if(c.P373)out.cat=c.P373[0].mainsnak.datavalue&&c.P373[0].mainsnak.datavalue.value;
    if(e.sitelinks&&e.sitelinks.eswiki)out.eswiki=e.sitelinks.eswiki.title;}
  cache[url]=out;return out;
}
const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const STOP=new Set(['de','la','el','los','las','del','y','en','a','e','o','al','ex','hoy','u','av']);
const toks=s=>norm(s).split(/[^a-z0-9]+/).filter(w=>w.length>1&&!STOP.has(w));
function score(name,title){
  const alts=[name,...name.split(/[\/()–—-]/).map(x=>x.trim()).filter(x=>x.length>3)];
  const tt=new Set(toks(title));let best=0;
  for(const a of alts){const at=toks(a);if(!at.length)continue;const hit=at.filter(w=>tt.has(w)).length;best=Math.max(best,hit/at.length*(at.length>=2||hit?1:0));}
  return best;
}
const BAD=/(metro|and[eé]n|l[ií]nea_[0-9]|estaci[oó]n_[a-z_]*\(metro|\bmap\b|mapa|plano|logo|escudo|location|locator|\.svg|\.png|\.gif|\.tif|\.webm|\.ogv|\.pdf|bandera|flag|diagram|grafico|seal)/i;
async function catFiles(cat,n=12){
  const j=await api('commons.wikimedia.org',{action:'query',list:'categorymembers',cmtitle:'Category:'+cat,cmtype:'file',cmlimit:'40'});
  return ((j.query&&j.query.categorymembers)||[]).map(m=>m.title).filter(t=>!BAD.test(t)).slice(0,n);
}
async function commonsGeo(lat,lon,radius,name,minScore){
  const j=await api('commons.wikimedia.org',{action:'query',list:'geosearch',gscoord:`${lat}|${lon}`,gsradius:String(radius),gsnamespace:'6',gslimit:'50'});
  return ((j.query&&j.query.geosearch)||[]).map(g=>g.title).filter(t=>!BAD.test(t)&&score(name,t.replace(/^File:/,''))>=minScore);
}
async function wikiPage(lat,lon,radius,name){
  const j=await api('es.wikipedia.org',{action:'query',list:'geosearch',gscoord:`${lat}|${lon}`,gsradius:String(radius),gslimit:'50'});
  const isSt=t=>/\(estaci[oó]n|metro de santiago/i.test(t)&&!/estaci[oó]n/i.test(name);
  const cands=((j.query&&j.query.geosearch)||[]).map(g=>({t:g.title,d:g.dist,s:score(name,g.title)})).filter(c=>c.s>=0.6&&!isSt(c.t)).sort((a,b)=>b.s-a.s||a.d-b.d);
  if(cands.length)return cands[0].t;
  // búsqueda por texto + verificación de coordenadas
  const k=await api('es.wikipedia.org',{action:'query',generator:'search',gsrsearch:name+' Santiago',gsrlimit:'5',prop:'coordinates'});
  const pages=((k.query&&k.query.pages)||[]).filter(p=>p.coordinates&&Math.hypot((p.coordinates[0].lat-lat)*111,(p.coordinates[0].lon-lon)*93)<radius/1000*1.5&&score(name,p.title)>=0.6&&!isSt(p.title));
  return pages.length?pages.sort((a,b)=>score(name,b.title)-score(name,a.title))[0].title:null;
}
async function pageInfo(title){
  const j=await api('es.wikipedia.org',{action:'query',titles:title,prop:'pageimages|pageprops',piprop:'name',ppprop:'wikibase_item',redirects:'1'});
  const p=j.query&&j.query.pages&&j.query.pages[0];
  return p?{img:p.pageimage||null,q:p.pageprops&&p.pageprops.wikibase_item}:{};
}
async function imageInfo(files){
  const out={};
  for(let i=0;i<files.length;i+=40){
    const j=await api('commons.wikimedia.org',{action:'query',titles:files.slice(i,i+40).join('|'),prop:'imageinfo',iiprop:'url|extmetadata|size|mime',iiurlwidth:'800',iiextmetadatafilter:'Artist|LicenseShortName'});
    for(const p of (j.query&&j.query.pages)||[]){const ii=p.imageinfo&&p.imageinfo[0];if(!ii||!/jpeg/.test(ii.mime))continue;
      const m=ii.extmetadata||{};const artist=((m.Artist&&m.Artist.value)||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,60);
      out[p.title]={u:ii.thumburl,f:p.title.replace(/^File:/,''),a:artist||'desconocido',l:(m.LicenseShortName&&m.LicenseShortName.value)||'',w:ii.width,h:ii.height};}
  }
  return out;
}
async function forPlace(name,lat,lon,q,radius){
  const files=[];const src=[];
  let page=null,qid=q;
  if(!qid){page=await wikiPage(lat,lon,radius,name);if(page){const pi=await pageInfo(page);if(pi.img)files.push('File:'+pi.img);qid=pi.q;}}
  if(qid){const w=await wd(qid);if(w.img)files.unshift('File:'+w.img);if(w.cat)files.push(...await catFiles(w.cat));
    if(!page&&w.eswiki){const pi=await pageInfo(w.eswiki);if(pi.img)files.push('File:'+pi.img);}src.push(qid);}
  if(files.length<3)files.push(...await commonsGeo(lat,lon,Math.min(radius,400),name,0.5));
  return {files:[...new Set(files)].filter(t=>!BAD.test(t)),src:page||qid||'geo'};
}
(async()=>{
  const lm=JSON.parse(fs.readFileSync('landmarks.json'));
  const cerros=JSON.parse(fs.readFileSync('cerros.json'));
  const streets=JSON.parse(fs.readFileSync('streets.json'));
  const res={};const log=[];
  for(const l of lm){const r=await forPlace(l.name,l.lat,l.lon,null,1200);res['l:'+l.name]=r;log.push(`L ${l.name} | ${r.src} | ${r.files.length}`);}
  for(const c of cerros){const r=await forPlace(c.name.replace(/ \(.*\)/,''),c.lat,c.lon,c.wikidata,2500);res['c:'+c.name]=r;log.push(`C ${c.name} | ${r.src} | ${r.files.length}`);}
  for(const s of streets){
    let core=s.name.replace(/^Av\. /,'').replace(/\s*\(.*\)/,'').replace(/^Alameda$/,"Libertador Bernardo O'Higgins").replace(/^Gran Avenida$/,'Gran Avenida José Miguel Carrera');
    if(/^Alameda/.test(s.name))core="Libertador Bernardo O'Higgins";
    const files=[];let src='';
    // categoría de Commons
    const j=await api('commons.wikimedia.org',{action:'query',list:'search',srnamespace:'14',srsearch:`intitle:"${core}"`,srlimit:'15'});
    const cats=((j.query&&j.query.search)||[]).map(x=>x.title.replace(/^Category:/,'')).filter(t=>new RegExp('^((Avenida|Calle|Autopista|Paseo)\\s+)'+core.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'( \\(Santiago[^)]*\\)|,? Santiago| \\(Chile\\)|, Chile)?$','i').test(t));
    for(const c of cats.slice(0,2)){files.push(...await catFiles(c,10));src+=c+';';}
    // artículo de Wikipedia
    const k=await api('es.wikipedia.org',{action:'query',titles:`Avenida ${core}|Autopista ${core}|Avenida ${core} (Santiago)`,prop:'pageimages|pageprops',piprop:'name',ppprop:'wikibase_item',redirects:'1'});
    for(const p of (k.query&&k.query.pages)||[]){if(p.missing)continue;if(p.pageimage)files.unshift('File:'+p.pageimage);src+='wp:'+p.title+';';
      if(p.pageprops&&p.pageprops.wikibase_item){const w=await wd(p.pageprops.wikibase_item);if(w.img)files.unshift('File:'+w.img);if(w.cat&&!cats.includes(w.cat))files.push(...await catFiles(w.cat,10));}}
    res['s:'+s.name]={files:[...new Set(files)].filter(t=>!BAD.test(t)),src:src||'-'};log.push(`S ${s.name} | ${src} | ${res['s:'+s.name].files.length}`);
  }
  // metadatos de las fotos (máx 5 por ítem)
  const all=[...new Set(Object.values(res).flatMap(r=>r.files.slice(0,8)))];
  const info=await imageInfo(all);
  const DROP=new Set(['l:Parque Laguna Carén','l:Bajos de Mena','l:Mall Plaza Sur','l:Hospital de La Florida','l:Mercado Lo Valledor','l:Escuela de Carabineros','l:Ex Penitenciaría (Santiago 1)','l:Universidad del Desarrollo (UDD)','l:Universidad Adolfo Ibáñez (campus principal)','l:Universidad San Sebastián – Bellavista','l:Universidad Andrés Bello – República','l:Universidad Autónoma – San Miguel','l:Colegio Mayflower','l:Fuente Alemana','l:Bar Liguria (Manuel Montt)','l:Emporio La Rosa (Lastarria)','l:Dominó (Agustinas)','l:Clínica Dávila','s:Costanera Norte','s:Av. Nueva Providencia','s:Av. Paul Harris','s:Av. El Salto','s:Av. Independencia','s:Av. Pocuro']);
  const photos={};
  for(const [k,r] of Object.entries(res)){if(DROP.has(k))continue;const ps=r.files.map(f=>info[f]).filter(Boolean).filter(p=>p.w>=500).slice(0,5);if(ps.length)photos[k]=ps.map(({w,h,...p})=>p);}
  fs.writeFileSync('wmcache.json',JSON.stringify(cache));
  fs.writeFileSync('photos.json',JSON.stringify(photos));
  fs.writeFileSync('photos_log.txt',log.join('\n'));
  const cnt=p=>Object.keys(photos).filter(k=>k.startsWith(p)).length;
  console.log('landmarks',cnt('l:'),'/',lm.length,'cerros',cnt('c:'),'/',cerros.length,'calles',cnt('s:'),'/',streets.length,'fotos',Object.values(photos).reduce((s,a)=>s+a.length,0));
})();
