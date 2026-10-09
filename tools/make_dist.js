// Arma ../dist con SOLO lo que se sube a Netlify (sin tools/, datos crudos ni notas).
// Uso (desde tools/):  node make_dist.js   y luego arrastrar la carpeta dist a Netlify (Deploys).
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist);
for(const f of ['index.html','manifest.webmanifest','sw.js'])fs.copyFileSync(path.join(root,f),path.join(dist,f));
for(const d of ['css','js','data','vendor','icons'])fs.cpSync(path.join(root,d),path.join(dist,d),{recursive:true});
let n=0,sz=0;(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())w(p);else{n++;sz+=fs.statSync(p).size;}}})(dist);
console.log('dist listo:',n,'archivos,',(sz/1048576).toFixed(1),'MB ->',dist);
