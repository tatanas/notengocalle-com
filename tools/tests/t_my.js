const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
const p=await b.newPage();await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');p.on('response',r=>{if(/interpreter|nominatim/.test(r.url()))console.log('  red',r.url().split('/')[2],r.status())});p.on('requestfailed',r=>{if(/interpreter/.test(r.url()))console.log('  overpass FAIL',r.url().split('/')[2],r.failure().errorText)});await p.setViewport({width:1366,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});
console.log(await p.evaluate(()=>{const D=window.DATA;const q=D.streets.filter(s=>s.kind!=='tren');return 'calles en juego '+q.length+' | con foto '+q.filter(s=>D.photos['s:'+s.name]).length+' | quitadas presentes: '+D.streets.filter(s=>/Las Nieves|Río Tajo|El Mirador/.test(s.name)).length+' | teleféricos: '+D.landmarks.filter(l=>/Telef/.test(l.name)).map(l=>l.name+' ['+l.comuna+(l.alt?'/'+l.alt:'')+']').join('; ')+' | cerros en landmarks: '+D.landmarks.filter(l=>l.pk&&l.pk.startsWith('c:')).length}));
await p.type('#mystQ','las nieves');await p.click('#mystGo');
await p.waitForFunction(()=>document.querySelector('[data-pick]')||!/Buscando/.test(document.getElementById('mystRes').innerText),{timeout:120000});await new Promise(r=>setTimeout(r,1500));
console.log('resultados:',await p.$$eval('[data-pick]',x=>x.map(b=>b.innerText.replace(/\n/g,' | ')).join(' || '))||await p.$eval('#mystRes',x=>x.innerText));
const picks=await p.$$('[data-pick]');
if(picks.length){const idx=await p.$$eval('[data-pick]',x=>x.findIndex(b=>/Vitacura/.test(b.innerText)));await Promise.all([p.waitForNavigation({waitUntil:'networkidle2'}),picks[idx<0?0:idx].click()]);
  console.log(await p.evaluate(()=>{const s=window.DATA.streets.filter(s=>s.custom);return 'tras recargar, calles propias: '+s.map(x=>x.name+' '+x.km+'km '+x.comunas.join('/')+' nb:'+x.nb.slice(0,3).map(n=>n[0]).join(',')).join('; ')+' | chips: '+document.querySelectorAll('#myst [data-del]').length}));
  await p.screenshot({path:'shots/myst.png',fullPage:true});
  for(const id of ['st-name','st-find','cx']){await p.evaluate(()=>document.getElementById('btnHome').click());await p.click(`[data-mode="${id}"]`);for(let k=0;k<6;k++){await new Promise(r=>setTimeout(r,800));const o=await p.$('.opt:not([disabled])');if(o){await o.click();const c=await p.$('#btnConfirm');if(c)await c.click();}else{const bx=await (await p.$('#map')).boundingBox();await p.mouse.click(bx.x+420,bx.y+380);}await new Promise(r=>setTimeout(r,900));const n=await p.$('#btnNext');if(n)await n.click();}console.log(id,'ok');}
  await p.evaluate(()=>document.getElementById('btnHome').click());await Promise.all([p.waitForNavigation({waitUntil:'networkidle2'}),p.click('#myst [data-del]')]);
  console.log('tras quitar:',await p.evaluate(()=>window.DATA.streets.filter(s=>s.custom).length));}
console.log(errs.length?errs.join('\n'):'no errors');await b.close();})();
