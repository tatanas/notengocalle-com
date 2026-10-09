const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
const p=await b.newPage();await p.setViewport({width:1366,height:900});const T0=Date.now();let navs=0;
p.on('pageerror',e=>console.log('PAGEERR',e.message));
p.on('framenavigated',f=>{if(f===p.mainFrame()){navs++;console.log('NAV',Date.now()-T0,'ms',f.url());}});
p.on('console',m=>{if(/RELOAD|SW/.test(m.text()))console.log('  ',m.text().slice(0,300));});
await p.evaluateOnNewDocument(()=>{
  const r=Location.prototype.reload;try{Location.prototype.reload=function(){console.log('RELOAD llamado: '+new Error().stack.split('\n').slice(1,4).join(' <- '));return r.apply(this,arguments);};}catch(e){console.log('RELOAD hook falló '+e.message);}
  if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('controllerchange',()=>console.log('SW controllerchange'));
  window.addEventListener('beforeunload',()=>console.log('RELOAD beforeunload'));
});
await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});
try{
for(const id of ['st-name','st-find','lm-loc']){await p.evaluate(()=>document.getElementById('btnHome').click());await p.click(`[data-mode="${id}"]`);
  for(let k=0;k<10;k++){await new Promise(r=>setTimeout(r,700));const o=await p.$('.opt:not([disabled])');if(o)await o.click();else{const bx=await (await p.$('#map')).boundingBox();await p.mouse.click(bx.x+400,bx.y+350);}
    await new Promise(r=>setTimeout(r,900));const nx=await p.$('#btnNext');if(nx)await nx.click();}
  console.log(id,'ok');}
}catch(e){console.log('FALLÓ:',e.message.slice(0,90));}
console.log('navegaciones:',navs);await b.close();})();
