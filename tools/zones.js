// Barrios y zonas con perímetro: cada esquina es el cruce de dos calles (nombres OSM, regex) o un punto fijo.
const fs=require('fs');const turf=require('@turf/turf');
const W=require('./ways_named.json');const KX=92.9,KY=111.2;
const names=Object.keys(W);
const waysOf=re=>{const r=new RegExp(re,'i');return names.filter(n=>r.test(n)).flatMap(n=>W[n]);};
function dPS(p,a,b){const px=p[1]*KX,py=p[0]*KY,ax=a[1]*KX,ay=a[0]*KY,bx=b[1]*KX,by=b[0]*KY;const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(ax+t*dx-px,ay+t*dy-py);}
function corner(ra,rb,near){
  const A=waysOf(ra),B=waysOf(rb);if(!A.length||!B.length)return {err:'sin calle '+(A.length?rb:ra)};
  let best=null,bd=1e9;
  for(const wa of A)for(const p of wa){if(near&&Math.hypot((p[0]-near[0])*KY,(p[1]-near[1])*KX)>1.2)continue;
    for(const wb of B)for(let i=0;i<wb.length-1;i++){if(Math.abs(wb[i][0]-p[0])>0.01||Math.abs(wb[i][1]-p[1])>0.01)continue;const d=dPS(p,wb[i],wb[i+1]);if(d<bd){bd=d;best=p;}}}
  return bd<0.06?{p:best}:{err:`no se cruzan ${ra} × ${rb} (${bd.toFixed(2)} km)`};
}
const AL="^Avenida Libertador Bernardo O.Higgins$",SM="^Avenida Santa María$",VESP="Américo Vespucio",AC="^(Autopista Central|Avenida Manuel Rodríguez( Norte| Sur)?)$";
const Z=[
 {name:"Barrio Italia",desc:"Tiendas de diseño, anticuarios, cafés y restaurantes en casonas antiguas, en torno a Av. Italia y Condell.",streets:["Av. Francisco Bilbao","Av. Salvador","Av. Irarrázaval","Av. General Bustamante"],near:[-33.447,-70.626],
  c:[["^Avenida General Bustamante$","^Avenida Francisco Bilbao$"],["^Avenida Francisco Bilbao$","^Avenida Salvador$"],["^Avenida Salvador$","^Avenida Irarrázaval$"],["^Avenida Irarrázaval$","^Avenida General Bustamante$"]]},
 {name:"Barrio Lastarria",desc:"Barrio bohemio y cultural: GAM, Museo de Artes Visuales, cine El Biógrafo, restaurantes y bares; al norte, el Parque Forestal y Bellas Artes.",streets:["Alameda","Cerro Santa Lucía (Victoria Subercaseaux)","Merced / Parque Forestal","Plaza Italia"],near:[-33.438,-70.639],
  c:[[AL,"^Victoria Subercaseaux$"],["^Victoria Subercaseaux$","^Merced$"],[-33.43640,-70.63540]]},
 {name:"Barrio Bellavista",desc:"Vida nocturna, teatros y restaurantes: Patio Bellavista, La Chascona (casa de Neruda), entrada al zoológico y al funicular del San Cristóbal. Mitad Recoleta, mitad Providencia (las separa Pío Nono).",streets:["Av. Santa María (río Mapocho)","Loreto","Dominica","Faldeo del cerro San Cristóbal","Del Arzobispo"],near:[-33.432,-70.635],
  c:[[SM,"^Loreto$"],["^Loreto$","^Dominica$"],["^Dominica$","^Pío Nono$"],[-33.42900,-70.63050],[SM,"^Del Arzobispo$"]]},
 {name:"Patronato",desc:"Barrio comercial de ropa y telas, de tradición árabe y coreana; pegado a La Vega y al barrio Bellavista.",streets:["Av. Recoleta","Dominica","Loreto","Av. Santa María (río Mapocho)"],near:[-33.430,-70.644],
  c:[["^Avenida Recoleta$",SM],["^Avenida Recoleta$","^Dominica$"],["^Dominica$","^Loreto$"],["^Loreto$",SM]]},
 {name:"Barrio Cívico",desc:"El corazón político: La Moneda, Plaza de la Constitución, ministerios, Banco Central, Intendencia; hacia el sur de la Alameda sigue el Paseo Bulnes.",streets:["Alameda","Teatinos","Agustinas","Morandé"],near:[-33.442,-70.654],
  c:[["^Teatinos$",AL],["^Teatinos$","^Agustinas$"],["^Morandé$","^Agustinas$"],["^Morandé$",AL]]},
 {name:"Centro histórico (el triángulo)",desc:"El Santiago fundacional: Plaza de Armas, Catedral, paseos Ahumada y Huérfanos, Mercado Central, tribunales, bancos y el Barrio Cívico.",streets:["Alameda","Autopista Central (Norte-Sur)","Río Mapocho","Plaza Italia"],near:[-33.439,-70.650],
  c:[[AC,AL],[-33.43250,-70.66050],[-33.43230,-70.65250],[-33.43640,-70.63540]]},
 {name:"Barrio República (barrio universitario)",desc:"Casonas convertidas en universidades: UNAB, UDP, U. Alberto Hurtado, Duoc, Santo Tomás, U. de Los Lagos; estaciones República y Los Héroes.",streets:["Alameda","Av. España","Av. Blanco Encalada","Av. Manuel Rodríguez (Autopista Central)"],near:[-33.452,-70.666],
  c:[[AL,"^Avenida España$"],["^Avenida España$","^Avenida Almirante Blanco Encalada$"],["^Avenida Almirante Blanco Encalada$",AC],[AC,AL]]},
 {name:"Barrio Meiggs",desc:"Comercio mayorista y popular: juguetes, cotillón, importaciones; junto a la Estación Central y los terminales de buses.",streets:["Alameda","Exposición","Sazié","Bascuñán Guerrero"],near:[-33.453,-70.677],
  c:[[AL,"^Exposición$"],["^Exposición$","^Sazié$"],["^Sazié$","^Bascuñán Guerrero$"],["^Bascuñán Guerrero$",AL]]},
 {name:"Barrio Brasil",desc:"Barrio de casonas y vida universitaria y nocturna en torno a la Plaza Brasil; incluye el pequeño Barrio Concha y Toro.",streets:["Alameda","Av. Ricardo Cumming","San Pablo","Av. Manuel Rodríguez (Autopista Central)"],near:[-33.442,-70.664],
  c:[[AL,"^Avenida Ricardo Cumming$"],["^Avenida Ricardo Cumming$","^San Pablo$"],["^San Pablo$",AC],[AC,AL]]},
 {name:"Barrio Yungay",desc:"Zona típica de casas de fachada continua: Plaza Yungay (Roto Chileno), Peluquería Francesa, Museo de la Memoria, Biblioteca de Santiago; al poniente, la Quinta Normal.",streets:["Matucana","San Pablo","Av. Ricardo Cumming","Alameda"],near:[-33.441,-70.673],
  c:[["^Matucana$","^San Pablo$"],["^San Pablo$","^Avenida Ricardo Cumming$"],["^Avenida Ricardo Cumming$",AL],[-33.45070,-70.67900]]},
 {name:"Barrio Franklin (persas)",desc:"El Persa Bío Bío y el Matadero Franklin: galpones de antigüedades, muebles, ropa y comida, sobre todo los fines de semana.",streets:["Franklin","Av. Santa Rosa","Placer","San Diego"],near:[-33.476,-70.648],
  c:[["^Franklin$","^San Diego$"],["^Franklin$","^Avenida Santa Rosa$"],["^Avenida Santa Rosa$","^Placer$"],["^Placer$","^San Diego$"]]},
 {name:"El Golf / Sanhattan",desc:"El distrito financiero: torres de oficinas (Titanium, Costanera Center al borde), embajadas, hoteles y los restaurantes de Isidora Goyenechea; estaciones Tobalaba, El Golf, Alcántara y Escuela Militar.",streets:["Av. Apoquindo","Av. Tobalaba (Canal San Carlos)","Av. Vitacura","Av. Presidente Riesco","Américo Vespucio"],near:[-33.414,-70.593],
  c:[["^Avenida Apoquindo$","^Avenida Tobalaba$"],["^Avenida Vitacura$","^(Avenida )?Nueva Tobalaba$"],["^Avenida Vitacura$","^Avenida Presidente Riesco$"],["^Avenida Presidente Riesco$",VESP],[VESP,"^Avenida Apoquindo$"]]},
 {name:"Estadio Nacional (recinto)",desc:"El coliseo central más todo el Parque Deportivo: velódromo, piscina, court central de tenis, pista atlética y las canchas de los Panamericanos 2023.",streets:["Av. Grecia","Av. Pedro de Valdivia","Guillermo Mann","Av. Marathon"],near:[-33.465,-70.610],
  c:[["^Avenida Grecia$","^Avenida Marathon( Oriente)?$"],["^Avenida Grecia$","^Avenida Pedro de Valdivia$"],["^Avenida Pedro de Valdivia$","^Doctor Guillermo Mann$"],["^Doctor Guillermo Mann$","^Avenida Marathon( Oriente)?$"]]},
 {name:"Villa Olímpica",desc:"Conjunto de bloques de departamentos construido para el Mundial de 1962, al poniente del Estadio Nacional.",streets:["Av. Grecia","Av. Marathon","Carlos Dittborn","Lo Encalada"],near:[-33.464,-70.618],
  c:[["^Avenida Grecia$","^Lo Encalada$"],["^Avenida Grecia$","^Avenida Marathon( Oriente)?$"],["^Avenida Marathon( Oriente)?$","^Avenida Carlos Dittborn$"],["^Avenida Carlos Dittborn$","^Lo Encalada$"]]},
 {name:"Parque O'Higgins",desc:"Gran parque al sur del centro: Movistar Arena, Fantasilandia, la elipse de la Parada Militar y las fondas del 18; al lado, Beauchef (Ingeniería U. de Chile).",streets:["Av. Tupper","Av. Viel (Autopista Central)","Av. General Rondizzoni","Av. Beauchef"],near:[-33.465,-70.660],
  c:[["^Avenida Beaucheff?$","^(Avenida )?Tupper$"],["^(Avenida )?Tupper$","^(Avenida )?Viel$"],["^(Avenida )?Viel$","Rondizzoni"],["Rondizzoni","^Avenida Beaucheff?$"]]},
 {name:"Pedro de Valdivia Norte",desc:"Barrio residencial tranquilo entre el Mapocho y el cerro San Cristóbal: Campus Lo Contador (UC), acceso al Parque Metropolitano por Pedro de Valdivia Norte, Parque de las Esculturas al frente.",streets:["Av. Santa María (río Mapocho)","Los Conquistadores (cerro San Cristóbal)","El Gobernador"],near:[-33.420,-70.614],
  c:[[SM,"^Los Conquistadores$"],[-33.41720,-70.61560],["^Los Conquistadores$","^El Gobernador$"],[SM,"^El Gobernador$"]]},
];

