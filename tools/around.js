const M=require('./majors.json');const lm=require('./landmarks.json');
const P={};for(const n of process.argv.slice(2)){const l=lm.find(x=>x.name===n);if(l)P[n]=[l.lat,l.lon];else console.log('no',n);}
for(const [n,p] of Object.entries(P)){const dirs={N:[],S:[],E:[],W:[]};
  for(const [name,ws] of Object.entries(M)){let best={};for(const w of ws)for(const q of w){const dy=(q[0]-p[0])*111.2,dx=(q[1]-p[1])*92.9;
      if(Math.abs(dx)<0.25&&Math.abs(dy)<2.2){const k=dy>0?'N':'S';if(!best[k]||Math.abs(dy)<best[k])best[k]=Math.abs(dy);}
      if(Math.abs(dy)<0.25&&Math.abs(dx)<2.2){const k=dx>0?'E':'W';if(!best[k]||Math.abs(dx)<best[k])best[k]=Math.abs(dx);}}
    for(const k in best)dirs[k].push([name,best[k]]);}
  console.log(n,p.join(','));for(const k of 'NSEW')console.log('  ',k,dirs[k].sort((a,b)=>a[1]-b[1]).slice(0,5).map(x=>x[0]+' '+x[1].toFixed(2)).join(' | '));}
