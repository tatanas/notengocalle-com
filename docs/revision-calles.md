# Revisión de las calles del juego (octubre 2026)

Lista completa de las 174 calles jugables (calles y autopistas; los ríos, canales y trenes no entran) para decidir qué dejar en el
juego para todos y qué dejar solo para uno (en "Mis calles"). **No se ha sacado nada**: las marcas son sugerencias para revisar una a una.

## Criterio

- **% grande**: parte del largo que OpenStreetMap clasifica como autopista, troncal, primaria o secundaria. El mapa base del juego
  (OpenFreeMap) dibuja esas calles aunque uno se aleje. Las terciarias aparecen al acercarse un poco, y las residenciales solo de muy cerca.
  Si la calle es grande (60 % o más), se queda aunque solo la conozca la gente de su sector.
- **Sector**: el que tiene al menos el 60 % del largo de la calle; si ninguno llega a eso, "cruza sectores".
- Calculado con `.local/clases_calles.cjs` y `.local/sectores_calles.cjs` (no versionados) sobre `tools/btiles/` y `public/data/data.js`.

## Lo que salta a la vista

- El oriente alto (Las Condes, Vitacura y Lo Barnechea) tiene **39 calles**, y el poniente (Maipú, Pudahuel, Cerro Navia,
  Lo Prado, Quinta Normal, Estación Central, Cerrillos y Renca), con unas tres veces más habitantes, tiene **23**.
  Casi todas las calles chicas (menos de 30 % grande) del juego están en el oriente.
- San Francisco (Pudahuel) y José Joaquín Pérez **no son de nicho según este criterio**: son 97 % y 100 % grandes. Pesan en el poniente lo mismo
  que Tomás Moro o Camino El Alba en Las Condes.

## 🟠 Candidatas a sacar del juego para todos (chicas o medianas, y del oriente alto)

- Av. El Rodeo: calle de barrio de La Dehesa
- Av. Raúl Labbé: tramo corto de Lo Barnechea; el camino a la nieve ya está como Camino a Farellones
- Las Hualtatas: residencial de Vitacura alto
- Candelaria Goyenechea: residencial (la agregaste hace poco)
- Luis Carrera: residencial (la agregaste hace poco)
- Alonso de Camargo: residencial (la agregaste hace poco)
- Martín de Zamora: residencial de Las Condes
- Av. Francisco Bulnes Correa: Las Condes alto, conocida por los colegios del sector
- Camino Las Flores: Las Condes alto
- Av. Paul Harris: Las Condes alto
- Las Tranqueras: calle de barrio entre Vitacura y Las Condes
- Av. La Dehesa: el eje del barrio La Dehesa; importante allá, poco conocida fuera
- Av. San Carlos de Apoquindo: terciaria; la conoce quien va a la UANDES o al estadio de la UC
- Av. Monseñor Escrivá de Balaguer: larga y junto al río, pero mediana (42 %) y poco conocida fuera del sector

Isidora Goyenechea también es chica (35 %), pero es conocida en toda la ciudad (El Golf, Sanhattan): se sugiere dejarla.

## 🟡 Grandes, pero muy del sector (se quedan según el criterio; revisar si se quiere ser más estricto)

- Av. José Alcalde Délano: grande en OSM, pero solo sirve a La Dehesa
- Gerónimo de Alderete: 1,7 km entre Vitacura y Las Condes
- Camino San Francisco de Asís: sube a San Damián
- Av. Luis Pasteur: Vitacura
- Av. Alexander Fleming: Las Condes (la devolviste hace poco)

## ⚪ Zona gris: chicas del oriente "céntrico" (Providencia, Ñuñoa, La Reina)

Más conocidas porque mucha gente trabaja o estudia por ahí, pero en el mapa son terciarias:

- Av. Ricardo Lyon
- Av. Simón Bolívar
- Av. Echeñique
- Luis Thayer Ojeda
- Av. Holanda
- Av. José Manuel Infante
- Av. Sucre
- Av. El Cerro
- Av. Chile España

Av. Suecia, Av. El Bosque y Av. Los Presidentes también son chicas, pero se sugiere dejarlas: Suecia y El Bosque son conocidas en toda
la ciudad, y Los Presidentes tiene estación de la L4 y no es del barrio alto.

