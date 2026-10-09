const alts={
"Duoc SJ":["Duoc UC, Vicuña Mackenna, San Joaquín","DuocUC San Joaquín","Duoc San Joaquín"],
"Duoc Alameda":["Duoc UC, Avenida España, Santiago","DuocUC Alameda","Duoc Alameda"],
"Duoc PAO":["Duoc UC, Padre Alonso de Ovalle","DuocUC Padre Alonso de Ovalle","Duoc Alonso de Ovalle"],
"Duoc PA":["Duoc UC, Concha y Toro, Puente Alto","DuocUC Puente Alto","Duoc Puente Alto"],
"Duoc AV":["Duoc Antonio Varas","DuocUC Antonio Varas"],"Duoc SCA":["Duoc San Carlos de Apoquindo","DuocUC San Carlos de Apoquindo"],
"UDLA":["Universidad de Las Américas, Manuel Montt","UDLA Providencia","Universidad de Las Américas, Antonio Varas"],
"JM Caro":["José María Caro, Lo Espejo","Población Cardenal José María Caro"],
"La Legua":["Población La Legua","Legua Emergencia","Legua Vieja"],"La Bandera":["Población La Bandera","Parque La Bandera"],
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{for(const [k,qs] of Object.entries(alts)){console.log(k);for(const q of qs){const r=await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=2&countrycodes=cl&viewbox=-70.95,-33.20,-70.10,-33.80&bounded=1&q='+encodeURIComponent(q),{headers:{'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz)'}})).json();await sleep(1100);for(const h of r)console.log('   ',(+h.lat).toFixed(5),(+h.lon).toFixed(5),h.display_name.slice(0,95));}}})();
