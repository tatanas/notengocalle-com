const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
const p=await b.newPage();await p.setViewport({width:1366,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});await p.select('#setLen','10');
for(let round=0;round<2;round++){
  if(round===0)await p.click('[data-mode="com-name"]');else await p.click('#again');
  for(let k=0;k<10;k++){await new Promise(r=>setTimeout(r,round?250:700));if(k===3&&round===0)console.log('HUD jugando:',await p.$eval('#hud',x=>x.innerText));
    await (await p.$('.opt:not([disabled])')).click();await new Promise(r=>setTimeout(r,k===3?2500:200));if(k===3&&round===0)console.log('HUD tras 2,5 s leyendo la respuesta:',await p.$eval('#hud',x=>x.innerText));await p.click('#btnNext');}
  await new Promise(r=>setTimeout(r,400));console.log('RESULTADO '+(round+1)+':',await p.$eval('#panel',x=>x.innerText.replace(/\n+/g,' | ').slice(0,260)));
  if(round===0)await p.screenshot({path:'shots/time.png'});}
await p.click('#menu');console.log('TABLA:',await p.$eval('table.stats',x=>x.innerText.replace(/\n/g,' | ').replace(/\t/g,' ')));
console.log(errs.length?errs.join('\n'):'no errors');await b.close();})();
