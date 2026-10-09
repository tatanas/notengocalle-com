const fs=require('fs');const turf=require('@turf/turf');
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson'));
const comunaOf=(lon,lat)=>{const p=turf.point([lon,lat]);for(const f of comunas.features)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};
const geo=JSON.parse(fs.readFileSync('landmarks_geo.json'));
const CAR=require('./careers.js');
const DROP=['Colegio SEK','Colegio Manquehue','Confitería Torres','Casa Piedra'];
const F={
"Duoc UC – sede Plaza Norte":{ll:[-33.363,-70.67771]},
"Duoc UC – sede Plaza Vespucio":{ll:[-33.51628,-70.59824]},
"Duoc UC – sede San Bernardo":{ll:[-33.59878,-70.70528],obvious:true},
"INACAP Ñuñoa":{ll:[-33.45269,-70.59244],obvious:true},
"AIEP – sede Santiago Centro":{ll:[-33.44695,-70.66129]},
"AIEP – sede San Joaquín":{ll:[-33.49705,-70.61691],obvious:true},
"AIEP – sede Maipú":{ll:[-33.50922,-70.75795],obvious:true},
"AIEP – sede San Bernardo":{ll:[-33.59566,-70.70731],obvious:true},
"Santo Tomás – sede Estación Central":{ll:[-33.45245,-70.6782],obvious:true},
"Santo Tomás – sede San Joaquín":{ll:[-33.49891,-70.6172],obvious:true},
"Santo Tomás – sede Puente Alto":{ll:[-33.57673,-70.5783],obvious:true},
"Universidad de las Américas (campus Maipú)":{ll:[-33.50999,-70.74989],obvious:true},
"Universidad de las Américas (campus La Florida)":{ll:[-33.52196,-70.58362],obvious:true},
"Universidad de las Américas (campus Santiago)":{ll:[-33.44946,-70.66841],obvious:true},
"Universidad Mayor – campus Alameda":{ll:[-33.44825,-70.66741]},
"Universidad Mayor – campus Oriente":{ll:[-33.40824,-70.55787]},
"UTEM – Campus Macul":{ll:[-33.46627,-70.59728]},
"Universidad Central – Campus Santa Isabel":{ll:[-33.45259,-70.65158]},
"Universidad Autónoma – Providencia":{ll:[-33.42763,-70.61187],obvious:true},
"Universidad Católica Silva Henríquez – Campus Lo Cañas":{ll:[-33.52366,-70.55337]},
"Duoc UC – San Carlos de Apoquindo":{"ll":[-33.40019,-70.50521],"name":"Duoc UC – sede San Carlos de Apoquindo","desc":"Sede de Duoc UC en Camino El Alba, sector San Carlos de Apoquindo."},
"Duoc UC – sede Alameda":{"ll":[-33.44894,-70.67008]},
"Duoc UC – sede Padre Alonso de Ovalle":{"ll":[-33.44731,-70.65759]},
"Quebrada de Macul":{ll:[-33.49300,-70.51793]},
"Teleférico del San Cristóbal (estación Oasis)":{ll:[-33.41455,-70.61553]},"Teleférico Bicentenario (estación Canal San Carlos)":{ll:[-33.41691,-70.60509]},
"Catedral Metropolitana":{ll:[-33.43780,-70.65150]},
"Estadio Nacional":{name:"Estadio Nacional (selección chilena; hace de local la U. de Chile)",pk:"l:Estadio Nacional"},
"Claro Arena (ex San Carlos de Apoquindo)":{name:"Claro Arena (U. Católica)",pk:"l:Claro Arena (ex San Carlos de Apoquindo)"},
"Estadio Santa Laura":{name:"Estadio Santa Laura (Unión Española)",pk:"l:Estadio Santa Laura"},
"Feria del domingo de José Arrieta":{ll:[-33.46261,-70.55383]},
"Parque Almagro":{ll:[-33.45181,-70.65168]},"Lynch (La Reina)":{ll:[-33.45150,-70.56560]},
"Duoc UC – Antonio Varas":{ll:[-33.43305,-70.61495],name:"Duoc UC – sede Antonio Varas"},
"Duoc UC – sede San Joaquín":{ll:[-33.49996,-70.61663]},
"Duoc UC – sede Puente Alto":{ll:[-33.59857,-70.57923],obvious:true},
"Duoc UC – sede Maipú":{obvious:true},"INACAP Maipú":{obvious:true},"INACAP Renca":{obvious:true},"INACAP Puente Alto":{obvious:true},"UTFSM – Campus Vitacura":{obvious:true},
"Universidad de las Américas (campus Providencia)":{ll:[-33.43650,-70.61557],obvious:true},
"Población José María Caro":{ll:[-33.51594,-70.69799]},
"La Legua":{ll:[-33.48950,-70.63500]},
"La Bandera":{ll:[-33.54867,-70.64402]},
"Embajada de Estados Unidos":{ll:[-33.41236,-70.60472]},
"Escuela Militar":{ll:[-33.41146,-70.58400]},
"Escuela de Carabineros":{ll:[-33.44349,-70.61031]},
"Hospital El Carmen":{ll:[-33.50802,-70.77419]},
"Hospital FACh":{ll:[-33.39636,-70.54707]},
"Mall Paseo Estación":{ll:[-33.45210,-70.67830],name:"Mall Paseo Arauco Estación",obvious:true},
"Hospital del Trabajador":{ll:[-33.44356,-70.63261]},
"Plaza de Quilicura":{ll:[-33.36781,-70.73159],obvious:true},
"Plaza de Renca":{ll:[-33.40444,-70.70635],obvious:true},
"Municipalidad de Santiago":{ll:[-33.43693,-70.65024],obvious:true},
"Valle Nevado":{ll:[-33.35700,-70.24900]},
"Corte de Apelaciones de San Miguel":{desc:"Segunda Corte de Apelaciones de la región (cubre las comunas del sur). Ojo: pese al nombre, el edificio queda en Av. España."},
"Universidad Andrés Bello – Casona de Las Condes":{name:"UNAB – La Casona"},
"INACAP Santiago Centro":{name:"INACAP – sede Almirante Barroso"},
"Universidad Adolfo Ibáñez – Peñalolén":{name:"Universidad Adolfo Ibáñez (campus principal)"},
"Universidad Mayor – Huechuraba":{name:"Universidad Mayor – campus La Pirámide"},
"Parque Bicentenario (Vitacura)":{name:"Parque Bicentenario"},
"Parque Bicentenario de Cerrillos":{name:"Parque Bicentenario (ex aeródromo)"},
"Club Hípico de Santiago":{name:"Club Hípico"},
"Bar Liguria (Providencia)":{name:"Bar Liguria (Manuel Montt)"},
"Dominó (centro)":{name:"Dominó (Agustinas)"},
"Pueblo de Lo Barnechea":{obvious:true},"Hospital de La Florida":{obvious:true},"Plaza de Maipú":{obvious:true},"Plaza de Puente Alto":{obvious:true},
"Plaza de San Bernardo":{obvious:true},"Plaza Ñuñoa":{obvious:true},"Mall Arauco Maipú":{obvious:true},"Mall Arauco Quilicura":{obvious:true},
"Templo Votivo de Maipú":{obvious:true},"Clínica Las Condes":{obvious:true},"Alto Las Condes":{obvious:true},"Estadio Bicentenario de La Florida":{obvious:true,name:"Estadio Bicentenario de La Florida (Audax Italiano)",pk:"l:Estadio Bicentenario de La Florida"},
"Estación Central (ferrocarriles)":{obvious:true},"Universidad Autónoma":{name:"Universidad Autónoma – San Miguel",desc:"Sede de la U. Autónoma en San Miguel.",obvious:true},
"Cerro San Cristóbal (cumbre, Virgen)":{ll:[-33.42530,-70.63316],alt:["Recoleta","Providencia"]},
"Zoológico Nacional":{alt:["Recoleta","Providencia"]},
"Estadio Municipal de La Cisterna":{ll:[-33.52096,-70.67561],name:"Estadio Municipal de La Cisterna (Palestino)",obvious:true,pk:"l:Estadio de Palestino"},
"Torre Entel":{ll:[-33.44440,-70.65720]},
"Museo Precolombino":{ll:[-33.43902,-70.65220]},
"Planetario USACH":{ll:[-33.45032,-70.68141]},
"Hospital Clínico UC (Marcoleta)":{ll:[-33.44205,-70.64040]},
"Hospital Clínico U. de Chile (J.J. Aguirre)":{ll:[-33.42060,-70.65300]},
"Aeropuerto Arturo Merino Benítez":{ll:[-33.38927,-70.79000]},
"PUC – Casa Central":{ll:[-33.44177,-70.64033]},
"PUC – Campus San Joaquín":{ll:[-33.49877,-70.61068]},
"PUC – Campus Oriente":{ll:[-33.44570,-70.59328]},
"Instituto Nacional":{ll:[-33.44536,-70.65074]},
"Liceo 1 Javiera Carrera":{ll:[-33.43947,-70.65739]},
"Colegio Verbo Divino":{ll:[-33.42134,-70.58612]},
"Colegio SEK":{ll:[-33.46815,-70.52201],name:"Colegio SEK",desc:"Colegio internacional en Av. José Arrieta, Peñalolén alto."},
"Colegio Los Andes":{ll:[-33.37562,-70.52723],desc:"Colegio en el sector alto de Vitacura (San Damián)."},
"Colegio Cordillera":{ll:[-33.39735,-70.51433],desc:"Colegio en el sector alto de Las Condes (Los Pumas)."},
"Bar Nacional":{ll:[-33.43956,-70.65224]},
"Emporio La Rosa (Lastarria)":{ll:[-33.43695,-70.64070],desc:"Heladería conocida en calle Merced, barrio Lastarria."},
"U. de Chile – Campus Andrés Bello (FEN)":{ll:[-33.44263,-70.63713],name:"U. de Chile – FEN",desc:"Economía y Negocios U. de Chile, en Diagonal Paraguay, cerca de la Alameda y Plaza Italia."},
"U. de Chile – Campus Norte (Medicina)":{ll:[-33.42276,-70.65303]},
"Barrio Italia":{ll:[-33.44846,-70.62453],alt:["Providencia","Ñuñoa"]},
"GAM":{ll:[-33.43931,-70.63993]},
"Paseo Ahumada":{ll:[-33.44081,-70.65081]},
"Pueblo de Lo Barnechea":{ll:[-33.36173,-70.50485],desc:"El pueblo antiguo (Iglesia Santa Rosa), en Av. Raúl Labbé hacia la cordillera."},
"Parque de los Reyes":{ll:[-33.42950,-70.66200]},
"Parque Bustamante":{ll:[-33.44400,-70.63180]},
"Parque Quinta Normal":{desc:"Parque con museos (Historia Natural, Ciencia y Tecnología), al poniente de Matucana."},
"Museo Nacional de Historia Natural":{desc:"Dentro del Parque Quinta Normal."},
"Barrio Meiggs":{alt:["Santiago","Estación Central"]},
"Barrio Bellavista":{alt:["Providencia","Recoleta"]},
"U. de Chile – Facultad de Derecho":{alt:["Recoleta","Providencia"]},
"UTEM":{name:"UTEM – Casa Central",desc:"Casa central de la U. Tecnológica Metropolitana, calle Dieciocho, Santiago Centro."},

"Colegio Huelén":{desc:"Colegio en Av. Santa María, sector Santa María de Manquehue (Vitacura)."},
"Colegio Mayflower":{desc:"Colegio en Camino de La Laguna, Lo Barnechea."},
"El Hoyo":{alt:["Santiago","Estación Central"],desc:"Picada de arrollado y terremotos en San Vicente, al sur de la Estación Central."},
"Movistar Arena":{name:"Movistar Arena (Santander Arena)"},
"Universidad Gabriela Mistral":{desc:"Campus en Av. Andrés Bello, junto al Mapocho (Providencia)."},
"Universidad Santo Tomás – Santiago":{name:"Universidad Santo Tomás (sede Manuel Rodríguez)",desc:"Sede en el barrio universitario (Manuel Rodríguez / República)."},
"Colegio Alemán (Vitacura)":{name:"Colegio Alemán de Santiago",desc:"Sede en Nuestra Señora del Rosario, Las Condes."},
"Plaza Italia (Plaza Baquedano)":{alt:["Providencia","Santiago"]},
"Parque Arauco":{alt:["Las Condes","Vitacura"]},
"Club de Golf Los Leones":{alt:["Las Condes","Vitacura"]},
"Cerro Manquehue":{alt:["Vitacura","Lo Barnechea","Huechuraba"]},
"Stade Français":{desc:"Club deportivo en Sánchez Fontecilla, Las Condes."},
};
const out=[];let id=0;
for(const g of geo){
  if(DROP.includes(g.name))continue;
  const f=F[g.name]||{};
  let lat=g.lat,lon=g.lon;if(f.ll)[lat,lon]=f.ll;
  if(lat==null){console.log('NO COORDS',g.name);continue;}
  const comuna=comunaOf(lon,lat);
  const o={id:'l'+(id++),name:f.name||g.name,cat:g.cat,desc:f.desc||g.desc,lat:+lat.toFixed(5),lon:+lon.toFixed(5),comuna};
  if(f.alt)o.alt=f.alt.filter(c=>c!==comuna);
  if(f.obvious)o.obvious=true;
  if(f.pk)o.pk=f.pk;
  if(CAR[g.name])o.car=CAR[g.name];
  if(!f.alt&&comuna!==g.exp)console.log('CHECK',g.name,g.exp,'->',comuna);
  out.push(o);
}
console.log(out.length,'landmarks');
const cats={};for(const o of out)cats[o.cat]=(cats[o.cat]||0)+1;console.log(cats);
fs.writeFileSync('landmarks.json',JSON.stringify(out));
