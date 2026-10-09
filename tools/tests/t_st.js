const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
const p=await b.newPage();await p.setViewport({width:1366,height:820});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});
for(const id of ['st-name','st-find','st-conf']){await p.evaluate(()=>document.getElementById('btnHome').click());await p.click(`[data-mode="${id}"]`);await new Promise(r=>setTimeout(r,1500));
  console.log(id,'btn ver nombres:',await p.$$eval('.maptoggle',x=>x.length),'chips:',await p.$$eval('#panel .chip',x=>x.length));
  if(id==='st-conf'){await p.evaluate(()=>document.querySelector('#panel .chip input[data-k=stMetro]').click());await new Promise(r=>setTimeout(r,800));await p.screenshot({path:'shots/conf_q.png'});}
  const o=await p.$('.opt:not([disabled])');if(o)await o.click();else{const bx=await (await p.$('#map')).boundingBox();await p.mouse.click(bx.x+400,bx.y+300);}
  await new Promise(r=>setTimeout(r,2500));await p.screenshot({path:'shots/'+id+'_ans.png'});}
console.log(errs.length?errs.join('\n'):'no errors');await b.close();})();
