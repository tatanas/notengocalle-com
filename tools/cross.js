const W=require('./ways_named.json');const KX=92.9,KY=111.2;
const d=(a,b)=>Math.hypot((a[0]-b[0])*KY,(a[1]-b[1])*KX);
function crossOf(name,box){const out={};const A=W[name];if(!A){console.log('NO',name);return;}
  const pts=A.flat().filter(p=>!box||(p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]));
  for(const [n,ws] of Object.entries(W)){if(n===name)continue;for(const w of ws){for(const e of [w[0],w[w.length-1],...w]){ if(box&&(e[0]<box[0]-0.002||e[0]>box[2]+0.002||e[1]<box[1]-0.002||e[1]>box[3]+0.002))continue;
      for(const p of pts){if(d(e,p)<0.012){out[n]=p;break;}} if(out[n])break;} if(out[n])break;}}
  return out;}
const [,,name,by,...b]=process.argv;const box=b.length?b.map(Number):null;const r=crossOf(name,box);
console.log(name,':',Object.entries(r).sort((x,y)=>by==='lat'?y[1][0]-x[1][0]:x[1][1]-y[1][1]).map(([n,p])=>n+' ('+p[0].toFixed(4)+','+p[1].toFixed(4)+')').join(' | '));
