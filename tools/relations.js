// Relaciones precalculadas entre calles y comunas (para el modo "Conexiones")
const turf=require('@turf/turf');
const KX=92.9,KY=111.2;
const xy=p=>[p[1]*KX,p[0]*KY]; // [lat,lon] -> km
function segInter(a,b,c,d){ // en km
  const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]];const den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-12)return null;
  const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den,u=((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])/den;
  return (t>=0&&t<=1&&u>=0&&u<=1)?[a[0]+t*r[0],a[1]+t*r[1]]:null;
}
function samples(lines,step=0.05){ // puntos cada ~50 m, [lat,lon]
  const out=[];for(const l of lines)for(let i=0;i<l.length-1;i++){const A=xy(l[i]),B=xy(l[i+1]);const len=Math.hypot(B[0]-A[0],B[1]-A[1]);const n=Math.max(1,Math.ceil(len/step));
    for(let k=0;k<n;k++){const t=k/n;out.push([l[i][0]+(l[i+1][0]-l[i][0])*t,l[i][1]+(l[i+1][1]-l[i][1])*t]);}}
  return out;
}
function distPL(p,lines){const P=xy(p);let best=Infinity;for(const l of lines)for(let i=0;i<l.length-1;i++){const A=xy(l[i]),B=xy(l[i+1]);const dx=B[0]-A[0],dy=B[1]-A[1],L=dx*dx+dy*dy;let t=L?((P[0]-A[0])*dx+(P[1]-A[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));const d=Math.hypot(A[0]+t*dx-P[0],A[1]+t*dy-P[1]);if(d<best)best=d;}return best;}
// ¿la calle S tiene tramos a ambos lados de la recta (r0->r1) cerca del punto p (km)? => la atraviesa
function bothSides(S,p,r0,r1){const rx=r1[0]-r0[0],ry=r1[1]-r0[1];let pos=0,neg=0;
  for(const q of S.dense){const Q=xy(q);const d=Math.hypot(Q[0]-p[0],Q[1]-p[1]);if(d<0.12||d>0.6)continue;const c=rx*(Q[1]-p[1])-ry*(Q[0]-p[0]);if(c>0)pos++;else neg++;}
  return pos>0&&neg>0;}
module.exports=function(streets,comunas){
  const comunaOf=(lat,lon)=>{const p=turf.point([lon,lat]);for(const f of comunas)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};
  const bufs=comunas.filter(f=>f.properties.group!=='rural').map(f=>({n:f.properties.name,b:turf.buffer(f,0.06),bb:turf.bbox(turf.buffer(f,0.06))}));
  const comunasAt=(lat,lon)=>{const p=[lon,lat];return bufs.filter(o=>lon>=o.bb[0]&&lon<=o.bb[2]&&lat>=o.bb[1]&&lat<=o.bb[3]&&turf.booleanPointInPolygon(p,o.b)).map(o=>o.n);};
  // metros por comuna
  for(const s of streets){const per={};const sm=samples(s.lines);for(const p of sm){for(const c of comunasAt(p[0],p[1]))per[c]=(per[c]||0)+50;}
    s.cl=Object.fromEntries(Object.entries(per).map(([k,v])=>[k,Math.round(v)]));s.comunas=Object.entries(per).filter(([,v])=>v>=300).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
    s.samp=sm.filter((_,i)=>i%6==0);s.dense=sm.filter((_,i)=>i%2==0);}
  // pares paralelos / que se juntan
  const bbox=s=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const l of s.lines)for(const p of l){a=Math.min(a,p[0]);c=Math.max(c,p[0]);b=Math.min(b,p[1]);d=Math.max(d,p[1]);}return[a,b,c,d];};
  streets.forEach(s=>s.bx=bbox(s));
  const near=(A,B,m)=>!(A[0]>B[2]+m||B[0]>A[2]+m||A[1]>B[3]+m||B[1]>A[3]+m);
  const inter=[],para=[];
  for(let i=0;i<streets.length;i++)for(let j=i+1;j<streets.length;j++){
    const A=streets[i],B=streets[j];if(!near(A.bx,B.bx,0.003))continue;
    const fa=A.samp.filter(p=>distPL(p,B.lines)<0.08).length/A.samp.length, fb=B.samp.filter(p=>distPL(p,A.lines)<0.08).length/B.samp.length;
    const oa=fa*A.samp.length*0.3, ob=fb*B.samp.length*0.3; // km de traslape aprox.
    if((fa>0.25&&oa>=0.6)||(fb>0.25&&ob>=0.6)){para.push([A.name,B.name]);continue;}
    const pts=[];
    for(const la of A.lines)for(let a=0;a<la.length-1;a++)for(const lb of B.lines)for(let b=0;b<lb.length-1;b++){
      const p=segInter(xy(la[a]),xy(la[a+1]),xy(lb[b]),xy(lb[b+1]));if(p&&(bothSides(B,p,xy(la[a]),xy(la[a+1]))||bothSides(A,p,xy(lb[b]),xy(lb[b+1])))){const ll=[+(p[1]/KY).toFixed(5),+(p[0]/KX).toFixed(5)];if(!pts.some(q=>Math.hypot((q[0]-ll[0])*KY,(q[1]-ll[1])*KX)<0.4))pts.push(ll);}}
    // contacto: también cuenta cuando una calle termina en la otra (margen 80 m); un contacto largo (>600 m) es correr juntas, no cruzarse
    const dd=(p,q)=>Math.hypot((p[0]-q[0])*KY,(p[1]-q[1])*KX);
    for(const [S,T] of [[A,B],[B,A]]){const hit=S.dense.filter(p=>distPL(p,T.lines)<0.08);const cl=[];
      for(const p of hit){const c=cl.find(c=>c.some(q=>dd(q,p)<0.35));if(c)c.push(p);else cl.push([p]);}
      for(const c of cl){if(c.length>6)continue;const m=c[Math.floor(c.length/2)];const ll=[+m[0].toFixed(5),+m[1].toFixed(5)];if(!pts.some(q=>dd(q,ll)<0.4))pts.push(ll);}}
    if(pts.length)inter.push({a:A.name,b:B.name,pts,comunas:[...new Set(pts.flatMap(p=>comunasAt(p[0],p[1])))]});
  }
  streets.forEach(s=>{delete s.samp;delete s.bx;delete s.dense;});
  return {inter,para};
};
module.exports.distPL=distPL;
