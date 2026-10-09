// Fotos actuales (≥2005) a nivel de calle para cada calle: búsqueda de archivos en Wikimedia Commons + Panoramax.
const fs=require('fs');
const UA={'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz; https://www.openstreetmap.org/) node-fetch'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cache=fs.existsSync('wmcache2.json')?JSON.parse(fs.readFileSync('wmcache2.json')):{};let dirty=0;
async function api(params){
  const url='https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({format:'json',formatversion:'2',...params});
  if(cache[url])return cache[url];
  for(let t=0;t<8;t++){try{const r=await fetch(url,{headers:UA});if(r.status===429||r.status>=500){await sleep(4000*(t+1));continue;}
      const j=await r.json();if(j.error)return j;cache[url]=j;if(++dirty%20==0)fs.writeFileSync('wmcache2.json',JSON.stringify(cache));await sleep(150);return j;}catch(e){await sleep(3000);}}
  return {};
}
const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const BAD=/(metro|and[eé]n|estaci[oó]n|\bmap\b|mapa|plano|logo|escudo|\.svg|\.png|\.gif|\.tif|\.webm|\.pdf|a[eé]re[ao]|aerial|satel|landsat|sentinel|18\d\d|19\d\d|antigu|hist[oó]ric|retrato|portrait|placa|letrero|firma|busto|estatua|monumento a|protest|marcha|manifest|bandera|bus_|micro_|transantiago|\bRED\b)/i;
(async()=>{
  const done0=Object.assign({},JSON.parse(fs.readFileSync('photos_streets.json')),JSON.parse(fs.readFileSync('photos_streets2.json')));const streets=JSON.parse(fs.readFileSync('streets.json')).filter(s=>!(s.name in done0)&&s.kind!=='tren');console.log('nuevas',streets.map(s=>s.name).join(', '));
  const prev=JSON.parse(fs.readFileSync('photos.json'));
  const res={};const log=[];
  for(const s of streets){
    let core=s.name.replace(/^Av\. /,'').replace(/\s*\(.*\)/,'');
    if(/^Alameda/.test(s.name))core="Libertador Bernardo O'Higgins";
    if(/^Gran Avenida/.test(s.name))core='Gran Avenida';
    if(/Matta/.test(s.name))core='Matta';
    const isAv=/^Av\. |^Alameda|^Gran/.test(s.name);
    const titles=new Set((prev['s:'+s.name]||[]).map(p=>'File:'+p.f));
    const qs=[];
    if(isAv){qs.push(`intitle:"Avenida ${core}"`,`intitle:"Av. ${core}"`,`intitle:"Av ${core}"`);}
    qs.push(`intitle:"${core}" Santiago Chile`);
    if(/^Alameda/.test(s.name))qs.push('intitle:"Alameda" Santiago Chile avenida');
    for(const q of qs){const j=await api({action:'query',list:'search',srnamespace:'6',srsearch:q+' filetype:bitmap',srlimit:'30'});
      for(const x of (j.query&&j.query.search)||[]){const t=x.title;if(BAD.test(t))continue;
        const nt=norm(t);if(!nt.includes(norm(core).split(' ').pop()))continue;
        if(!/santiago|chile|providencia|condes|vitacura|nunoa|macul|florida|maipu|recoleta|barnechea|reina|penalolen|puente alto|\b20[012]\d/.test(nt)&&!isAv)continue;
        titles.add(t);}}
    res[s.name]=[...titles];
  }
  // metadatos + fecha
  const all=[...new Set(Object.values(res).flat())];const info={};
  for(let i=0;i<all.length;i+=40){const j=await api({action:'query',titles:all.slice(i,i+40).join('|'),prop:'imageinfo',iiprop:'url|extmetadata|size|mime',iiurlwidth:'800',iiextmetadatafilter:'Artist|LicenseShortName|DateTimeOriginal|DateTime|Categories|ImageDescription'});
    for(const p of (j.query&&j.query.pages)||[]){const ii=p.imageinfo&&p.imageinfo[0];if(!ii||!/jpeg/.test(ii.mime))continue;const m=ii.extmetadata||{};
      const dt=((m.DateTimeOriginal&&m.DateTimeOriginal.value)||'').replace(/<[^>]*>/g,'');const y=+(dt.match(/(19|20)\d\d/)||[0])[0];
      const cats=((m.Categories&&m.Categories.value)||'')+' '+((m.ImageDescription&&m.ImageDescription.value)||'');
      if(y&&y<2005)continue;if(/aerial|a[eé]rea|satellite|histor|black and white|18\d\d|19[0-8]\d/i.test(cats))continue;
      if(ii.width<700||ii.height>ii.width*1.25)continue; // nada vertical ni muy chico
      const artist=((m.Artist&&m.Artist.value)||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,60);
      info[p.title]={u:ii.thumburl,f:p.title.replace(/^File:/,''),a:artist||'desconocido',l:(m.LicenseShortName&&m.LicenseShortName.value)||'',y};}}
  fs.writeFileSync('wmcache2.json',JSON.stringify(cache));
  const out={};
  const coreOf=s=>{let c=s.name.replace(/^Av\. /,'').replace(/\s*\(.*\)/,'');if(/^Alameda/.test(s.name))c="Libertador Bernardo O'Higgins";if(/Matta/.test(s.name))c='Matta';return norm(c);};
  for(const s of streets){const c=coreOf(s);const starts=f=>{const t=norm(f).replace(/^(ciclovia de |vista de (la )?|panoramica de (la )?)/,'');
      return [`avenida ${c}`,`av. ${c}`,`av ${c}`,`avda ${c}`,`autopista ${c}`,`camino ${c}`,`calle ${c}`,c,'alameda','avenida manuel antonio matta','avenida presidente '+c,'avenida '+c.split(' ').pop()].some(x=>t.startsWith(x)&&(x!=='alameda'||/^Alameda/.test(s.name))&&(!x.includes('manuel antonio matta')||/Matta/.test(s.name)));};
    const ps=res[s.name].map(t=>info[t]).filter(Boolean).filter(x=>starts(x.f)&&!/mexico|queretaro|argentina|buenos aires|espana|madrid|lima|peru|bogota|montevideo|valparaiso|vina del mar|concepcion|rancagua|temuco|antofagasta/.test(norm(x.f))).sort((a,b)=>(b.y||2015)-(a.y||2015));
    // variedad: no más de 5, preferir títulos distintos
    out[s.name]=ps.slice(0,6);log.push(s.name+' | '+ps.length);}
  // Panoramax para las que quedan con pocas
  for(const s of streets){if(out[s.name].length>=2)continue;const pts=s.lines.flat();const got=[];
    for(let k=1;k<=12&&got.length<3;k++){const p=pts[Math.floor(pts.length*k/13)];const r=0.0006;
      try{const j=await (await fetch('https://api.panoramax.xyz/api/search?limit=3&bbox='+[p[1]-r,p[0]-r,p[1]+r,p[0]+r].join(','),{headers:UA})).json();
        for(const f of j.features||[]){const pr=f.properties||{};if((pr['pers:interior_orientation']||{}).field_of_view===360)continue;const a=f.assets||{};const href=(a.sd||a.hd||{}).href;if(!href)continue;
          const y=+(String(pr.datetime||'').slice(0,4));if(y&&y<2005)continue;
          got.push({u:href,px:f.id,a:((f.providers||[]).map(x=>x.name).pop())||'Panoramax',l:pr.license||'CC BY-SA 4.0',y});break;}}catch(e){}
      await sleep(200);}
    if(got.length){out[s.name]=out[s.name].concat(got).slice(0,5);log.push('  +panoramax '+s.name+' '+got.length);}}
  fs.writeFileSync('photos_streets4.json',JSON.stringify(out));
  console.log(log.join('\n'));
  console.log('con foto:',Object.values(out).filter(a=>a.length).length,'/',streets.length,'sin:',streets.filter(s=>!out[s.name].length).map(s=>s.name).join(', '));
})();
