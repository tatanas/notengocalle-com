const fs=require('fs');const turf=require('@turf/turf');
const R={15:['Arica y Parinacota','Arica','XV'],1:['Tarapacá','Iquique','I'],2:['Antofagasta','Antofagasta','II'],3:['Atacama','Copiapó','III'],4:['Coquimbo','La Serena','IV'],5:['Valparaíso','Valparaíso','V'],13:['Metropolitana de Santiago','Santiago','RM'],6:["O'Higgins",'Rancagua','VI'],7:['Maule','Talca','VII'],16:['Ñuble','Chillán','XVI'],8:['Biobío','Concepción','VIII'],9:['La Araucanía','Temuco','IX'],14:['Los Ríos','Valdivia','XIV'],10:['Los Lagos','Puerto Montt','X'],11:['Aysén','Coyhaique','XI'],12:['Magallanes','Punta Arenas','XII']};
const order=[15,1,2,3,4,5,13,6,7,16,8,9,14,10,11,12];
const j=JSON.parse(fs.readFileSync('regiones_s.json'));
const feats=j.features.map(f=>{const c=f.properties.codregion;const [name,cap,rom]=R[c];
  // punto de etiqueta: centro del polígono más grande
  let g=f.geometry;let big=g.type==='Polygon'?g.coordinates:g.coordinates.slice().sort((a,b)=>turf.area(turf.polygon(b))-turf.area(turf.polygon(a)))[0];
  let lp=turf.centerOfMass(turf.polygon(big));if(!turf.booleanPointInPolygon(lp,turf.polygon(big)))lp=turf.pointOnFeature(turf.polygon(big));
  return {type:'Feature',properties:{name,cap,rom,ord:order.indexOf(c),lab:lp.geometry.coordinates.map(x=>+x.toFixed(3)),km2:Math.round(f.properties.area_km)},geometry:g};}).sort((a,b)=>a.properties.ord-b.properties.ord);
const cities=["Arica","Iquique","Calama","Antofagasta","San Pedro de Atacama","Copiapó","Vallenar","La Serena","Coquimbo","Ovalle","Los Andes","Viña del Mar","Valparaíso","San Antonio","Santiago","Rancagua","San Fernando","Pichilemu","Curicó","Talca","Linares","Constitución","Chillán","Concepción","Talcahuano","Los Ángeles","Temuco","Villarrica","Pucón","Valdivia","Osorno","Puerto Varas","Puerto Montt","Ancud","Castro","Coyhaique","Puerto Aysén","Puerto Natales","Punta Arenas"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const out=[];for(const c of cities){const r=await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&featureType=city&q='+encodeURIComponent(c+', Chile'),{headers:{'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz)'}})).json();await sleep(1100);
    if(!r[0]){console.log('MISS',c);continue;}const lat=+(+r[0].lat).toFixed(3),lon=+(+r[0].lon).toFixed(3);const reg=feats.find(f=>turf.booleanPointInPolygon([lon,lat],f));
    let rn=reg?reg.properties.name:null;if(!rn){let bd=1e9;for(const f of feats){const dd=turf.pointToLineDistance([lon,lat],turf.polygonToLine(f).features?turf.polygonToLine(f).features[0]:turf.polygonToLine(f));if(dd<bd){bd=dd;rn=f.properties.name;}}}
    out.push({name:c,lat,lon,region:rn,cap:feats.some(f=>f.properties.cap===c)});console.log(c,lat,lon,rn);}
  fs.writeFileSync('chile.json',JSON.stringify({regions:{type:'FeatureCollection',features:feats},cities:out}));console.log(fs.statSync('chile.json').size);})();
