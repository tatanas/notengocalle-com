const puppeteer=require('puppeteer-core');
const OUT=__dirname+'/shots/';require('fs').mkdirSync(OUT,{recursive:true});
const mobile=process.argv[2]==='m';
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.setViewport(mobile?{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}:{width:1366,height:820});
  const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text()+' @'+(m.location().url||''))});p.on('requestfailed',r=>{if(!/terrarium|openfreemap/.test(r.url()))errs.push('REQFAIL '+r.url())});
  await p.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle2'});
  await p.screenshot({path:OUT+(mobile?'m_':'')+'home.png'});
  const modes=await p.$$eval('[data-mode]',bs=>bs.map(b=>b.dataset.mode));
  for(const id of modes){
    await p.evaluate(()=>document.getElementById('btnHome').click());
    await p.click(`[data-mode="${id}"]`);await new Promise(r=>setTimeout(r,900));
    if(await p.$eval('#home',h=>!h.classList.contains('hidden'))){console.log('skip (sin items)',id);continue;}
    for(let k=0;k<(id==='cx'?14:id.startsWith('rs-')?9:3);k++){
      await p.screenshot({path:OUT+(mobile?'m_':'')+id+'_q'+k+'.png'});
      const hasOpt=await p.$('.opt:not([disabled])');const hasLine=await p.$('.linebtn');
      if(hasOpt){await hasOpt.click();const cf=await p.$('#btnConfirm');if(cf)await cf.click();}
      else if(hasLine){await hasLine.click();await p.click('#btnConfirm');}
      else{ // click en el mapa (en una comuna central)
        const box=await (await p.$('#map')).boundingBox();
        const pt=await p.evaluate(()=>{return null});
        await p.mouse.click(box.x+box.width*0.45,box.y+box.height*0.35);
      }
      await new Promise(r=>setTimeout(r,id.startsWith('rs-')?1900:700));
      if(k==0)await p.screenshot({path:OUT+(mobile?'m_':'')+id+'_a.png'});
      const nx=await p.$('#btnNext');if(nx){await nx.click();await new Promise(r=>setTimeout(r,500));}
      else if(id==='com-all'){/* clicks may need retries */}
    }
    console.log('mode ok',id);
  }
  await p.evaluate(()=>document.getElementById('btnHome').click());
  await p.click('#goExplore');await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:OUT+(mobile?'m_':'')+'explore.png'});
  await p.evaluate(()=>{document.getElementById('ex-metro').click();document.getElementById('ex-streets').click();});await new Promise(r=>setTimeout(r,1200));
  await p.screenshot({path:OUT+(mobile?'m_':'')+'explore2.png'});
  console.log(errs.length?errs.join('\n'):'no errors');
  await b.close();
})();