Fuera del oriente también hay calles chicas, pero no son las que inclinan el juego hacia un sector: Ureta Cox, Rojas Magallanes,
Av. Pedro Fontova, Camino La Pirámide, Av. Las Torres (poniente), Av. Einstein, Av. José Miguel Infante (Renca) y, en el centro,
Moneda, Morandé, Compañía, Toesca, Bandera y las peatonales.

## Grandes avenidas que faltan fuera del oriente (para equilibrar, si se quiere)

Calles primarias o secundarias largas de OSM que no están en el juego (sin las que ya sacaste antes):

- Poniente: Av. La Estrella (Pudahuel), Av. General Óscar Bonilla (Lo Prado), Av. Esquina Blanca, Av. Segunda Transversal y Av. Nueva San Martín (Maipú).
- Sur: Av. Isabel Riquelme, Av. José Joaquín Prieto, Av. Santa Raquel y Froilán Roa (La Florida), Av. Ejército Libertador y Av. Domingo Tocornal (Puente Alto),
  Av. Observatorio, Av. Lo Blanco, Av. Clotario Blest, Av. Jorge Alessandri (San Bernardo).
- Norte: Diagonal Cardenal José María Caro (Conchalí).

## Lista completa por sector

🟠 candidata a sacar · 🟡 grande pero local · ⚪ zona gris

### Ejes que cruzan varios sectores: 7