// --- más barrios: con calles (c), a lo largo de un eje (axis) o zona aproximada alrededor de un punto (at)
const LM=JSON.parse(fs.readFileSync('landmarks.json'));
Z.push(
 {name:"Barrio Inés de Suárez",desc:"Sector residencial y gastronómico de Providencia en torno al Parque Inés de Suárez y la estación del mismo nombre (L6): bares y restaurantes de Antonio Varas, Pocuro con su ciclovía.",streets:["Av. Eliodoro Yáñez","Av. Pedro de Valdivia","Av. Francisco Bilbao","Av. Antonio Varas"],near:[-33.436,-70.611],
  c:[["^Avenida Antonio Varas$","^Eliodoro Yáñez$"],["^Eliodoro Yáñez$","^Avenida Pedro de Valdivia$"],["^Avenida Pedro de Valdivia$","^Avenida Francisco Bilbao$"],["^Avenida Francisco Bilbao$","^Avenida Antonio Varas$"]]},
 {name:"Los Dominicos (sector)",desc:"Final de Apoquindo: Iglesia y Pueblito Los Dominicos, Parque Los Dominicos, estación terminal de la L1, Mall Plaza Los Dominicos al borde.",streets:["Camino El Alba","Paul Harris","Av. Cristóbal Colón","Av. Padre Hurtado"],near:[-33.410,-70.541],
  c:[["^Camino El Alba$","^Avenida Padre Hurtado"],["^Camino El Alba$","^Paul Harris$"],["^Paul Harris$","^Avenida Cristóbal Colón$"],["^Avenida Cristóbal Colón$","^Avenida Padre Hurtado"]]},
 {name:"San Damián",desc:"Barrio residencial del sector alto de Las Condes, entre Av. Las Condes y Charles Hamilton, en el límite con Vitacura y Lo Barnechea; Clínica Las Condes y Estoril quedan en su borde poniente.",streets:["Av. Las Condes","Camino San Francisco de Asís","Av. Charles Hamilton","Lo Fontecilla"],near:[-33.380,-70.522],
  c:[["^Avenida Las Condes$","^Camino San Francisco de Asís$"],["^Camino San Francisco de Asís$","^Avenida Charles Hamilton$"],["^Avenida Charles Hamilton$","^Lo Fontecilla$"],["^Lo Fontecilla$","^Avenida Las Condes$"]]},
 {name:"San Carlos de Apoquindo (sector)",desc:"Sector alto de Las Condes al pie de la cordillera: U. de los Andes, UDD, estadio de la UC (Claro Arena), colegios y condominios.",streets:["Av. Francisco Bulnes Correa","Camino San Francisco de Asís","Av. La Plaza","General Blanche"],near:[-33.395,-70.508],approx:true,
  c:[["^Avenida Francisco Bulnes Correa$","^General Blanche$"],[-33.38390,-70.50610],["^Camino San Francisco de Asís$","^Avenida La Plaza$"],[-33.3990,-70.4985],[-33.4105,-70.5005],[-33.4105,-70.5090]]},
 {name:"La Dehesa (sector)",desc:"El gran sector residencial de Lo Barnechea en torno a Av. La Dehesa y El Rodeo: malls, colegios y clubes.",axis:["^Avenida La Dehesa$","^Avenida El Rodeo$"],r:0.8,streets:["Av. La Dehesa","Av. El Rodeo"]},
 {name:"Los Trapenses",desc:"Sector residencial del norte de Lo Barnechea a lo largo del Camino Los Trapenses: colegios, Santiago College, condominios.",axis:["^Avenida Camino Los Trapenses$"],r:0.6,streets:["Av. Camino Los Trapenses"]},
 {name:"Lynch (La Reina)",desc:"Sector residencial de La Reina en torno a las avenidas Lynch Norte y Lynch Sur.",axis:["^Avenida Lynch (Norte|Sur)$"],r:0.35,streets:["Av. Lynch Norte","Av. Lynch Sur"]},
 {name:"El Arrayán",at:1.1},{name:"Quinchamalí",at:0.45},{name:"Santa María de Manquehue",at:0.8},{name:"Lo Curro",at:0.9},{name:"Jardín del Este",at:0.5},
 {name:"Bajos de Mena",at:1.0},{name:"La Bandera",at:0.6},{name:"La Legua",at:0.5},{name:"La Victoria",at:0.45},{name:"La Pincoya",at:0.7},{name:"Lo Hermida",at:0.8},
 {name:"Villa Francia",at:0.45},{name:"Villa Frei",at:0.4},{name:"El Llano Subercaseaux",at:0.6},{name:"Población José María Caro",at:0.8},{name:"Lo Cañas",at:1.2},{name:"Villa Portales",at:0.3},{name:"Las Vizcachas",at:0.8}
);
const comunas=JSON.parse(fs.readFileSync('comunas_s.geojson')).features;
const out=[];
for(const z of Z){let poly=[];let ok=true;
  if(z.axis||z.at){let pg0;
    if(z.axis){const ws=z.axis.flatMap(r=>waysOf(r));if(!ws.length){console.log('ERR eje',z.name);continue;}pg0=turf.buffer(turf.multiLineString(ws.map(w=>w.map(p=>[p[1],p[0]]))),z.r);}
    else{const l=LM.find(x=>x.name===z.name);if(!l){console.log('ERR sin landmark',z.name);continue;}z.desc=l.desc;z.streets=[];pg0=turf.circle([l.lon,l.lat],z.at,{steps:20});}
    if(z.axis&&/Dehesa|Trapenses/.test(z.name)){const lb=comunas.find(f=>f.properties.name==='Lo Barnechea');const it=turf.intersect(turf.featureCollection([pg0,lb]));if(it)pg0=it;}
    let g=pg0.geometry;if(g.type==='MultiPolygon')g={type:'Polygon',coordinates:g.coordinates.sort((a,b)=>b[0].length-a[0].length)[0]};
    const sm=turf.simplify(turf.polygon([g.coordinates[0]]),{tolerance:0.0006});poly=sm.geometry.coordinates[0].slice(0,-1).map(c=>[c[1],c[0]]);z.approx=true;z.c=[];}
  for(const c of (z.axis||z.at?[]:z.c)){if(typeof c[0]==='number'){poly.push(c);continue;}const r=corner(c[0],c[1],z.near);if(r.err){console.log('ERR',z.name,':',r.err);ok=false;}else poly.push(r.p);}
  if(!ok)continue;
  const ring=[...poly,poly[0]].map(p=>[p[1],p[0]]);const pg=turf.polygon([ring]);const ctr=turf.centerOfMass(pg).geometry.coordinates;
  const cs=comunas.filter(f=>turf.booleanIntersects(f,pg)).map(f=>({n:f.properties.name,a:turf.area(turf.intersect(turf.featureCollection([f,pg]))||turf.point([0,0]))})).filter(x=>x.a>0.08*turf.area(pg)).sort((a,b)=>b.a-a.a).map(x=>x.n);
  out.push({name:z.name,desc:z.desc,streets:z.streets,...(z.approx?{approx:true}:{}),...(z.axis?{axis:true}:{}),comunas:cs,poly:poly.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]),c:[+ctr[1].toFixed(5),+ctr[0].toFixed(5)],km2:+(turf.area(pg)/1e6).toFixed(2)});
  console.log('OK ',z.name.padEnd(36),(turf.area(pg)/1e6).toFixed(2)+' km²',cs.join('/'),'|',poly.map(p=>p[0].toFixed(4)+','+p[1].toFixed(4)).join(' '));
}
fs.writeFileSync('zones.json',JSON.stringify(out));console.log(out.length,'zonas');
