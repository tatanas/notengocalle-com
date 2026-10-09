const alts={
"Embajada de Estados Unidos":["Embassy of the United States, Santiago","Embajada de Estados Unidos, Andrés Bello 2800"],
"Escuela Militar":["Escuela Militar, Las Condes","Avenida Los Militares 4500"],
"Escuela de Carabineros":["Escuela de Carabineros, Antonio Varas","Escuela de Carabineros de Chile"],
"Hospital El Carmen":["Hospital El Carmen, Maipú","Hospital El Carmen de Maipú"],
"Hospital FACh":["Hospital Fuerza Aérea, Las Condes","Hospital Clínico FACh"],
"Mall Paseo Estación":["Paseo Estación, Estación Central","Mall Paseo Estación Central"],
"Hospital del Trabajador":["Hospital del Trabajador, Ramón Carnicer","Hospital del Trabajador Santiago"],
"Plaza de Quilicura":["Plaza de Armas Quilicura","Plaza Quilicura"],
"Plaza de Renca":["Plaza de Armas, Renca","Plaza Renca"],
"Casa Piedra":["Casa Piedra, Vitacura","Centro de eventos Casa Piedra"],
"Municipalidad de Santiago":["Ilustre Municipalidad de Santiago, Plaza de Armas","Municipalidad de Santiago, Plaza de Armas"],
"Valle Nevado":["Valle Nevado ski resort","Centro de Ski Valle Nevado"],
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{for(const [k,qs] of Object.entries(alts)){console.log(k);for(const q of qs){const r=await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=2&countrycodes=cl&viewbox=-70.95,-33.20,-70.10,-33.80&bounded=1&q='+encodeURIComponent(q),{headers:{'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz)'}})).json();await sleep(1100);for(const h of r)console.log('   ',(+h.lat).toFixed(5),(+h.lon).toFixed(5),h.display_name.slice(0,95));}}})();
