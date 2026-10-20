# Decisiones de contenido (qué entra y qué se sacó)

**Leer antes de agregar calles, lugares o barrios**: lo que está aquí abajo ya se descartó y no se vuelve a agregar sin preguntar al dueño. Para **sacar** cosas, el dueño prefiere que se le liste primero y decidir una a una. Cómo se agrega o quita algo en los datos: [datos.md](datos.md).

## Tamaño actual
164 calles jugables (153 calles y 11 autopistas; los 6 ríos/canales y las líneas de tren solo salen en Explorar), 234 landmarks en `landmarks.json` y **260 lugares en el juego** contando barrios con perímetro, 17 cerros y 6 ríos/canales; 93 ciudades, 46 parques nacionales y 22 recorridos de micro troncales en Explorar.

## Sacados por irrelevantes (no volver a agregar sin preguntar)
- El Cortijo, Av. Lo Barnechea, Las Nieves, Río Tajo, Av. El Mirador, calles "Cerro El Plomo/Cerro Colorado", San Damián como calle (sigue como barrio), muchos colegios específicos del oriente, clubes de golf/polo/Stade Français, varios restaurantes. Quedan los bares Liguria y Nacional (el usuario puede querer sacarlos).
- Por decisión del dueño: Embajada de EE.UU., Plaza Las Lilas y San Enrique, los colegios Craighouse, Verbo Divino, Villa María, Lycée Saint-Exupéry, Nido de Águilas y The Grange (los colegios que quedan son los históricos), Prince of Wales, Teleférico Bicentenario (proyecto aparte; el Teleférico del San Cristóbal queda con perímetro), la mayoría de las sedes repetidas de universidades y CFT (se dejaron las más concurridas y repartidas por la ciudad), Av. Pintor Benito Rebolledo, Santos Dumont, Chesterton, Charles Hamilton, Juan XXIII, Bicentenario, Pedro Montt, Condell (Renca), Domingo Santa María, Eduardo Castillo Velasco, Walker Martínez, Camino Lo Boza, Av. Camilo Henríquez y Av. Consistorial, Av. Mariano Sánchez Fontecilla (quedaba cortada en 51 tramos por 7 comunas: confusa).
- Oct. 2026, por ser chicas y del oriente alto (ver [revision-calles.md](revision-calles.md)): El Rodeo, Raúl Labbé, Las Hualtatas, Martín de Zamora, Candelaria Goyenechea, Luis Carrera, Alonso de Camargo, Francisco Bulnes Correa, Camino Las Flores, Paul Harris, Las Tranqueras y Sucre.
- Oct. 2026, por apretar la franja norte–sur de Providencia: Av. José Manuel Infante, Luis Thayer Ojeda y Av. Holanda (Suecia y Ricardo Lyon se quedan).
- Se quedan San Carlos de Apoquindo, Escrivá de Balaguer, Av. La Dehesa e Isabel La Católica.
- También se sacó el barrio Los Trapenses (lugar emblemático y barrio con perímetro).
- Oct. 2026 también: los colegios San Ignacio (El Bosque y Alonso Ovalle) y Santiago College, y el Castillo Forestal.
- La Confitería Torres volvió, con su ubicación fija en la Alameda (el geocodificador daba la sucursal de Las Condes). Se dejó Av. Miraflores (Renca) por ser la que llega al aeropuerto.

## Calles agregadas
Agustinas y Monjitas (para ubicarse cerca de La Moneda), Rolando Petersen, Camino a Lonquén (se tomó éste porque no hay "Av. Lonquén"), Isabel La Católica, Presidente Errázuriz y Alexander Fleming (de vuelta). Candelaria Goyenechea, Luis Carrera y Alonso de Camargo también se agregaron, pero después se sacaron (lista de arriba; ya no están en `tools/streetlist.js`).

## Pendientes de confirmar con el usuario
Estadio Español (club de socios, sigue), Colegio SEK de Las Condes (no se encontró; el que había estaba en Peñalolén y se sacó), "Av. Pedro Aguirre Cerda" se tomó la de Cerrillos, "Las Flores" se tomó Camino Las Flores de Las Condes, falta la Gerónimo de Alderete de La Florida.

## Secciones retiradas de la UI pero con datos disponibles
Barrios (ahora dentro de Lugares emblemáticos), Fotos, Cerros (solo 17 pasaron a landmarks; los 44 siguen en la capa Cerros de Explorar). Fronteras se retiró y en oct. 2026 se borró también su cálculo (`tools/border.js`, en git). Los juegos de rutas desde un punto fijo del dueño (`rs-home-*`, `mt-route`) se borraron, y en oct. 2026 también sus datos (rutas, micros "cercanas", scripts de `tools/`).

## Street View (decisiones recientes del dueño)
Sí se camina durante la pregunta (hasta 500 m, sin nombres en el panorama ni en el mapa; el puntaje se mide desde el punto de partida; antes no se podía y al dueño le parecía demasiado difícil); ronda siempre de 10; sin "todas"; un botón por nivel, **todos ronda oficial** (sin práctica: sin ayudas no tenía sentido; ídem Comunas); el fácil es chico (~24) y céntrico; priorizar calles y lugares históricos sobre recintos. En cerros grandes vale cualquier toque dentro del cerro. Evitar letreros (cruces) en lo posible. El punto de la pregunta debe cambiar entre partidas: nadie debe ganar memorizando una foto.

## Fuentes de fotos
Solo Wikimedia Commons (con autor y licencia visibles) y Panoramax. Mapillary se probó y se **eliminó** (las fotos eran inútiles). Nada de imágenes de Google fuera de Street View.