| Calle                                       |    km | % grande | Comunas                                              |
| ------------------------------------------- | ----: | -------: | ---------------------------------------------------- |
| Autopista del Sol (Ruta 78) (autopista)     |  76,3 |    100 % | Maipú, Talagante, Peñaflor, Padre Hurtado, Cerrillos |
| Costanera Norte (autopista)                 |  69,6 |    100 % | Vitacura, Renca, Providencia, Pudahuel               |
| Av. Lo Espejo                               |  10,3 |     97 % | Cerrillos, Lo Espejo, Maipú, San Bernardo, El Bosque |
| Alameda (Av. Libertador Bernardo O'Higgins) |  16,2 |     93 % | Santiago, Estación Central                           |
| Américo Vespucio (autopista)                | 248,1 |     92 % | Pudahuel, Quilicura, Maipú                           |
| Av. Dorsal                                  |  14,1 |     80 % | Renca, Recoleta, Conchalí                            |
| Catedral                                    |   5,3 |     70 % | Santiago, Quinta Normal, Lo Prado                    |

### Centro (Santiago): 28

| Calle                            |  km | % grande | Comunas                                   |
| -------------------------------- | --: | -------: | ----------------------------------------- |
| Av. Matta (Manuel Antonio Matta) | 5,5 |    100 % | Santiago, Ñuñoa                           |
| Av. Ricardo Cumming              | 4,2 |    100 % | Santiago                                  |
| Agustinas                        | 3,3 |    100 % | Santiago                                  |
| Av. Matucana                     | 3,1 |    100 % | Santiago, Estación Central, Quinta Normal |
| Av. Diez de Julio                | 2,6 |    100 % | Santiago                                  |
| Teatinos                         | 1,4 |    100 % | Santiago                                  |
| Diagonal Paraguay                | 1,1 |    100 % | Santiago                                  |
| Monjitas                         | 0,9 |    100 % | Santiago                                  |
| Av. Santa Isabel                 | 4,8 |     98 % | Santiago, Providencia                     |
| Av. Manuel Rodríguez             | 6,3 |     96 % | Santiago                                  |
| Franklin                         | 2,6 |     93 % | Santiago                                  |
| Ñuble                            |   3 |     89 % | Santiago                                  |
| Av. Brasil                       | 2,7 |     86 % | Santiago                                  |
| Av. Presidente Balmaceda         |   3 |     84 % | Santiago, Quinta Normal                   |
| Av. Blanco Encalada              | 4,2 |     82 % | Santiago                                  |
| Bascuñán Guerrero                | 3,3 |     82 % | Santiago, Pedro Aguirre Cerda             |
| Exposición                       | 2,4 |     82 % | Santiago, Estación Central                |
| Av. Beauchef                     | 2,8 |     78 % | Santiago, Pedro Aguirre Cerda             |
| Merced                           | 1,7 |     76 % | Santiago                                  |
| Av. Portugal                     | 3,7 |     75 % | Santiago                                  |
| Bandera                          | 1,4 |     31 % | Santiago                                  |
| Moneda                           | 3,3 |      0 % | Santiago                                  |
| Compañía de Jesús                | 2,7 |      0 % | Santiago                                  |
| Toesca                           | 1,8 |      0 % | Santiago                                  |
| Morandé                          | 1,4 |      0 % | Santiago                                  |
| Paseo Ahumada                    | 0,6 |      0 % | Santiago                                  |
| Paseo Estado                     | 0,6 |      0 % | Santiago                                  |
| Nueva York                       | 0,2 |      0 % | Santiago                                  |

### Oriente (Providencia, Ñuñoa, La Reina, Peñalolén): 37

| Calle                      |   km | % grande | Comunas                                      |
| -------------------------- | ---: | -------: | -------------------------------------------- |
| Av. Grecia                 | 20,1 |    100 % | Ñuñoa, Peñalolén                             |
| Av. Francisco Bilbao       | 16,7 |    100 % | Providencia, La Reina, Las Condes            |
| Av. Irarrázaval            | 11,4 |    100 % | Ñuñoa                                        |
| Av. Pedro de Valdivia      | 10,6 |    100 % | Ñuñoa, Providencia, Macul                    |
| Av. Andrés Bello           |  5,6 |    100 % | Providencia, Las Condes                      |
| Av. Los Leones             |  5,6 |    100 % | Providencia                                  |
| Av. Príncipe de Gales      |  5,5 |    100 % | La Reina                                     |
| Av. José Pedro Alessandri  |  4,1 |    100 % | Ñuñoa                                        |
| Av. Eliodoro Yáñez         |  3,3 |    100 % | Providencia                                  |
| Av. Salvador               |  3,2 |    100 % | Providencia, Ñuñoa                           |
| Av. General Bustamante     |  3,1 |    100 % | Providencia, Ñuñoa                           |
| Av. Antonio Varas          |    3 |    100 % | Providencia, Ñuñoa                           |
| Av. Nueva Providencia      |  2,3 |    100 % | Providencia                                  |
| Av. Larraín                |  2,2 |    100 % | La Reina                                     |
| Av. Providencia            |  5,3 |     99 % | Providencia                                  |
| Av. Diagonal Oriente       |  5,1 |     95 % | Ñuñoa, Providencia                           |
| Dublé Almeyda              |  4,8 |     95 % | Ñuñoa                                        |
| Av. Ossa                   |  5,4 |     91 % | La Reina, Ñuñoa                              |
| Los Conquistadores         |  3,5 |     90 % | Providencia, Vitacura                        |
| Av. Tobalaba               | 18,5 |     88 % | Peñalolén, Providencia, La Reina, La Florida |
| Av. José Arrieta           |  6,3 |     85 % | Peñalolén, La Reina                          |
| Av. Quilín                 | 13,5 |     74 % | Peñalolén, Macul                             |
| Av. Manuel Montt           |  3,1 |     74 % | Providencia, Ñuñoa                           |
| Av. Pocuro                 |  4,2 |     68 % | Providencia                                  |
| ⚪ Av. Chile España        |  2,1 |     53 % | Ñuñoa, Providencia                           |
| Diagonal Las Torres        |  6,4 |     48 % | Peñalolén                                    |
| ⚪ Av. El Cerro            |  3,1 |     40 % | Providencia                                  |
| Av. El Bosque              |  4,3 |     20 % | Providencia, Las Condes                      |
| Av. Los Presidentes        |  8,6 |      0 % | Peñalolén                                    |
| ⚪ Av. Simón Bolívar       |  7,3 |      0 % | Ñuñoa, La Reina                              |
| ⚪ Av. Echeñique           |  6,6 |      0 % | La Reina, Ñuñoa                              |
| Av. Suecia                 |  4,4 |      0 % | Providencia, Ñuñoa                           |
| ⚪ Av. Holanda             |  4,3 |      0 % | Providencia, Ñuñoa                           |
| ⚪ Av. Ricardo Lyon        |  3,7 |      0 % | Providencia, Ñuñoa                           |
| ⚪ Av. José Manuel Infante |  3,4 |      0 % | Providencia, Ñuñoa                           |
| ⚪ Luis Thayer Ojeda       |    3 |      0 % | Providencia                                  |
| ⚪ Av. Sucre               |  2,6 |      0 % | Ñuñoa                                        |

### Oriente alto (Las Condes, Vitacura, Lo Barnechea): 39

| Calle                                     |   km | % grande | Comunas                            |
| ----------------------------------------- | ---: | -------: | ---------------------------------- |
| Av. Vitacura                              | 14,7 |    100 % | Vitacura, Las Condes               |
| Av. Padre Hurtado                         | 13,8 |    100 % | Las Condes, Vitacura, La Reina     |
| General Blanche                           |  4,7 |    100 % | Las Condes                         |
| Av. Nueva Costanera                       |  3,6 |    100 % | Vitacura                           |
| Av. Isabel La Católica                    |  3,4 |    100 % | Las Condes                         |
| Av. Presidente Errázuriz                  |  2,4 |    100 % | Las Condes                         |
| 🟡 Gerónimo de Alderete                   |  1,7 |    100 % | Vitacura, Las Condes               |
| Av. Presidente Kennedy                    | 27,9 |     98 % | Vitacura, Las Condes               |
| Av. Apoquindo                             | 10,7 |     98 % | Las Condes                         |
| 🟡 Av. José Alcalde Délano                |    6 |     98 % | Lo Barnechea                       |
| Av. Presidente Sebastián Piñera Echenique |  3,9 |     97 % | Las Condes                         |
| Av. Manquehue                             | 11,8 |     95 % | Las Condes, Vitacura               |
| Av. Presidente Riesco                     |  6,4 |     94 % | Las Condes                         |
| Av. Alonso de Córdova                     |  5,3 |     94 % | Las Condes, Vitacura               |
| Camino a Farellones (G-21) (autopista)    | 15,2 |     92 % | Lo Barnechea, Las Condes           |
| Camino El Alba                            |  5,2 |     89 % | Las Condes                         |
| Los Militares                             |  3,6 |     89 % | Las Condes                         |
| Av. Las Condes                            | 16,8 |     88 % | Las Condes, Lo Barnechea, Vitacura |
| 🟡 Camino San Francisco de Asís           |  6,4 |     85 % | Las Condes, Lo Barnechea           |
| Av. Tomás Moro                            |  3,6 |     85 % | Las Condes                         |
| Av. Cristóbal Colón                       |  8,5 |     84 % | Las Condes                         |
| 🟡 Av. Alexander Fleming                  |  3,3 |     68 % | Las Condes                         |
| Av. Santa María                           |  9,4 |     67 % | Vitacura                           |
| 🟡 Av. Luis Pasteur                       |  4,9 |     65 % | Vitacura                           |
| 🟠 Las Tranqueras                         |    3 |     57 % | Vitacura, Las Condes               |
| 🟠 Av. La Dehesa                          | 11,1 |     50 % | Lo Barnechea                       |
| 🟠 Av. Monseñor Escrivá de Balaguer       | 13,9 |     42 % | Vitacura, Lo Barnechea             |
| Isidora Goyenechea                        |  1,3 |     35 % | Las Condes                         |
| 🟠 Av. Raúl Labbé                         |  3,3 |     28 % | Lo Barnechea                       |
| 🟠 Av. El Rodeo                           |    4 |     22 % | Lo Barnechea                       |
| 🟠 Av. Francisco Bulnes Correa            |  8,6 |      0 % | Las Condes                         |
| 🟠 Av. San Carlos de Apoquindo            |  8,5 |      0 % | Las Condes                         |
| 🟠 Av. Paul Harris                        |    7 |      0 % | Las Condes                         |
| 🟠 Las Hualtatas                          |  6,5 |      0 % | Vitacura                           |
| 🟠 Martín de Zamora                       |  3,7 |      0 % | Las Condes                         |
| 🟠 Camino Las Flores                      |  3,7 |      0 % | Las Condes                         |
| 🟠 Alonso de Camargo                      |  3,1 |      0 % | Las Condes                         |
| 🟠 Luis Carrera                           |  2,6 |      0 % | Vitacura                           |
| 🟠 Candelaria Goyenechea                  |  2,4 |      0 % | Vitacura                           |

### Norte: 13

| Calle                                                |   km | % grande | Comunas                                                  |
| ---------------------------------------------------- | ---: | -------: | -------------------------------------------------------- |
| Autopista Nororiente (Radial Nororiente) (autopista) |   43 |    100 % | Colina, Huechuraba                                       |
| Autopista Los Libertadores (Ruta 57) (autopista)     | 27,9 |    100 % | Colina, Quilicura                                        |
| Ruta 5 Norte (Panamericana) (autopista)              | 26,2 |    100 % | Quilicura, Colina, Lampa                                 |
| Av. Los Zapadores                                    |  7,6 |    100 % | Recoleta, Conchalí                                       |
| Av. Fermín Vivaceta                                  |  5,9 |    100 % | Independencia, Conchalí                                  |
| Av. El Salto                                         |  5,5 |    100 % | Huechuraba, Recoleta                                     |
| Pío Nono                                             |  0,7 |    100 % | Recoleta, Santiago                                       |
| Av. Independencia                                    | 17,3 |     95 % | Conchalí, Independencia                                  |
| Av. Recoleta                                         | 12,3 |     94 % | Recoleta, Huechuraba                                     |
| Av. Presidente Eduardo Frei Montalva                 | 41,9 |     85 % | Quilicura, Colina, Lampa, Renca, Conchalí, Independencia |
| Av. Einstein                                         |  4,1 |     34 % | Recoleta, Independencia                                  |
| Av. Pedro Fontova                                    | 10,6 |     14 % | Huechuraba, Conchalí                                     |
| Camino La Pirámide                                   |  5,7 |      0 % | Huechuraba                                               |

### Poniente: 23

| Calle                              |   km | % grande | Comunas                                                                                         |
| ---------------------------------- | ---: | -------: | ----------------------------------------------------------------------------------------------- |
| Ruta 68 (a Valparaíso) (autopista) | 41,5 |    100 % | Pudahuel                                                                                        |
| Av. Teniente Cruz                  |  9,9 |    100 % | Pudahuel, Lo Prado, Cerro Navia                                                                 |
| Av. Lo Errázuriz                   |  9,3 |    100 % | Cerrillos                                                                                       |
| José Joaquín Pérez                 |  9,1 |    100 % | Cerro Navia, Pudahuel, Quinta Normal                                                            |
| Av. Gladys Marín                   |  4,7 |    100 % | Estación Central                                                                                |
| Av. Portales                       |  1,5 |    100 % | Estación Central, Santiago                                                                      |
| Av. Carrascal                      |    8 |     98 % | Quinta Normal, Cerro Navia                                                                      |
| San Francisco (Pudahuel)           |  6,1 |     97 % | Pudahuel, Lo Prado                                                                              |
| Av. Las Rejas                      |  5,1 |     97 % | Estación Central                                                                                |
| Av. Mapocho                        |  7,8 |     92 % | Quinta Normal, Cerro Navia, Santiago                                                            |
| Camino a Melipilla                 | 20,1 |     91 % | Maipú, Cerrillos                                                                                |
| Av. Pajaritos                      | 13,2 |     90 % | Maipú                                                                                           |
| Av. Ecuador                        |  2,7 |     88 % | Estación Central, Lo Prado                                                                      |
| Av. General Velásquez              | 53,9 |     87 % | San Bernardo, Renca, Quinta Normal, Cerrillos, Estación Central, Lo Espejo, Pedro Aguirre Cerda |
| Av. 5 de Abril                     |  8,4 |     82 % | Estación Central                                                                                |
| Av. Neptuno                        |  6,9 |     82 % | Lo Prado, Cerro Navia, Quinta Normal, Estación Central                                          |
| Av. Pedro Aguirre Cerda            | 12,8 |     78 % | Cerrillos, Estación Central                                                                     |
| Av. Miraflores (Renca)             |  7,3 |     72 % | Renca, Pudahuel                                                                                 |
| Av. Rolando Petersen               |    2 |     72 % | Cerro Navia, Renca                                                                              |
| Camino a Rinconada                 |  9,4 |     71 % | Maipú                                                                                           |
| Av. San Pablo                      | 14,1 |     70 % | Pudahuel, Lo Prado, Santiago, Quinta Normal                                                     |
| Av. José Miguel Infante            |    9 |     39 % | Renca                                                                                           |
| Av. Las Torres (poniente)          | 14,9 |     14 % | Cerrillos, Cerro Navia, Maipú, Lo Prado, Estación Central, Pudahuel                             |

### Sur: 27

| Calle                                   |   km | % grande | Comunas                                                                    |
| --------------------------------------- | ---: | -------: | -------------------------------------------------------------------------- |
| Autopista Central (autopista)           | 81,9 |    100 % | San Bernardo, Santiago                                                     |
| Autopista Acceso Sur (autopista)        | 50,6 |    100 % | Buin, Puente Alto, La Pintana, San Bernardo, La Granja                     |
| Gran Avenida (José Miguel Carrera)      | 26,5 |    100 % | San Miguel, El Bosque, La Cisterna, San Bernardo                           |
| Camino al Volcán (G-25) (autopista)     | 12,7 |    100 % | San José de Maipo                                                          |
| Av. Las Industrias                      | 10,1 |    100 % | San Joaquín, La Granja                                                     |
| Av. Macul                               |  7,7 |    100 % | Macul                                                                      |
| Av. Presidente Salvador Allende Gossens |  7,4 |    100 % | San Joaquín, San Miguel, Pedro Aguirre Cerda                               |
| Av. El Parrón                           |  4,9 |    100 % | La Cisterna, San Ramón, Lo Espejo                                          |
| Av. Cerrillos                           |  2,9 |    100 % | Pedro Aguirre Cerda                                                        |
| Av. Santa Rosa                          | 39,9 |     98 % | La Pintana, San Ramón, San Joaquín, San Miguel, Santiago                   |
| Av. Marathon                            |  9,7 |     98 % | Macul, Ñuñoa                                                               |
| Av. Gabriela                            | 12,9 |     97 % | Puente Alto, La Pintana                                                    |
| Av. Lo Ovalle                           | 11,5 |     95 % | La Granja, San Miguel, Pedro Aguirre Cerda, San Joaquín, La Cisterna       |
| Av. Trinidad                            |  8,1 |     93 % | La Florida, Puente Alto                                                    |
| Av. Padre Hurtado (sur)                 | 30,3 |     90 % | San Bernardo, Buin, El Bosque                                              |
| Av. Vicuña Mackenna                     | 37,4 |     89 % | La Florida, Santiago, San Joaquín, Macul, Ñuñoa                            |
| San Francisco (La Pintana)              |  9,4 |     88 % | El Bosque, La Pintana, San Ramón                                           |
| Av. Carlos Valdovinos                   | 10,3 |     87 % | Pedro Aguirre Cerda, San Joaquín, San Miguel, Santiago                     |
| Camino a Lonquén                        | 26,7 |     86 % | Calera de Tango, San Bernardo, Cerrillos, Maipú                            |
| Av. Eyzaguirre                          | 13,6 |     85 % | Puente Alto                                                                |
| Av. San José de la Estrella             |  8,7 |     85 % | La Florida, La Granja, Puente Alto                                         |
| Av. Departamental                       | 30,6 |     84 % | La Florida, San Miguel, Pedro Aguirre Cerda, Peñalolén, San Joaquín, Macul |
| Av. Rodrigo de Araya                    |  7,5 |     84 % | Macul, Ñuñoa                                                               |
| Av. Concha y Toro                       | 16,4 |     80 % | Puente Alto, Pirque                                                        |
| Av. La Florida                          | 17,7 |     65 % | La Florida                                                                 |
| Rojas Magallanes                        |  8,3 |     18 % | La Florida                                                                 |
| Ureta Cox                               |  3,6 |      0 % | San Joaquín, San Miguel                                                    |
