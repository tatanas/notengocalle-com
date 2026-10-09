const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
const p=await b.newPage();await p.setViewport({width:1366,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});
console.log('modos calles:',await p.$$eval('[data-mode^="st-"]',x=>x.map(b=>b.dataset.mode).join(',')));
let shot=false;
for(const id of ['st-name','st-find']){await p.evaluate(()=>document.getElementById('btnHome').click());await p.click(`[data-mode="${id}"]`);
  for(let k=0;k<12;k++){await new Promise(r=>setTimeout(r,700));const o=await p.$('.opt:not([disabled])');if(o)await o.click();else{const bx=await (await p.$('#map')).boundingBox();await p.mouse.click(bx.x+400,bx.y+350);}
    await new Promise(r=>setTimeout(r,900));const n=await p.$$eval('.emo',x=>x.length);if(n>=3&&!shot){await new Promise(r=>setTimeout(r,1800));await p.screenshot({path:'shots/nearby.png'});shot=true;}
    const nx=await p.$('#btnNext');if(nx)await nx.click();}
  console.log(id,'ok');}
console.log(errs.length?errs.join('\n'):'no errors');await b.close();})();
