const fs=require('fs');const p=require('./photos_streets.json');const old=require('./photos.json');
const BAD=new Set([219,220,221,222,223,224,226,227,230,231,234,236,240,245,246,247,248,249,265,2,5,6,11,18,32,46,58,62,83,90,91,106,119,120,127,143,149,151,157,171,175,179,180,188,191,192,193,196,197,205,206,208,210,211,213]);
let idx=0;const out={};
for(const [k,v] of Object.entries(p)){const keep=[];v.forEach(x=>{if(!BAD.has(idx)&&idx<=265)keep.push(x.f?{u:x.u,f:x.f,a:x.a,l:x.l}:{u:x.u,px:x.px,a:x.a,l:x.l});idx++;});if(keep.length)out['s:'+k]=keep;}
if(!out['s:Av. Diagonal Oriente']&&old['s:Av. Diagonal Oriente'])out['s:Av. Diagonal Oriente']=old['s:Av. Diagonal Oriente'].slice(0,1);
{const p2=require('./photos_streets2.json');const KEEP=new Set([0,7,8,13,14,15,16,18,20]);let i=0;for(const [k,v] of Object.entries(p2)){for(const x of v){if(KEEP.has(i)&&x.f)(out['s:'+k]=out['s:'+k]||[]).push({u:x.u,f:x.f,a:x.a,l:x.l});i++;}}}
{const p4=require('./photos_streets4.json');for(const [k,v] of Object.entries(p4))for(const x of v)if(x.f)(out['s:'+k]=out['s:'+k]||[]).push({u:x.u,f:x.f,a:x.a,l:x.l});}
{const p6=require('./photos_streets6.json');let i=0;for(const [k,v] of Object.entries(p6))for(const x of v){if(i<=10&&x.f)(out['s:'+k]=out['s:'+k]||[]).push({u:x.u,f:x.f,a:x.a,l:x.l});i++;}}
{const p7=require('./photos_streets7.json');const K=new Set([2,3,4,5,6,7,9,11]);let i=0;for(const [k,v] of Object.entries(p7))for(const x of v){if(K.has(i))(out['s:'+k]=out['s:'+k]||[]).push(x.f?{u:x.u,f:x.f,a:x.a,l:x.l}:{u:x.u,px:x.px,a:x.a,l:x.l});i++;}}
{const p8=require('./photos_streets8.json');const B=new Set([7,8,13,14,15,16,17,18,23,24,27,38,39,41,42,43,44,45,46,47,48,49,51,53,54,61]);let i=0;for(const [k,v] of Object.entries(p8))for(const x of v){if(!B.has(i))(out['s:'+k]=out['s:'+k]||[]).push(x.f?{u:x.u,f:x.f,a:x.a,l:x.l}:{u:x.u,px:x.px,a:x.a,l:x.l});i++;}}
{const p9=require('./photos_streets9.json');const K=new Set([0,2,3,4,5]);let i=0;for(const [k,v] of Object.entries(p9))for(const x of v){if(K.has(i)&&x.f)(out['s:'+k]=out['s:'+k]||[]).push({u:x.u,f:x.f,a:x.a,l:x.l});i++;}}
{const p11=require('./photos_streets11.json');const x=p11['Av. Domingo Santa María'][0];out['s:Av. Domingo Santa María']=[{u:x.u,f:x.f,a:x.a,l:x.l}];}
const merged={};for(const [k,v] of Object.entries(old))if(!k.startsWith('s:'))merged[k]=v;Object.assign(merged,out);
{const pn=require('./photos_new.json');const BADN=new Set([0,1,2,3,4,10,11,12,18,19,25]);let i=0;for(const [k,v] of Object.entries(pn))for(const x of v){if(!BADN.has(i))(merged[k]=merged[k]||[]).push(x);i++;}}
Object.assign(merged,require('./photos_new2.json'));
fs.writeFileSync('photos_final.json',JSON.stringify(merged));
console.log('calles con foto',Object.keys(out).length,'fotos de calles',Object.values(out).reduce((s,a)=>s+a.length,0));
