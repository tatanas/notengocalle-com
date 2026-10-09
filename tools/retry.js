const fs=require('fs');
const alts={
"Cerro San Cristóbal (cumbre, Virgen)":["Virgen del Cerro San Cristóbal","Cerro San Cristóbal"],
"Estadio Municipal de La Cisterna":["Estadio La Cisterna","Estadio Palestino"],
"Torre Entel":["Torre Entel Santiago","Edificio Torre Entel"],
"Museo Precolombino":["Museo Chileno de Arte Precolombino, Bandera","Museo Precolombino Santiago"],
"Planetario USACH":["Planetario Chile","Planetario, Avenida Libertador Bernardo O'Higgins 3349"],
"Hospital Clínico UC (Marcoleta)":["Hospital Clínico Universidad Católica, Marcoleta","Red de Salud UC Christus Marcoleta"],
"Hospital Clínico U. de Chile (J.J. Aguirre)":["Hospital Clínico José Joaquín Aguirre","Hospital Clínico de la Universidad de Chile, Santos Dumont"],
"Aeropuerto Arturo Merino Benítez":["Aeropuerto Internacional de Santiago","Aeropuerto Arturo Merino Benítez"],
"PUC – Casa Central":["Casa Central UC, Libertador Bernardo O'Higgins 340","Pontificia Universidad Católica de Chile Casa Central"],
"PUC – Campus San Joaquín":["Campus San Joaquín UC","Pontificia Universidad Católica de Chile, Vicuña Mackenna 4860"],
"PUC – Campus Oriente":["Campus Oriente UC","Campus Oriente, Jaime Guzmán Errázuriz"],
"Duoc UC – San Carlos de Apoquindo":["Duoc UC Sede San Carlos de Apoquindo","Duoc UC, Camino El Alba"],
"Duoc UC – Antonio Varas":["Duoc UC Sede Antonio Varas","Duoc UC, Antonio Varas 666"],
"Instituto Nacional":["Instituto Nacional, Arturo Prat","Instituto Nacional General José Miguel Carrera, Santiago"],
"Liceo 1 Javiera Carrera":["Liceo N°1 Javiera Carrera","Liceo Javiera Carrera, Compañía de Jesús"],
"Colegio Verbo Divino":["Colegio del Verbo Divino, Presidente Errázuriz","Verbo Divino, Las Condes"],
"Colegio SEK":["Colegio SEK Chile","SEK International School"],
"Colegio Los Andes":["Colegio Los Andes, Vitacura","Colegio Los Andes, Lo Barnechea"],
"Colegio Cordillera":["Colegio Cordillera, Las Condes","Colegio Cordillera, Valle Nevado"],
"Colegio Manquehue":["Colegio San Anselmo","Colegio Manquehue, Vitacura"],
"Confitería Torres":["Confitería Torres, Libertador Bernardo O'Higgins"],
"Bar Nacional":["Bar Nacional, Bandera","Bar Nacional, Huérfanos 1151"],
"Emporio La Rosa (Lastarria)":["Emporio La Rosa, Merced","Emporio La Rosa, Santiago"],
"U. de Chile – Campus Andrés Bello (FEN)":["Facultad de Economía y Negocios, Diagonal Paraguay","FEN Universidad de Chile"],
"U. de Chile – Campus Norte (Medicina)":["Facultad de Medicina Universidad de Chile, Independencia","Campus Norte Universidad de Chile"],
"Barrio Italia":["Avenida Italia, Providencia","Barrio Italia"],
"GAM":["Centro Gabriela Mistral, Libertador Bernardo O'Higgins 227","GAM, Santiago"],
"Paseo Ahumada":["Paseo Ahumada, Santiago","Ahumada, Santiago"],
"Pueblo de Lo Barnechea":["Iglesia de Lo Barnechea","Plaza Lo Barnechea"],
"Escuela Militar":["Escuela Militar, Los Militares","Escuela Militar del Libertador"],
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const res={};
for(const [k,qs] of Object.entries(alts)){res[k]=[];
  for(const q of qs){const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=2&countrycodes=cl&viewbox=-70.95,-33.20,-70.30,-33.80&bounded=1&q='+encodeURIComponent(q);
    const r=await (await fetch(url,{headers:{'User-Agent':'SantiagoQuiz/1.0 personal study app'}})).json();await sleep(1100);
    for(const h of r)res[k].push({q,lat:+h.lat,lon:+h.lon,dn:h.display_name.slice(0,100)});}
  console.log(k);for(const h of res[k])console.log('   ',h.lat.toFixed(5),h.lon.toFixed(5),h.dn);}
fs.writeFileSync('retry.json',JSON.stringify(res));})();
