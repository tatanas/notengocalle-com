// Fotos de parques nacionales (Wikidata P18 + categoría de Commons + artículo de Wikipedia)
const fs=require('fs');
const UA={'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz; https://www.openstreetmap.org/) node-fetch'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(host,p){for(let t=0;t<6;t++){try{const r=await fetch(`https://${host}/w/api.php?`+new URLSearchParams({format:'json',formatversion:'2',...p}),{headers:UA});if(r.status!==200){await sleep(3000*(t+1));continue;}await sleep(150);return await r.json();}catch(e){await sleep(2000);}}return {};}
const BAD=/(\bmap\b|mapa|plano|logo|escudo|location|locator|\.svg|\.png|\.gif|\.tif|\.webm|\.ogv|\.pdf|bandera|flag|diagram|letrero|cartel|sign|señal|entrada|acceso|portal|conaf|guard|oficina|panel|placa|stamp|sello)/i;
(async()=>{
  const raw=JSON.parse(fs.readFileSync('parks_raw.json'));const chile=JSON.parse(fs.readFileSync('chile.json'));
  const wdOf={};for(const e of raw.elements){const n=e.tags.name.replace(/^Parque Nacional (y Reserva Nacional )?/,'').trim();if(e.tags.wikidata&&(!wdOf[n]||e.type==='relation'))wdOf[n]=e.tags.wikidata;}
  const res={};
  for(const p of chile.parks){const files=[];let q=wdOf[p.name];
    if(!q){const j=await api('es.wikipedia.org',{action:'query',titles:'Parque nacional '+p.name,prop:'pageprops|pageimages',piprop:'name',ppprop:'wikibase_item',redirects:'1'});const pg=j.query&&j.query.pages&&j.query.pages[0];if(pg&&!pg.missing){q=pg.pageprops&&pg.pageprops.wikibase_item;if(pg.pageimage)files.push('File:'+pg.pageimage);}}
    if(q){const j=await api('www.wikidata.org',{action:'wbgetentities',ids:q,props:'claims|sitelinks'});const e=j.entities&&j.entities[q];if(e){const c=e.claims||{};
        if(c.P18)files.unshift('File:'+c.P18[0].mainsnak.datavalue.value);
        const es=e.sitelinks&&e.sitelinks.eswiki&&e.sitelinks.eswiki.title;if(es){const k=await api('es.wikipedia.org',{action:'query',titles:es,prop:'pageimages',piprop:'name',redirects:'1'});const pg=k.query&&k.query.pages&&k.query.pages[0];if(pg&&pg.pageimage)files.push('File:'+pg.pageimage);}
        if(c.P373){const cat=c.P373[0].mainsnak.datavalue.value;const k=await api('commons.wikimedia.org',{action:'query',list:'categorymembers',cmtitle:'Category:'+cat,cmtype:'file',cmlimit:'40'});files.push(...((k.query&&k.query.categorymembers)||[]).map(m=>m.title));}}}
    res[p.name]=[...new Set(files)].filter(t=>!BAD.test(t)).slice(0,14);console.log(p.name,q||'-',res[p.name].length);}
  const all=[...new Set(Object.values(res).flat())];const info={};
  for(let i=0;i<all.length;i+=40){const j=await api('commons.wikimedia.org',{action:'query',titles:all.slice(i,i+40).join('|'),prop:'imageinfo',iiprop:'url|extmetadata|size|mime',iiurlwidth:'800',iiextmetadatafilter:'Artist|LicenseShortName'});
    for(const p of (j.query&&j.query.pages)||[]){const ii=p.imageinfo&&p.imageinfo[0];if(!ii||!/jpeg/.test(ii.mime)||ii.width<700||ii.height>ii.width*1.1)continue;const m=ii.extmetadata||{};
      info[p.title]={u:ii.thumburl,f:p.title.replace(/^File:/,''),a:(((m.Artist||{}).value)||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,60)||'desconocido',l:((m.LicenseShortName||{}).value)||''};}}
  const out={};for(const [k,fs_] of Object.entries(res)){const ps=fs_.map(f=>info[f]).filter(Boolean).slice(0,4);if(ps.length)out[k]=ps;}
  fs.writeFileSync('parkphotos.json',JSON.stringify(out));
  const o={};let i=0;for(const [k,v] of Object.entries(out))v.forEach(x=>{o[i+' '+k.slice(0,22)]=[x];i++;});fs.writeFileSync('photos_tmp.json',JSON.stringify(o));
  console.log('parques con foto',Object.keys(out).length,'/',chile.parks.length,'fotos',i,'| sin:',chile.parks.filter(p=>!out[p.name]).map(p=>p.name).join(', '));
})();
