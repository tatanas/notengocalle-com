// Lista curada de cerros (nombre OSM exacto, nombre a mostrar opcional, descripción)
const fs=require('fs');const turf=require('@turf/turf');
const raw=require('./peaks_raw.json').elements;
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson'));
const comunaOf=(lon,lat)=>{const p=turf.point([lon,lat]);for(const f of comunas.features)if(turf.booleanPointInPolygon(p,f))return f.properties.name;return null;};
const L=[
// [osm name, near [lat,lon] para desambiguar, tipo, descripción]
["Cerro El Plomo",[-33.237,-70.214],"Cordillera","La cumbre más alta que se ve desde Santiago (5.424 m), al nororiente detrás de Farellones. Santuario inca donde se encontró al Niño del Plomo."],
["Cerro Altar",[-33.187,-70.243],"Cordillera","Cumbre nevada de 5.180 m al norte del Plomo, sobre el sector de La Parva / Valle Nevado."],
["Cerro La Paloma",[-33.182,-70.265],"Cordillera","4.910 m, junto al Altar; forma parte del cordón que se ve nevado desde el oriente de la ciudad."],
["Cerro Leonera",[-33.247,-70.241],"Cordillera","4.954 m, al sur del Plomo, cerca de Valle Nevado."],
["Cerro La Parva",[-33.302,-70.259],"Cordillera","4.047 m, sobre el centro de ski La Parva."],
["Cerro Colorado",[-33.346,-70.270],"Cordillera","3.339 m, sobre Farellones (centro de ski El Colorado)."],
["Cerro Provincia",[-33.427,-70.435],"Precordillera","2.751 m: el gran cerro detrás de Las Condes / La Reina, uno de los trekkings clásicos de Santiago."],
["Cerro San Ramón",[-33.486,-70.439],"Precordillera","3.253 m: la gran mole detrás de Peñalolén y La Florida; domina la vista desde el sur-oriente."],
["Punta de Damas",[-33.505,-70.444],"Precordillera","3.149 m, en el cordón del San Ramón, sobre La Florida."],
["Cerro La Cruz",[-33.475,-70.472],"Precordillera","2.552 m, en el cordón del San Ramón, sobre Peñalolén."],
["Alto del Naranjo",[-33.393,-70.452],"Precordillera","1.890 m, en Las Condes alto (sector San Carlos de Apoquindo / Parque Aguas de Ramón)."],
["Cerro Alto de las Vizcachas",[-33.424,-70.478],"Precordillera","1.871 m, sobre el Parque Aguas de Ramón (La Reina / Las Condes)."],
["Morro Las Papas",[-33.414,-70.493],"Precordillera","1.380 m, en Las Condes alto; se sube desde el Parque Aguas de Ramón o Los Dominicos."],
["Cerro Pochoco",[-33.355,-70.450],"Precordillera","1.804 m, junto al camino a Farellones en Lo Barnechea; trekking muy popular."],
["Cerro Minillas",[-33.536,-70.480],"Precordillera","2.468 m, sobre La Florida / Puente Alto."],
["Cerro Purgatorio",[-33.620,-70.428],"Precordillera","2.458 m, sobre Puente Alto / Las Vizcachas."],
["Cerro Arqueado de Barrera",[-33.218,-70.472],"Precordillera","2.898 m, al norte de Lo Barnechea."],
["Cerro San Gabriel",[-33.757,-70.215],"Cordillera","3.125 m, en el Cajón del Maipo, sobre el pueblo de San Gabriel."],
["Cerro El Morado",[-33.730,-70.064],"Cordillera","4.647 m, en el Monumento Natural El Morado (Baños Morales, Cajón del Maipo)."],
["Cerro Manquehue",[-33.351,-70.582],"Cerros islas","1.635 m: el cerro puntiagudo entre Vitacura, Lo Barnechea y Huechuraba. Referencia clásica del norte de la ciudad."],
["Cerro Manquehuito",[-33.355,-70.567],"Cerros islas","1.316 m, el hermano chico del Manquehue, sobre Santa María de Manquehue (Vitacura)."],
["Cerro El Carbón",[-33.363,-70.601],"Cerros islas","1.365 m, al poniente del Manquehue, sobre Vitacura / Huechuraba."],
["Cerro Alvarado",[-33.370,-70.536],"Cerros islas","1.040 m, entre Las Condes y Lo Barnechea (sector Los Trapenses / Estoril)."],
["Cerro del Medio",[-33.346,-70.532],"Cerros islas","1.011 m, en Lo Barnechea, entre La Dehesa y el río Mapocho."],
["Cerro Dieciocho",[-33.355,-70.493],"Cerros islas","1.020 m, en Lo Barnechea, junto a Av. Las Condes / Raúl Labbé."],
["Cerro Calán",[-33.399,-70.537],"Cerros islas","875 m, en Las Condes, con el Observatorio de la U. de Chile."],
["Cerro Apoquindo",[-33.408,-70.528],"Cerros islas","863 m, en Las Condes, junto a Los Dominicos."],
["Cerro San Luis",[-33.410,-70.598],"Cerros islas","695 m, cerrito urbano en Las Condes, junto a Kennedy / Américo Vespucio."],
["Cerro San Cristóbal",[-33.420,-70.630],"Cerros islas","880 m: el cerro del Parque Metropolitano, con la Virgen, entre Providencia y Recoleta."],
["Cerro Chacarillas",[-33.409,-70.614],"Cerros islas","796 m, parte del Parque Metropolitano, sobre Pedro de Valdivia Norte."],
["Cerro Santa Lucía",[-33.440,-70.643],"Cerros islas","629 m, en pleno centro: donde Pedro de Valdivia fundó Santiago (cerro Huelén)."],
["Cerro Blanco",[-33.420,-70.646],"Cerros islas","625 m, en Recoleta, junto al Cementerio General y la estación Cerro Blanco."],
["Cerro Renca",[-33.391,-70.711],"Cerros islas","905 m, en Renca; el cerro grande del norponiente."],
["Cerro Colorado",[-33.393,-70.737],"Cerros islas","720 m, junto al Cerro Renca, al poniente."],
["Cerro Lo Aguirre",[-33.465,-70.830],"Cerros islas","991 m, en Pudahuel, junto a la Ruta 68."],
["Cerro Amapola",[-33.433,-70.835],"Cerros islas","583 m, en Pudahuel, cerca del aeropuerto."],
["Cerro Chena",[-33.595,-70.731],"Cerros islas","952 m, en San Bernardo; parque y pukará inca."],
["Cerro Negro",[-33.614,-70.676],"Cerros islas","680 m, en San Bernardo, al oriente de la Ruta 5."],
["Cerro Las Cabras",[-33.625,-70.603],"Cerros islas","736 m, en Puente Alto, junto al río Maipo."],
["Cerro Santa Rosa",[-33.545,-70.530],"Cerros islas","1.108 m, en La Florida / Puente Alto, al pie de la precordillera."],
["Cerro Chequén",[-33.553,-70.547],"Cerros islas","775 m, entre La Florida y Puente Alto."],
["Cerro San Ignacio",[-33.331,-70.681],"Cerros islas","878 m, en Huechuraba / Quilicura, al norte de la ciudad."],
["Cerro Pan de Azúcar",[-33.313,-70.693],"Cerros islas","907 m, en el límite Huechuraba–Colina–Quilicura."],
["Cerro Quilapilún",[-33.076,-70.673],"Cerros islas","994 m, en Colina, al norte de Chicureo."],
];
const out=[];
for(const [n,near,tipo,desc] of L){
  const c=raw.filter(x=>x.tags.name===n).sort((a,b)=>Math.hypot(a.lat-near[0],a.lon-near[1])-Math.hypot(b.lat-near[0],b.lon-near[1]))[0];
  if(!c||Math.hypot(c.lat-near[0],c.lon-near[1])>0.02){console.log('NOT FOUND',n);continue;}
  const disp=n==='Cerro Colorado'?(tipo==='Cordillera'?'Cerro Colorado (Farellones)':'Cerro Colorado (norponiente)'):n;
  out.push({id:'c'+out.length,name:disp,osm:n,tipo,desc,lat:+c.lat.toFixed(5),lon:+c.lon.toFixed(5),ele:c.tags.ele?+c.tags.ele:null,comuna:comunaOf(c.lon,c.lat),wikidata:c.tags.wikidata||null});
}
console.log(out.length,'cerros');for(const c of out)console.log(c.name,c.ele,c.comuna,c.wikidata);
fs.writeFileSync('cerros.json',JSON.stringify(out));
