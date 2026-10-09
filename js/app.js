/* NoTengoCalle.com — juego para aprender la ciudad.
   Todo corre en el navegador; los datos vienen de data/data.js. */
(function(){
'use strict';
const D = window.DATA;

// ---------- utilidades ----------
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const pick = a => a[Math.floor(Math.random()*a.length)];
const KX = 92.9, KY = 111.2; // km por grado en Santiago
const km = (a, b) => Math.hypot((a[1]-b[1])*KX, (a[0]-b[0])*KY); // a,b = [lat,lon]
function distToPolyline(p, lines){ // p=[lat,lon], lines=[[[lat,lon],...],...] -> km
  let best = Infinity;
  for (const l of lines) for (let i=0;i<l.length-1;i++){
    const ax=(l[i][1]-p[1])*KX, ay=(l[i][0]-p[0])*KY, bx=(l[i+1][1]-p[1])*KX, by=(l[i+1][0]-p[0])*KY;
    const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
    let t = L ? -(ax*dx+ay*dy)/L : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax+t*dx, ay+t*dy); if (d<best) best=d;
  }
  return best;
}
const fmtKm = d => d < 1 ? Math.round(d*1000)+' m' : d.toFixed(1).replace('.',',')+' km';

// ---------- almacenamiento ----------
const store = {
  get(k, def){ try { const v = localStorage.getItem('ubicate:'+k); return v ? JSON.parse(v) : def; } catch(e){ return def; } },
  set(k, v){ try { localStorage.setItem('ubicate:'+k, JSON.stringify(v)); } catch(e){} }
};
const settings = Object.assign({ scope:'core', len:15, cats:null, strict:false, mly:'', lines:null, stCom:true, stMetro:false }, store.get('settings', {}));
settings.mly = '';
const saveSettings = () => store.set('settings', settings);
const stats = store.get('stats', {}); // key -> {n, ok, streak, last}
function record(key, ok){
  const s = stats[key] || (stats[key] = {n:0, ok:0, streak:0});
  s.n++; if (ok){ s.ok++; s.streak++; } else s.streak = 0;
  s.last = Date.now();
  store.set('stats', stats);
}
function weight(key){
  const s = stats[key];
  if (!s) return 2.5;
  const miss = 1 - s.ok/s.n;
  return Math.max(0.25, 1 + 4*miss + (s.streak===0 ? 1.5 : 0) - Math.min(s.streak,4)*0.3);
}
function weightedSample(items, keyFn, n, groupFn){
  // groupFn (opcional): agrupa ítems (ej. por comuna) para que ninguna comuna domine la ronda
  const cnt = {}; if (groupFn) for (const it of items){ const g = groupFn(it); cnt[g] = (cnt[g]||0) + 1; }
  const pool = items.map(it => ({it, w: weight(keyFn(it)) * (groupFn ? Math.min(1, 15 / cnt[groupFn(it)]) : 1)}));
  const out = [];
  while (out.length < n && pool.length){
    const tot = pool.reduce((s,p)=>s+p.w, 0); let r = Math.random()*tot, i = 0;
    for (; i<pool.length-1; i++){ r -= pool[i].w; if (r<=0) break; }
    out.push(pool[i].it); pool.splice(i,1);
  }
  return out;
}

// ---------- datos derivados ----------
const comunas = D.comunas.features;
const comunaByName = Object.fromEntries(comunas.map(f => [f.properties.name, f]));
const inScope = f => settings.scope==='all' || f.properties.group==='core' || (settings.scope==='peri' && f.properties.group==='peri');
const scopeComunas = () => comunas.filter(inScope);
{ // los barrios con perímetro se integran a los landmarks
  const ZMAP = {"Barrio República (barrio universitario)":"Barrio República","Barrio Franklin (persas)":"Barrio Franklin","El Golf / Sanhattan":"Barrio El Golf","Estadio Nacional (recinto)":"Estadio Nacional (selección chilena; hace de local la U. de Chile)","Barrio Cívico":"Barrio Cívico / Paseo Bulnes"};
  (D.zones||[]).forEach((z, i) => { const nm = ZMAP[z.name] || z.name; let l = D.landmarks.find(x => x.name === nm);
    if (!l){ l = {id:'z'+i, name:z.name, cat:'Barrios', desc:z.desc, lat:z.c[0], lon:z.c[1], comuna:z.comunas[0], alt:z.comunas.slice(1)}; D.landmarks.push(l); }
    l.zone = z; if (l.cat === 'Barrios') l.desc = z.desc; });
}
{ // los cerros más importantes pasan a ser landmarks (los urbanos clásicos ya estaban)
  const KEEP = ['Cerro El Plomo','Cerro Altar','Cerro La Parva','Cerro Colorado (Farellones)','Cerro Provincia','Cerro San Ramón','Alto del Naranjo','Cerro Alto de las Vizcachas','Morro Las Papas','Cerro Pochoco','Cerro El Morado','Cerro Manquehuito','Cerro El Carbón','Cerro Alvarado','Cerro Apoquindo','Cerro San Luis','Cerro Lo Aguirre'];
  for (const c of (D.cerros||[])) if (KEEP.includes(c.name)) D.landmarks.push({id:'k'+c.id, name:c.name, cat:'Cerros y parques', desc:(c.ele ? c.ele.toLocaleString('es-CL')+' m. ' : '')+c.desc, lat:c.lat, lon:c.lon, comuna:c.comuna, alt:c.alt||[], pk:'c:'+c.name, tol: c.tipo==='Cordillera' ? 3 : c.tipo==='Precordillera' ? 1.8 : 1});
}
for (const st of D.metro.stations) D.landmarks.push({id:'m:'+st.name, name:'Metro '+st.name, cat:'Metro', metro:st, lines:st.lines, desc:'Estación de la '+st.lines.map(l => l.replace('L','Línea ')).join(' y la ')+(st.lines.length > 1 ? ' (combinación).' : '.'), lat:st.lat, lon:st.lon, comuna:st.comuna, alt:st.alt||[], tol:0.8, obvious: st.name.toLowerCase().includes(st.comuna.toLowerCase())});
const lmById = Object.fromEntries(D.landmarks.map(l => [l.id, l]));
const LINES = D.metro.lines;
const LINE_IDS = ['L1','L2','L3','L4','L4A','L5','L6'];
const lineName = id => id.replace('L','Línea ');
const linePill = id => `<span class="lpill" style="background:${LINES[id].color}">${id.replace('L','L')}</span>`;
const stations = D.metro.stations;
const CATS = [...new Set(D.landmarks.map(l => l.cat))];
// --- calles agregadas por el usuario (guardadas en este navegador)
const myStreets = store.get('myStreets', []);
function ptInFeature(lat, lon, f){ const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys){ const r = poly[0]; let c = false;
    for (let i = 0, j = r.length-1; i < r.length; j = i++){ if ((r[i][1] > lat) !== (r[j][1] > lat) && lon < (r[j][0]-r[i][0]) * (lat-r[i][1]) / (r[j][1]-r[i][1]) + r[i][0]) c = !c; }
    if (c) return true; } return false; }
const comunasOfLines = lines => { const cnt = {}; for (const l of lines) for (let i = 0; i < l.length; i += 2){ const f = comunas.find(f => ptInFeature(l[i][0], l[i][1], f)); if (f) cnt[f.properties.name] = (cnt[f.properties.name]||0) + 1; }
  return Object.entries(cnt).sort((a,b) => b[1]-a[1]).map(x => x[0]); };
myStreets.forEach((m, i) => { if (D.streets.some(s => s.name === m.name)) return;
  D.streets.push({id:'u'+i, name:m.name, kind:'calle', custom:true, hint:'Calle agregada por ti.', km:m.km, comunas:m.comunas, cl:Object.fromEntries(m.comunas.map(c => [c, 1000])), lines:m.lines, nb:[]}); });
const streetBBox = s => { let a=90,b=180,c=-90,d=-180; for (const l of s.lines) for (const p of l){ a=Math.min(a,p[0]); c=Math.max(c,p[0]); b=Math.min(b,p[1]); d=Math.max(d,p[1]); } return [[a,b],[c,d]]; };
D.streets.forEach(s => { s.bb = streetBBox(s); s.mid = [(s.bb[0][0]+s.bb[1][0])/2, (s.bb[0][1]+s.bb[1][1])/2]; });
for (const s of D.streets) if (s.custom) s.nb = D.streets.filter(o => o !== s && o.kind !== 'agua' && o.kind !== 'tren').map(o => [o.name, km(s.mid, o.mid)]).sort((a,b) => a[1]-b[1]).slice(0, 12);
const streetByName = Object.fromEntries(D.streets.map(s => [s.name, s]));
const isRoad = s => !s.kind || s.kind==='calle' || s.kind==='autopista';
const ROADS = D.streets.filter(isRoad);
const QUIZ_STREETS = D.streets.filter(s => s.kind !== 'tren');
const TR_COLS = ['#2563eb','#db2777','#ea580c','#7c3aed','#0891b2','#ca8a04'];
function drawTramos(s, target=layer){ if (!s.tr) return; const seen = new Set();
  s.lines.forEach((l, k) => { const i = s.tr.i[k]; if (i < 0) return; L.polyline(l, {pane:'streets', color:TR_COLS[i % TR_COLS.length], weight:6, interactive:false}).addTo(target);
    if (!seen.has(i) && l.length > 3){ seen.add(i); L.tooltip({permanent:true, direction:'top', className:'lbl', offset:[0,-4]}).setLatLng(l[Math.floor(l.length/2)]).setContent(esc(s.tr.n[i][0])).addTo(target); } }); }
const tramosHtml = s => s.tr ? `<p><b>Cambia de nombre por tramos:</b></p><ul class="blist">${s.tr.n.map(([n, k], i) => `<li><span class="dot" style="background:${TR_COLS[i % TR_COLS.length]}"></span>${esc(n)} — ${String(k).replace('.',',')} km</li>`).join('')}</ul>` : '';
const KIND_Q = {calle:'¿Qué calle está marcada en azul?', autopista:'¿Qué autopista o carretera está marcada en azul?', agua:'¿Qué río o canal está marcado en azul?', tren:'¿Qué es lo que está marcado en azul?'};
const stByName = Object.fromEntries(D.metro.stations.map(s => [s.name, s]));
const cerros = D.cerros || [];
const PH = D.photos || {};
const paraSet = new Set((D.para||[]).map(p => p.join('|')));
const isPara = (a, b) => paraSet.has(a+'|'+b) || paraSet.has(b+'|'+a);
const crossingsOf = n => (D.inter||[]).filter(i => i.a===n || i.b===n).map(i => ({other: i.a===n ? i.b : i.a, i}));
const streetMidVertex = s => { const l = s.lines.reduce((a,b) => b.length>a.length ? b : a); return l[Math.floor(l.length/2)]; };

// ---------- mapa ----------
const map = L.map('map', { zoomControl:true, minZoom:9, maxZoom:18, maxBounds:[[-34.3,-71.8],[-32.8,-69.7]], maxBoundsViscosity:0.8, tap:true })
  .setView([-33.46,-70.64], 11);
map.attributionControl.setPrefix('');
// Mapa base: OpenFreeMap (vectorial, gratis y sin API key). Los nombres se ocultan durante los quizzes.
const ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
let curTiles = 'plain', glMap = null;
function applyLabels(){
  if (!glMap || !glMap.getStyle()) return;
  // 'labels' = todo; 'streets' = solo nombres de calles (sin localidades); 'plain' = sin nombres
  for (const l of glMap.getStyle().layers){ if (l.type!=='symbol') continue;
    const show = curTiles==='labels' || (curTiles==='streets' && !l.id.startsWith('label_'));
    const vis = show ? 'visible' : 'none';
    if (glMap.getLayoutProperty(l.id, 'visibility')!==vis) glMap.setLayoutProperty(l.id, 'visibility', vis); }
}
try {
  const gl = L.maplibreGL({ style:'https://tiles.openfreemap.org/styles/positron', attribution:ATTR }).addTo(map);
  glMap = gl.getMaplibreMap(); glMap.on('styledata', applyLabels);
} catch(e){
  // sin WebGL: mapa raster de OSM (siempre con nombres)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
}
function setTiles(kind){ curTiles = kind; applyLabels(); }
// Relieve (sombreado del terreno) con AWS Terrain Tiles — gratis, sin key
let reliefOn = false;
function applyRelief(){
  if (!glMap || !glMap.isStyleLoaded()) return;
  if (!glMap.getSource('dem')){
    glMap.addSource('dem', {type:'raster-dem', tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding:'terrarium', tileSize:256, maxzoom:13});
    const firstSym = (glMap.getStyle().layers.find(l => l.type==='symbol')||{}).id;
    glMap.addLayer({id:'relief', type:'hillshade', source:'dem', layout:{visibility:'none'}, paint:{'hillshade-exaggeration':0.55, 'hillshade-shadow-color':'#4b5d58', 'hillshade-highlight-color':'#ffffff'}}, firstSym);
  }
  const vis = reliefOn ? 'visible' : 'none';
  if (glMap.getLayoutProperty('relief','visibility')!==vis) glMap.setLayoutProperty('relief','visibility',vis);
}
if (glMap) glMap.on('load', applyRelief);
function setRelief(on){ reliefOn = on; applyRelief(); if (glMap && !glMap.isStyleLoaded()) glMap.once('idle', applyRelief); }
['comunas','streets','routes','metro','points'].forEach((p,i) => { map.createPane(p); map.getPane(p).style.zIndex = 410 + i*20; });
let layer = L.layerGroup().addTo(map);     // capa de la pregunta actual
const clearLayer = () => { layer.clearLayers(); map.off('click'); };

// "Ver nombres" (pista) – botón en el mapa
const HintCtl = L.Control.extend({ options:{position:'topleft'}, onAdd(){
  const b = L.DomUtil.create('button','maptoggle'); b.type='button'; b.textContent='👁 Ver nombres';
  L.DomEvent.disableClickPropagation(b);
  b.onclick = () => { if (!quiz) return; const on = curTiles==='plain'; setTiles(on?'labels':'plain'); b.textContent = on ? '🙈 Ocultar nombres' : '👁 Ver nombres'; if (on && quiz && !quiz.answered) quiz.hinted = true; };
  this._b = b; return b; },
  reset(){ if (this._b) this._b.textContent='👁 Ver nombres'; }
});
const hintCtl = new HintCtl();

function panelPad(){
  const p = $('#panel'); const mobile = innerWidth <= 760;
  if (p.classList.contains('hidden')) return {padding:[20,20]};
  return mobile ? {paddingTopLeft:[20,20], paddingBottomRight:[20, p.offsetHeight+16]}
                : {paddingTopLeft:[50,20], paddingBottomRight:[p.offsetWidth+30, 20]};
}
function fit(bounds, maxZoom=15){ map.fitBounds(bounds, Object.assign({maxZoom, animate:true}, panelPad())); }
// encuadre del área urbana (Lo Barnechea es enorme y achica todo si se usa su polígono completo)
function fitCity(){ fit(settings.scope==='core' ? L.latLngBounds([[-33.64,-70.82],[-33.33,-70.49]]) : boundsOfFeatures(scopeComunas()), 13); }
function boundsOfFeatures(fs){ return L.geoJSON({type:'FeatureCollection', features:fs}).getBounds(); }

const divIcon = (cls, html='', size=18) => L.divIcon({className:'', html:`<div class="${cls}">${html}</div>`, iconSize:[size,size], iconAnchor:[size/2,size/2]});
function label(latlng, text, cls='lbl'){ return L.tooltip({permanent:true, direction:'center', className:cls, interactive:false}).setLatLng(latlng).setContent(esc(text)); }

const COLORS = { base:'#94a3b8', fill:'#cbd5e1', hi:'#f59e0b', ok:'#16a34a', ok2:'#84cc16', mid:'#f59e0b', bad:'#dc2626', street:'#2563eb' };
function comunaLayer(features, {style, onClick, interactive=true}={}){
  return L.geoJSON({type:'FeatureCollection', features}, {
    pane:'comunas', interactive,
    style: f => Object.assign({color:'#ffffff', weight:1.5, fillColor:COLORS.fill, fillOpacity:.55}, style ? style(f) : {}),
    onEachFeature: (f, l) => { if (onClick) l.on('click', e => { L.DomEvent.stop(e); onClick(f, l, e); }); }
  });
}
function outlineComunas(fs){ return comunaLayer(fs, {interactive:false, style:()=>({color:'#64748b', weight:1, fillOpacity:0.04, fillColor:'#64748b', dashArray:'3 3'})}); }
function drawMetro(target, {dots=true, ids=LINE_IDS, weight=4, opacity=.9}={}){
  for (const id of ids){ const ln = LINES[id];
    L.polyline(ln.segs, {pane:'metro', color:ln.color, weight, opacity, interactive:false}).addTo(target); }
  if (dots) for (const s of stations) if (s.lines.some(l => ids.includes(l)))
    L.circleMarker([s.lat,s.lon], {pane:'metro', radius:3.5, color:'#fff', weight:1.5, fillColor:LINES[s.lines[0]].color, fillOpacity:1, interactive:false}).addTo(target);
}

// ---------- UI general ----------
const panel = $('#panel'), home = $('#home'), hud = $('#hud'), title = $('#title');
function toast(msg){ let t = $('.toast'); if (!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 1600); }
function showPanel(html){ panel.innerHTML = html; panel.classList.remove('hidden'); panel.scrollTop = 0; }
function hidePanel(){ panel.classList.add('hidden'); }

// ---------- motor del quiz ----------
let quiz = null;
/* Un modo define: id, group, name, desc, pool(), key(item), ask(item, q) */
// --- tiempos: se cuenta solo el tiempo de pensar cada pregunta (se pausa mientras lees la respuesta)
const fmtTime = ms => { const t = Math.round(ms/1000); return Math.floor(t/60) + ':' + String(t%60).padStart(2,'0'); };
const bests = store.get('best', {});
const quizMs = q => q.ms + (q.t0 && !q.answered ? Date.now() - q.t0 : 0);
function hudUpdate(){ const q = quiz; if (!q || q.mode.study){ return; } hud.textContent = `${q.ok}/${q.i + (q.answered ? 1 : 0)} ✓ · ⏱ ${fmtTime(quizMs(q))}`; }
let hudTimer = null;
function startQuiz(mode){
  const pool = mode.pool();
  if (!pool.length){ toast('No hay elementos con estos filtros'); return; }
  const n = mode.all ? pool.length : Math.min(settings.len, pool.length);
  quiz = { mode, items: weightedSample(pool, mode.key, n, mode.balance), i:0, ok:0, pts:0, ms:0, t0:0, misses:[], answered:false, hinted:false };
  clearInterval(hudTimer); hudTimer = setInterval(hudUpdate, 500);
  home.classList.add('hidden');
  title.textContent = mode.name;
  setTiles('plain'); if (mode.noHint) map.removeControl(hintCtl); else hintCtl.addTo(map); hintCtl.reset(); setRelief(!!mode.relief); setChile(!!mode.chile);
  if (mode.setup) mode.setup(quiz);
  if (mode.study){ map.removeControl(hintCtl); clearLayer(); setTiles('streets'); mode.ask(null, quiz); return; }
  nextQuestion(true);
}
function nextQuestion(first){
  const q = quiz; if (!first) q.i++;
  if (q.i >= q.items.length) return endQuiz();
  q.answered = false; q.hinted = false; setTiles('plain'); hintCtl.reset();
  panel.classList.toggle('tall', !!q.mode.tall);
  if (!q.mode.keepLayer) clearLayer();
  q.t0 = Date.now(); hudUpdate();
  q.mode.ask(q.items[q.i], q);
}
function qHead(q){ const pct = (q.i/q.items.length*100).toFixed(0);
  return `<div class="progress"><i style="width:${pct}%"></i></div><div class="q-head"><span>Pregunta ${q.i+1} de ${q.items.length}</span><span>${q.mode.group}</span></div>`; }
/* resultado: ok (bool), html de feedback, opcional points */
function answer(ok, html, {points=null, partial=false}={}){
  const q = quiz; if (q.answered) return; q.ms += Date.now() - q.t0; q.answered = true;
  const item = q.items[q.i];
  const counted = ok && !q.hinted;
  record(q.mode.id+':'+q.mode.key(item), counted);
  if (counted) q.ok++; else q.misses.push(q.mode.label ? q.mode.label(item) : q.mode.key(item));
  if (points!=null) q.pts += points;
  hudUpdate();
  const cls = ok ? 'ok' : (partial ? 'info' : 'bad');
  const head = ok ? (q.hinted ? '✅ Correcto (con pista, no suma)' : '✅ ¡Correcto!') : (partial ? '🟡 Cerca' : '❌ No');
  const fb = document.createElement('div'); fb.className = 'fb '+cls;
  fb.innerHTML = `<h4>${head}</h4>${html||''}<button class="btn next" id="btnNext">${q.i+1 < q.items.length ? 'Siguiente →' : 'Ver resultado'}</button>`;
  panel.appendChild(fb);
  $('#btnNext').onclick = () => nextQuestion();
  setTimeout(()=>{ fb.scrollIntoView({block:'nearest', behavior:'smooth'}); }, 30);
}
function endQuiz(){
  const q = quiz; clearLayer(); map.removeControl(hintCtl); setTiles('plain'); setRelief(false); panel.classList.remove('tall');
  const pct = Math.round(q.ok/q.items.length*100); clearInterval(hudTimer);
  const n = q.items.length, bk = q.mode.id + ':' + n, prev = bests[bk];
  const isBest = !prev || q.ok > prev.ok || (q.ok === prev.ok && q.ms < prev.ms);
  if (isBest){ bests[bk] = {ok:q.ok, ms:q.ms, d:Date.now()}; store.set('best', bests); }
  const timeHtml = `<p style="margin:2px 0">⏱ <b>${fmtTime(q.ms)}</b> <span class="muted">· ${(q.ms/n/1000).toFixed(1).replace('.',',')} s por pregunta</span></p>` +
    (isBest ? (prev ? `<p style="margin:2px 0">🏅 <b>¡Nuevo récord!</b> <span class="muted">Antes: ${prev.ok}/${n} en ${fmtTime(prev.ms)}</span></p>` : '<p class="muted" style="margin:2px 0">Primera marca en rondas de '+n+' preguntas.</p>')
            : `<p class="muted" style="margin:2px 0">Tu récord en rondas de ${n}: ${prev.ok}/${n} en ${fmtTime(prev.ms)}</p>`);
  const msg = pct>=90 ? '¡Te la sabes! 🏆' : pct>=70 ? 'Muy bien 👏' : pct>=40 ? 'Vas mejorando 💪' : 'A seguir practicando 🗺️';
  showPanel(`<h3 style="margin:0 0 4px">${msg}</h3>
    <p style="font-size:28px;margin:4px 0;font-weight:700">${q.ok} / ${q.items.length} <span class="muted" style="font-size:16px">(${pct}%)</span></p>
    ${timeHtml}
    ${q.pts ? `<p class="muted">Puntaje: ${Math.round(q.pts)}</p>`:''}
    ${q.misses.length ? `<p class="muted" style="margin-bottom:4px">Para repasar:</p><p style="margin-top:0">${q.misses.map(esc).join(' · ')}</p>`:''}
    <div class="row" style="margin-top:12px"><button class="btn" id="again">Otra ronda</button><button class="btn sec" id="menu">Menú</button></div>
    <p class="muted" style="font-size:12px;margin-top:10px">Las preguntas que fallas aparecen más seguido en las próximas rondas.</p>`);
  hud.textContent = '';
  $('#again').onclick = () => startQuiz(q.mode);
  $('#menu').onclick = goHome;
  quiz = null;
}
/* opciones de alternativa: opts=[{label, value}], correct=value; onPick(value)->(ok, html) */
function renderOptions(opts, correct, onPick, {one=false}={}){
  const box = document.createElement('div'); box.className = 'opts' + (one ? ' one':'');
  opts.forEach((o, idx) => {
    const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = `<span class="k">${idx+1}</span> ${o.label}`;
    b.onclick = () => {
      if (quiz.answered) return;
      box.querySelectorAll('.opt').forEach((x, j) => { x.disabled = true; if (opts[j].value===correct) x.classList.add('ok'); });
      if (o.value !== correct) b.classList.add('bad');
      onPick(o.value);
    };
    box.appendChild(b);
  });
  panel.appendChild(box);
}
document.addEventListener('keydown', e => {
  if (!quiz || e.target.tagName==='INPUT') return;
  if (/^[1-9]$/.test(e.key)){ const b = panel.querySelectorAll('.opt')[+e.key-1]; if (b && !b.disabled) b.click(); }
  if (e.key==='Enter'){ const n = $('#btnNext'); if (n) { e.preventDefault(); n.click(); } else { const c = $('#btnConfirm'); if (c && !c.disabled) c.click(); } }
});

// ---------- distractores ----------
function nearestBy(items, ref, posFn, n, exclude){
  return items.filter(x => !exclude(x)).map(x => ({x, d: km(ref, posFn(x))})).sort((a,b)=>a.d-b.d).slice(0, n).map(o => o.x);
}
function comunaDistractors(name, n=3){
  const f = comunaByName[name]; const sc = scopeComunas().map(c=>c.properties.name);
  let nb = shuffle(f.properties.nb.filter(x => sc.includes(x)));
  const lab = f.properties.lab; // [lon,lat]
  if (nb.length < n){ const more = nearestBy(scopeComunas(), [lab[1],lab[0]], c => [c.properties.lab[1], c.properties.lab[0]], 8, c => c.properties.name===name || nb.includes(c.properties.name)).map(c=>c.properties.name); nb = nb.concat(shuffle(more)); }
  return nb.slice(0, n);
}

// ---------- fotos ----------
const credit = p => p.px ? `Foto: ${esc(p.a)} · ${esc(p.l || 'CC BY-SA 4.0')} · <a href="https://api.panoramax.xyz/#focus=pic&pic=${encodeURIComponent(p.px)}" target="_blank" rel="noopener">Panoramax</a>` : `Foto: ${esc(p.a)}${p.l ? ' · '+esc(p.l) : ''} · <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.f)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
function photoHtml(key, {start=0, big=false}={}){
  const ps = PH[key]; if (!ps || !ps.length) return '';
  const i = start % ps.length;
  return `<div class="ph${big?' big':''}" data-key="${esc(key)}" data-i="${i}">
    <img src="${ps[i].u}" alt="" loading="lazy" onclick="__phZoom(this)">
    ${ps.length>1 ? `<button type="button" class="phnav prev" onclick="__phNav(this,-1)" aria-label="Foto anterior">‹</button><button type="button" class="phnav next" onclick="__phNav(this,1)" aria-label="Foto siguiente">›</button><span class="phcount">${i+1}/${ps.length}</span>` : ''}
    <div class="cred">${credit(ps[i])}</div></div>`;
}
window.__phNav = (btn, d) => { const box = btn.closest('.ph'), ps = PH[box.dataset.key]; const i = (+box.dataset.i + d + ps.length) % ps.length;
  box.dataset.i = i; box.querySelector('img').src = ps[i].u; box.querySelector('.cred').innerHTML = credit(ps[i]); box.querySelector('.phcount').textContent = `${i+1}/${ps.length}`; };
window.__phZoom = img => { const o = document.createElement('div'); o.className = 'lightbox'; o.innerHTML = `<img src="${img.src}" alt="">`; o.onclick = () => o.remove(); document.body.appendChild(o); };

// Mapillary (opcional, con token gratuito): fotos a nivel de calle
async function mapillaryNear(lat, lon, r=0.0005){
  if (!settings.mly) return null;
  const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(settings.mly)}&fields=id,thumb_1024_url,captured_at&bbox=${lon-r},${lat-r},${lon+r},${lat+r}&limit=20`;
  try { const j = await (await fetch(url)).json(); const d = (j.data||[]).filter(x => x.thumb_1024_url); return d.length ? pick(d) : null; } catch(e){ return null; }
}
async function mapillaryOnStreet(s, tries=5){
  const pts = s.lines.flat().filter(p => p[0] > -33.65 && p[0] < -33.3 && p[1] > -70.85 && p[1] < -70.45);
  for (let t=0; t<tries && pts.length; t++){ const p = pick(pts); const img = await mapillaryNear(p[0], p[1]); if (img) return Object.assign(img, {at:p}); }
  return null;
}
const mlyHtml = img => `<div class="ph"><img src="${img.thumb_1024_url}" alt="" onclick="__phZoom(this)"><div class="cred">Foto: Mapillary (CC BY-SA)${img.captured_at ? ' · '+new Date(img.captured_at).getFullYear() : ''} · <a href="https://www.mapillary.com/app/?pKey=${img.id}" target="_blank" rel="noopener">ver en Mapillary</a></div></div>`;
async function loadMly(s){
  const box = panel.querySelector(`.mly[data-street="${CSS.escape(s.name)}"]`); if (!box || !settings.mly) return;
  box.innerHTML = '<p class="muted" style="font-size:12.5px">Buscando foto a nivel de calle…</p>';
  const img = await mapillaryOnStreet(s);
  box.innerHTML = img ? `<p class="muted" style="font-size:12.5px;margin:6px 0 2px">Así se ve (Mapillary):</p>${mlyHtml(img)}` : '';
  if (img) L.circleMarker(img.at, {pane:'points', radius:6, color:'#fff', weight:2, fillColor:'#05cb63', fillOpacity:1}).addTo(layer).bindTooltip('📷 foto');
}

// selección múltiple: opts=[{label,value}], correct=[values]; onDone(selected[])
function renderMulti(opts, correct, onDone){
  const box = document.createElement('div'); box.className = 'opts one'; const sel = new Set();
  opts.forEach((o, idx) => { const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = `<span class="k">${idx+1}</span> ${o.label}`;
    b.onclick = () => { if (quiz.answered) return; sel.has(o.value) ? sel.delete(o.value) : sel.add(o.value); b.classList.toggle('sel'); $('#btnConfirm').disabled = !sel.size; };
    box.appendChild(b); });
  panel.appendChild(box);
  const row = document.createElement('div'); row.className = 'row end'; row.style.marginTop = '10px';
  row.innerHTML = `<span class="muted" style="font-size:12.5px;margin-right:auto">Puede haber una o varias correctas</span><button class="btn" id="btnConfirm" disabled>Confirmar</button>`; panel.appendChild(row);
  $('#btnConfirm').onclick = () => {
    if (quiz.answered) return;
    box.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; const v = opts[j].value, c = correct.includes(v);
      b.classList.remove('sel'); if (c && sel.has(v)) b.classList.add('ok'); else if (c) b.classList.add('miss'); else if (sel.has(v)) b.classList.add('bad'); });
    row.remove(); onDone([...sel]);
  };
}
const sameSet = (a, b) => a.length===b.length && a.every(x => b.includes(x));

// ---------- MODOS ----------
const MODES = [];
const scopeTxt = () => ({core:'Gran Santiago (34)', peri:'Gran Santiago + periferia', all:'Toda la RM'})[settings.scope];

// --- Comunas: encontrar en el mapa
MODES.push({ id:'com-find', group:'Comunas', name:'Encuentra la comuna', desc:'Te digo el nombre, tú la tocas en el mapa.',
  pool: () => scopeComunas(), key: f => f.properties.name,
  setup(){ fitCity(); },
  ask(f, q){
    showPanel(qHead(q) + `<div class="q-prompt">Toca la comuna: <b>${esc(f.properties.name)}</b></div><div class="q-sub">Tip: haz zoom si las comunas son chicas.</div>`);
    let tries = 0;
    const lay = comunaLayer(scopeComunas(), { onClick: (g, l) => {
      if (q.answered) return;
      const ok = g.properties.name === f.properties.name;
      if (ok){ l.setStyle({fillColor: tries ? COLORS.mid : COLORS.ok, fillOpacity:.8}); label(l.getBounds().getCenter(), g.properties.name, 'lbl big ok').addTo(layer); }
      else { l.setStyle({fillColor:COLORS.bad, fillOpacity:.7}); label([g.properties.lab[1], g.properties.lab[0]], g.properties.name, 'lbl bad').addTo(layer);
        lay.eachLayer(x => { if (x.feature.properties.name===f.properties.name) x.setStyle({fillColor:COLORS.hi, fillOpacity:.85, weight:3, color:'#92400e'}); });
        label([f.properties.lab[1], f.properties.lab[0]], f.properties.name, 'lbl big').addTo(layer); }
      answer(ok, ok ? '' : `<p>Tocaste <b>${esc(g.properties.name)}</b>. ${esc(f.properties.name)} está marcada en naranjo.</p>`);
    }}).addTo(layer);
  }
});

// --- Comunas: ¿qué comuna es?
MODES.push({ id:'com-name', group:'Comunas', name:'¿Qué comuna es?', desc:'Te marco una comuna y eliges su nombre.',
  pool: () => scopeComunas(), key: f => f.properties.name,
  ask(f, q){
    const name = f.properties.name;
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué comuna está marcada en naranjo?</div>`);
    comunaLayer(scopeComunas(), { interactive:false, style: g => g===f ? {fillColor:COLORS.hi, fillOpacity:.85, weight:3, color:'#92400e'} : {} }).addTo(layer);
    const nbs = f.properties.nb.map(n => comunaByName[n]).filter(Boolean).filter(inScope);
    fit(boundsOfFeatures([f]).pad(f.properties.km2 > 150 ? 0.3 : 1.2), 13);
    const opts = shuffle([name, ...comunaDistractors(name)]).map(v => ({label:esc(v), value:v}));
    renderOptions(opts, name, v => {
      label([f.properties.lab[1], f.properties.lab[0]], name, 'lbl big').addTo(layer);
      nbs.forEach(n => label([n.properties.lab[1], n.properties.lab[0]], n.properties.name).addTo(layer));
      answer(v===name, `<p>Es <b>${esc(name)}</b>. Limita con: ${f.properties.nb.map(esc).join(', ')}.</p>`);
    });
  }
});

// --- Comunas: completar el mapa
MODES.push({ id:'com-all', group:'Comunas', name:'Completa el mapa', desc:'Todas las comunas, una por una, hasta pintar el mapa entero.', all:true, keepLayer:true,
  pool: () => scopeComunas(), key: f => f.properties.name,
  setup(q){
    clearLayer(); q.state = {}; q.tries = 0;
    q.lay = comunaLayer(scopeComunas(), { onClick: (g, l) => this.click(g, l) }).addTo(layer);
    fitCity();
  },
  ask(f, q){
    q.tries = 0;
    showPanel(qHead(q) + `<div class="q-prompt">Toca: <b>${esc(f.properties.name)}</b></div><div class="q-sub">Verde = a la primera · amarillo = 2º intento · naranjo = 3º · rojo = no la encontraste</div>`);
  },
  click(g, l){
    const q = quiz; if (!q || q.answered) return;
    const f = q.items[q.i]; const name = f.properties.name;
    if (q.state[g.properties.name]) { toast(g.properties.name + ' (ya respondida)'); return; }
    if (g.properties.name === name){
      const col = [COLORS.ok, COLORS.ok2, COLORS.mid][q.tries];
      l.setStyle({fillColor: col, fillOpacity:.85}); q.state[name] = true;
      label([g.properties.lab[1], g.properties.lab[0]], name).addTo(layer);
      answer(q.tries===0, q.tries ? `<p>Encontrada al intento ${q.tries+1}.</p>` : '', {partial:q.tries>0});
    } else {
      q.tries++; toast('Esa es ' + g.properties.name);
      const tl = label([g.properties.lab[1], g.properties.lab[0]], g.properties.name, 'lbl bad').addTo(layer); setTimeout(()=>layer.removeLayer(tl), 1500);
      if (q.tries >= 3){
        q.lay.eachLayer(x => { if (x.feature.properties.name===name){ x.setStyle({fillColor:COLORS.bad, fillOpacity:.8}); } });
        q.state[name] = true; label([f.properties.lab[1], f.properties.lab[0]], name, 'lbl bad').addTo(layer);
        answer(false, `<p>Está marcada en rojo.</p>`);
      }
    }
  }
});

// --- Landmarks
const lmPool = () => D.landmarks.filter(l => (!settings.cats || settings.cats.includes(l.cat)) && (!l.metro || l.lines.some(x => selLines().includes(x))));
const lmInfo = l => `<p><b>${esc(l.name)}</b>${l.metro ? ' ' + l.lines.map(linePill).join('') : ''} — ${esc(l.comuna)}${l.alt&&l.alt.length?' / '+l.alt.map(esc).join(' / '):''}</p><p class="muted">${esc(l.desc||'')}</p>${l.zone ? zoneLine(l.zone) : ''}${l.car ? `<p><b>Qué se estudia:</b> ${esc(l.car)}</p>` : ''}${photoHtml(l.pk || 'l:'+l.name)}`;
function showNearLm(l, max=8){
  const c = D.landmarks.filter(x => x !== l && !x.metro).map(x => ({x, d: km([l.lat, l.lon], [x.lat, x.lon])})).filter(o => o.d <= 1.5).sort((a,b) => a.d - b.d);
  const out = []; for (const o of c){ if (out.length >= max) break; if (o.d > 0.12 && out.every(y => km([y.lat, y.lon], [o.x.lat, o.x.lon]) > 0.25)) out.push(o.x); }
  for (const x of out) L.marker([x.lat, x.lon], {icon:L.divIcon({className:'', html:`<div class="emo">${CAT_EMOJI[x.cat] || '📍'}</div>`, iconSize:[26,26], iconAnchor:[13,13]}), pane:'points', interactive:false}).addTo(layer)
    .bindTooltip(esc(x.name), {permanent:true, direction:'right', offset:[12,0], className:'lbl'});
}
function zoneLine(z){ return (z.streets.length ? `<p><b>${z.axis ? 'Su eje:' : 'Lo rodean:'}</b> ${z.streets.map(esc).join(' · ')}</p>` : '') + (z.approx ? '<p class="muted" style="font-size:12.5px">Zona aproximada: este sector no tiene límites oficiales.</p>' : ''); }
function showZone(l){ if (l.metro) drawMetro(layer, {ids:l.lines, dots:false, opacity:.7}); if (!l.zone) return; L.polygon(l.zone.poly, {pane:'comunas', color:'#b45309', weight:3, dashArray: l.zone.approx ? '6 6' : null, fillColor:COLORS.hi, fillOpacity:.25, interactive:false}).addTo(layer); setTiles('streets'); }
MODES.push({ id:'lm-loc', balance: l => l.comuna, group:'Landmarks', name:'Ubícalo en el mapa', desc:'Toca dónde crees que está el lugar. Cuenta como correcto a menos de 1,5 km.', cats:true,
  pool: lmPool, key: l => l.name, label: l => l.name,
  ask(l, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Dónde está <b>${esc(l.name)}</b>?</div><div class="q-sub">${esc(l.cat)} · toca el mapa</div>`);
    outlineComunas(scopeComunas()).addTo(layer);
    if (q.i===0) fitCity();
    map.on('click', e => {
      if (q.answered) return;
      const you = [e.latlng.lat, e.latlng.lng], ans = [l.lat, l.lon], d = km(you, ans);
      const lim = l.tol || (settings.strict ? 0.8 : 1.5), ok = d <= lim || !!(l.zone && inPoly(you, l.zone.poly)); showZone(l); showNearLm(l);
      L.marker(you, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.marker(ans, {icon:divIcon('pin '+(ok?'good':'ans')), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
      L.polyline([you, ans], {pane:'routes', color:'#334155', dashArray:'5 6', weight:2}).addTo(layer);
      fit(L.latLngBounds([you, ans]).pad(0.3), 15);
      const pts = Math.max(0, Math.round(100*(1 - d/6)));
      answer(ok, `<p>Quedaste a <b>${fmtKm(d)}</b> (+${pts} pts).</p>${lmInfo(l)}`, {points:pts, partial: !ok && d<=3});
    });
  }
});
MODES.push({ id:'lm-com', balance: l => l.comuna, group:'Landmarks', name:'¿En qué comuna está?', desc:'Toca la comuna donde queda el lugar.', cats:true,
  pool: () => lmPool().filter(l => !l.obvious), key: l => l.name, label: l => l.name,
  ask(l, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿En qué comuna está <b>${esc(l.name)}</b>?</div><div class="q-sub">${esc(l.cat)} · toca la comuna</div>`);
    const fs = comunas.filter(f => inScope(f) || f.properties.name===l.comuna);
    if (q.i===0) fitCity();
    comunaLayer(fs, { onClick: (g, lay) => {
      if (q.answered) return;
      const ok = g.properties.name===l.comuna || (l.alt||[]).includes(g.properties.name);
      lay.setStyle({fillColor: ok?COLORS.ok:COLORS.bad, fillOpacity:.75});
      label([g.properties.lab[1], g.properties.lab[0]], g.properties.name, 'lbl '+(ok?'ok':'bad')).addTo(layer);
      if (!ok){ const c = comunaByName[l.comuna]; if (c) label([c.properties.lab[1], c.properties.lab[0]], c.properties.name, 'lbl big').addTo(layer); }
      L.marker([l.lat,l.lon], {icon:divIcon('pin good'), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
      showZone(l); showNearLm(l); answer(ok, lmInfo(l));
    }}).addTo(layer);
  }
});

// --- Calles
// alternativas: calles realmente cercanas (precalculado en s.nb), con más peso a las más próximas
function streetDistractors(s, n=3){
  if (s.kind==='agua') return shuffle(D.streets.filter(x => x.kind==='agua' && x!==s)).slice(0, n);
  const pool = (s.nb||[]).filter(([nm]) => streetByName[nm] && isRoad(streetByName[nm])).slice(0, 8).map(([nm], i) => ({x: streetByName[nm], w: 8-i}));
  const out = [];
  while (out.length < n && pool.length){ const tot = pool.reduce((a,o)=>a+o.w, 0); let r = Math.random()*tot, i = 0;
    for (; i<pool.length-1; i++){ r -= pool[i].w; if (r<=0) break; } out.push(pool[i].x); pool.splice(i,1); }
  return out;
}
function drawStreet(s, color, {weight=5, labelText=null, target=layer}={}){
  L.polyline(s.lines, {pane:'streets', color:'#fff', weight:weight+4, opacity:.9, interactive:false}).addTo(target);
  L.polyline(s.lines, {pane:'streets', color, weight, interactive:false}).addTo(target);
  if (labelText) L.tooltip({permanent:true, direction:'top', className:'lbl', offset:[0,-4]}).setLatLng(streetMidVertex(s)).setContent(esc(labelText)).addTo(target);
}
// contexto opcional en los juegos de calles: bordes de comunas y líneas de metro
let stCtx = null;
function stContext(){
  if (stCtx) layer.removeLayer(stCtx); stCtx = L.layerGroup().addTo(layer);
  if (settings.stCom) outlineComunas(comunas.filter(f=>f.properties.group!=='rural')).addTo(stCtx);
  if (settings.stMetro) drawMetro(stCtx, {dots:false, weight:3, opacity:.55});
}
function stChips(){
  const box = document.createElement('div'); box.className = 'chips'; box.style.margin = '0 0 8px';
  box.innerHTML = [['stCom','Bordes de comunas'],['stMetro','Líneas de metro']].map(([k,t]) => `<label class="chip ${settings[k]?'on':''}"><input type="checkbox" data-k="${k}" ${settings[k]?'checked':''}>${t}</label>`).join('');
  box.querySelectorAll('input').forEach(inp => inp.onchange = () => { settings[inp.dataset.k] = inp.checked; inp.parentElement.classList.toggle('on', inp.checked); saveSettings(); stContext(); });
  const pr = panel.querySelector('.q-prompt'); pr.parentNode.insertBefore(box, pr.nextSibling); stContext();
}
// confusiones entre calles (para el modo "¿Cuál de estas es…?")
const confs = store.get('conf', {});
const confKey = (a, b) => [a, b].sort().join('|');
function noteConf(a, b){ if (!a || !b || a === b) return; const k = confKey(a, b); confs[k] = (confs[k]||0) + 1; store.set('conf', confs); }
const confOf = n => Object.entries(confs).filter(([k]) => k.split('|').includes(n)).map(([k, c]) => [k.split('|').find(x => x !== n) || n, c]).filter(([o]) => streetByName[o]);
// lugares conocidos junto a una calle (se muestran al responder en los juegos de calles)
const CAT_EMOJI = {'Universidades':'🎓','Colegios':'🏫','Salud':'🏥','Cerros y parques':'🌳','Deporte':'🏟️','Malls y edificios':'🏬','Barrios':'🏘️','Cultura':'🎭','Transporte':'🚉','Restaurantes y bares':'🍽️','Gobierno y justicia':'🏛️','Religión':'🛐','Metro':'🚇','Centro histórico':'🏛️'};
function nearbyLandmarks(s, max=8){
  const c = D.landmarks.filter(l => !l.metro).map(l => ({l, d: distToPolyline([l.lat, l.lon], s.lines)})).filter(o => o.d <= 0.5).sort((a,b) => a.d - b.d);
  const out = []; for (const o of c){ if (out.length >= max) break; if (out.every(x => km([x.lat, x.lon], [o.l.lat, o.l.lon]) > 0.3)) out.push(o.l); }
  return out;
}
function showNearby(s){
  const ls = nearbyLandmarks(s);
  for (const l of ls) L.marker([l.lat, l.lon], {icon:L.divIcon({className:'', html:`<div class="emo">${CAT_EMOJI[l.cat] || '📍'}</div>`, iconSize:[26,26], iconAnchor:[13,13]}), pane:'points', interactive:false}).addTo(layer)
    .bindTooltip(esc(l.name), {permanent:true, direction:'right', offset:[12,0], className:'lbl'});
  return ls.length ? `<p><b>En esta calle:</b> ${ls.map(l => `${CAT_EMOJI[l.cat] || '📍'} ${esc(l.name)}`).join(' · ')}</p>` : '';
}
MODES.push({ id:'st-name', noHint:true, group:'Calles', name:'¿Qué calle es?', desc:'Te marco una avenida o autopista; eliges el nombre.',
  pool: () => QUIZ_STREETS, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">${KIND_Q[s.kind||'calle']}</div>`);
    stChips();
    drawStreet(s, COLORS.street);
    fit(L.latLngBounds(s.bb).pad(0.25), 14);
    const opts = shuffle([s, ...streetDistractors(s, 3)]).map(x => ({label:esc(x.name), value:x.name}));
    renderOptions(opts, s.name, v => {
      for (const c of s.comunas){ const f = comunaByName[c]; if (f) label([f.properties.lab[1], f.properties.lab[0]], c).addTo(layer); }
      let extra = ''; setTiles('labels'); noteConf(s.name, v);
      if (v !== s.name){ const w = streetByName[v]; drawStreet(w, COLORS.bad, {labelText: w.name}); drawStreet(s, COLORS.ok, {labelText: s.name});
        fit(L.latLngBounds(s.bb).extend(L.latLngBounds(w.bb)).pad(0.1), 14);
        extra = `<p>En <span style="color:${COLORS.bad};font-weight:700">rojo</span> la que elegiste (${esc(w.name)}); en <span style="color:${COLORS.ok};font-weight:700">verde</span> la correcta.</p>`; }
      drawTramos(s); const nearHtml = showNearby(s);
      answer(v===s.name, `${extra}<p><b>${esc(s.name)}</b></p><p class="muted">${esc(s.hint)}</p>${tramosHtml(s)}${nearHtml}<p class="muted">Pasa por: ${s.comunas.map(esc).join(', ')}</p>${photoHtml('s:'+s.name)}<div class="mly" data-street="${esc(s.name)}"></div>`);
      loadMly(s);
    }, {one:true});
  }
});
MODES.push({ id:'st-find', noHint:true, group:'Calles', name:'Encuentra la calle', desc:'Toca cualquier punto de la calle que te pido (margen 400 m).',
  pool: () => QUIZ_STREETS, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">Toca cualquier punto de: <b>${esc(s.name)}</b></div>`);
    stChips();
    if (q.i===0) fitCity();
    map.on('click', e => {
      if (q.answered) return;
      const p = [e.latlng.lat, e.latlng.lng]; const d = distToPolyline(p, s.lines); const ok = d <= 0.4;
      L.marker(p, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.polyline(s.lines, {pane:'streets', color:'#fff', weight:9, opacity:.9}).addTo(layer);
      L.polyline(s.lines, {pane:'streets', color: ok?COLORS.ok:COLORS.street, weight:5}).addTo(layer);
      let near = null, nd = Infinity;
      for (const o of D.streets){ const dd = distToPolyline(p, o.lines); if (dd < nd){ nd = dd; near = o; } }
      setTiles('labels'); if (!ok && near && nd < 0.4) noteConf(s.name, near.name);
      if (!ok) fit(L.latLngBounds(s.bb).extend(p).pad(0.15), 14);
      const extra = (!ok && near && near!==s && nd < 0.4) ? `<p>Tocaste cerca de <b>${esc(near.name)}</b>.</p>` : '';
      drawTramos(s); const nearHtml = showNearby(s);
      answer(ok, `${ok?'':`<p>Quedaste a ${fmtKm(d)} de la calle.</p>`}${extra}<p class="muted">${esc(s.hint)}</p>${tramosHtml(s)}${nearHtml}${photoHtml('s:'+s.name)}`);
    });
  }
});

MODES.push({ id:'st-conf', noHint:true, group:'Calles', name:'¿Cuál de estas es…?', desc:'Varias calles cercanas marcadas en colores: elige cuál es la que te pido. Prioriza las que has confundido antes.',
  pool: () => ROADS.filter(s => (s.nb||[]).filter(([n]) => streetByName[n] && isRoad(streetByName[n])).length >= 3), key: s => s.name,
  ask(s, q){
    // rivales: primero las que has confundido con esta, luego las más cercanas
    const cf = confOf(s.name).sort((a,b) => b[1]-a[1]).map(([n]) => n).filter(n => isRoad(streetByName[n]));
    const nb = s.nb.map(([n]) => n).filter(n => streetByName[n] && isRoad(streetByName[n]) && !isPara(n, s.name));
    const rivals = [...new Set([...cf.slice(0, 2), ...shuffle(nb.slice(0, 5))])].slice(0, 3).map(n => streetByName[n]);
    const all = shuffle([s, ...rivals]); const COL = ['#2563eb','#db2777','#ea580c','#16a34a']; const LET = ['A','B','C','D'];
    showPanel(qHead(q) + `<div class="q-prompt">¿Cuál de estas es <b>${esc(s.name)}</b>?</div>`);
    stChips();
    fit(L.latLngBounds(s.bb).extend(L.latLngBounds(rivals.flatMap(r => r.bb))).pad(0.08), 15);
    const box = document.createElement('div'); box.className = 'opts';
    const pickIt = k => { if (q.answered || box.dataset.done) return; box.dataset.done = '1'; const ch = all[k], ok = ch === s;
      box.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (all[j] === s) b.classList.add('ok'); else if (j === k) b.classList.add('bad'); b.innerHTML = `<span class="lpill" style="background:${COL[j]}">${LET[j]}</span> ${esc(all[j].name)}`; });
      setTiles('labels'); if (!ok) noteConf(s.name, ch.name);
      all.forEach((x, j) => L.tooltip({permanent:true, direction:'top', className:'lbl' + (x === s ? ' big' : ''), offset:[0,-4]}).setLatLng(streetMidVertex(x)).setContent(`${LET[j]}: ${esc(x.name)}`).addTo(layer));
      answer(ok, `<p><b>${esc(s.name)}</b> es la ${LET[all.indexOf(s)]}.${ok ? '' : ` Elegiste ${esc(ch.name)}.`}</p><p class="muted">${esc(s.hint)}</p>${tramosHtml(s)}${photoHtml('s:'+s.name)}`); };
    all.forEach((x, j) => {
      L.polyline(x.lines, {pane:'streets', color:'#fff', weight:9, opacity:.9, interactive:false}).addTo(layer);
      L.polyline(x.lines, {pane:'streets', color:COL[j], weight:5, interactive:false}).addTo(layer);
      L.polyline(x.lines, {pane:'streets', color:COL[j], weight:22, opacity:0}).addTo(layer).on('click', e => { L.DomEvent.stop(e); pickIt(j); });
      L.marker(streetMidVertex(x), {icon:L.divIcon({className:'', html:`<div class="pin a" style="background:${COL[j]}">${LET[j]}</div>`, iconSize:[28,28], iconAnchor:[14,14]}), pane:'points', interactive:false}).addTo(layer);
      const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = `<span class="lpill" style="background:${COL[j]}">${LET[j]}</span> la ${['azul','rosada','naranja','verde'][j]}`; b.onclick = () => pickIt(j); box.appendChild(b); });
    panel.appendChild(box);
  }
});
// --- Ruteo
function routeOptions(r){
  const A = lmById[r.from], B = lmById[r.to], key = s => s.join(' → ');
  const cands = D.routes.filter(o => o!==r).map(o => {
    const oa = lmById[o.from], ob = lmById[o.to];
    const d1 = km([A.lat,A.lon],[oa.lat,oa.lon]) + km([B.lat,B.lon],[ob.lat,ob.lon]);
    const d2 = km([A.lat,A.lon],[ob.lat,ob.lon]) + km([B.lat,B.lon],[oa.lat,oa.lon]);
    return d2 < d1 ? {seq:o.streets.slice().reverse(), d:d2} : {seq:o.streets.slice(), d:d1};
  }).sort((a,b) => a.d-b.d);
  const correct = key(r.streets), used = new Set([correct]), sameSet = s => s.slice().sort().join('|')===r.streets.slice().sort().join('|');
  const out = [];
  // 1) una mutación: cambiar una calle de la ruta correcta por otra calle cercana
  const pool = [...new Set(cands.slice(0,10).flatMap(c => c.seq))].filter(x => !r.streets.includes(x));
  if (pool.length){ const m = r.streets.slice(); m[Math.floor(Math.random()*m.length)] = pick(pool); if (!used.has(key(m)) && !sameSet(m)){ used.add(key(m)); out.push(m); } }
  // 2) rutas parecidas (orígenes/destinos cercanos)
  for (const c of cands.slice(0, 14)){ if (out.length>=3) break; const k = key(c.seq); if (!used.has(k) && !sameSet(c.seq) && Math.random()<0.75){ used.add(k); out.push(c.seq); } }
  for (const c of cands){ if (out.length>=3) break; const k = key(c.seq); if (!used.has(k) && !sameSet(c.seq)){ used.add(k); out.push(c.seq); } }
  return shuffle([r.streets, ...out]).map(s => ({label:esc(key(s)), value:key(s)}));
}
MODES.push({ id:'route', group:'Ruteo', name:'¿Cómo llego?', desc:'Dos puntos en el mapa: elige qué calles principales tomarías en auto.',
  pool: () => D.routes, key: r => lmById[r.from].name+' → '+lmById[r.to].name, label: r => lmById[r.from].name+' → '+lmById[r.to].name,
  ask(r, q){
    const A = lmById[r.from], B = lmById[r.to];
    showPanel(qHead(q) + `<div class="q-prompt">De <b style="color:#2563eb">A: ${esc(A.name)}</b> a <b style="color:#db2777">B: ${esc(B.name)}</b></div><div class="q-sub">${esc(A.comuna)} → ${esc(B.comuna)} · ¿qué calles principales usarías? (en orden)</div>`);
    outlineComunas(comunas.filter(f=>f.properties.group!=='rural')).addTo(layer);
    L.marker([A.lat,A.lon], {icon:divIcon('pin a','A',28), pane:'points'}).addTo(layer);
    L.marker([B.lat,B.lon], {icon:divIcon('pin b','B',28), pane:'points'}).addTo(layer);
    fit(L.latLngBounds([[A.lat,A.lon],[B.lat,B.lon]]).pad(0.25), 14);
    const correct = r.streets.join(' → ');
    renderOptions(routeOptions(r), correct, v => {
      L.polyline(r.geom, {pane:'routes', color:'#fff', weight:8, opacity:.9}).addTo(layer);
      L.polyline(r.geom, {pane:'routes', color:'#7c3aed', weight:5}).addTo(layer);
      // dibujar también las calles conocidas de la ruta, si están en el set de calles
      setTiles('labels');
      answer(v===correct, `<p>Ruta sugerida (~${String(r.km).replace('.',',')} km, ~${r.min} min sin taco):</p><p><b>${esc(correct)}</b></p><p class="muted" style="font-size:12.5px">Ruta calculada por OSRM; hay otras alternativas válidas, esto es solo para orientarte.</p>`);
    }, {one:true});
  }
});

// --- Metro
const selLines = () => settings.lines && settings.lines.length ? settings.lines : LINE_IDS;
const metroPool = () => stations.filter(s => s.lines.some(l => selLines().includes(l)));
const stLabel = s => `${s.name} ${s.lines.map(linePill).join('')}`;
const comTxt = o => esc(o.comuna||'') + ((o.alt||[]).length ? ' / '+o.alt.map(esc).join(' / ') : '');
MODES.push({ id:'mt-line', group:'Metro', name:'¿En qué línea está?', desc:'Elige la(s) línea(s) de la estación. Las combinaciones tienen dos.',
  pool: metroPool, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿En qué línea(s) está la estación <b>${esc(s.name)}</b>?</div><div class="q-sub">Marca todas las que correspondan y confirma.</div>`);
    outlineComunas(scopeComunas()).addTo(layer);
    L.marker([s.lat,s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer);
    if (q.i===0) fit(L.latLngBounds(stations.map(x=>[x.lat,x.lon])).pad(0.05), 13);
    const box = document.createElement('div'); box.className = 'linebtns'; const sel = new Set();
    LINE_IDS.forEach(id => { const b = document.createElement('button'); b.className='linebtn'; b.style.background = LINES[id].color; b.textContent = id; b.dataset.id = id;
      b.onclick = () => { if (q.answered) return; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('sel'); $('#btnConfirm').disabled = !sel.size; };
      box.appendChild(b); });
    panel.appendChild(box);
    const row = document.createElement('div'); row.className='row end'; row.style.marginTop='10px';
    row.innerHTML = `<button class="btn" id="btnConfirm" disabled>Confirmar</button>`; panel.appendChild(row);
    $('#btnConfirm').onclick = () => {
      if (q.answered) return;
      const ok = sel.size===s.lines.length && s.lines.every(l => sel.has(l));
      box.querySelectorAll('.linebtn').forEach(b => { const id = b.dataset.id; if (s.lines.includes(id)) b.classList.add('ok'); else if (sel.has(id)) b.classList.add('bad'); });
      row.remove();
      drawMetro(layer, {ids:s.lines});
      L.marker([s.lat,s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(s.name), {permanent:true, direction:'top', offset:[0,-12]});
      answer(ok, `<p>${stLabel(s)} — comuna de <b>${comTxt(s)}</b>.</p>`);
    };
  }
});
MODES.push({ id:'mt-com', group:'Metro', name:'¿En qué comuna está la estación?', desc:'Toca la comuna donde queda la estación.',
  pool: metroPool, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿En qué comuna está la estación <b>${esc(s.name)}</b> ${s.lines.map(linePill).join('')}?</div><div class="q-sub">Toca la comuna</div>`);
    if (q.i===0) fitCity();
    comunaLayer(comunas.filter(f => inScope(f) || f.properties.name===s.comuna), { onClick: (g, l) => {
      if (q.answered) return;
      const ok = g.properties.name===s.comuna || (s.alt||[]).includes(g.properties.name);
      l.setStyle({fillColor: ok?COLORS.ok:COLORS.bad, fillOpacity:.75});
      label([g.properties.lab[1], g.properties.lab[0]], g.properties.name, 'lbl '+(ok?'ok':'bad')).addTo(layer);
      if (!ok){ const c = comunaByName[s.comuna]; label([c.properties.lab[1], c.properties.lab[0]], c.properties.name, 'lbl big').addTo(layer); }
      drawMetro(layer, {ids:s.lines, dots:false, opacity:.6});
      L.marker([s.lat,s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(s.name), {permanent:true, direction:'top', offset:[0,-12]});
      answer(ok, `<p>${stLabel(s)} está en <b>${esc(s.comuna)}</b>${(s.alt||[]).length ? ', justo en el límite con '+s.alt.map(esc).join(' y ')+' (cualquiera vale)' : ''}.</p>`);
    }}).addTo(layer);
  }
});
MODES.push({ id:'mt-which', group:'Metro', name:'¿Qué estación es?', desc:'Te marco una estación en la red; eliges cuál es.',
  pool: metroPool, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué estación está marcada?</div>`);
    outlineComunas(scopeComunas()).addTo(layer);
    drawMetro(layer, {ids: selLines()});
    L.marker([s.lat,s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer);
    fit(L.latLng(s.lat,s.lon).toBounds(3500), 14);
    // distractores: vecinas en la misma línea + cercanas
    const ln = LINES[s.lines.find(l => selLines().includes(l)) || s.lines[0]], idx = ln.stations.indexOf(s.name);
    const sameLine = [idx-1, idx+1, idx-2, idx+2].map(k => ln.stations[k]).filter(Boolean);
    const near = nearestBy(metroPool(), [s.lat,s.lon], x => [x.lat,x.lon], 6, x => x===s).map(x=>x.name);
    const ds = [...new Set(shuffle(sameLine.slice(0,3)).concat(near))].filter(n => n!==s.name).slice(0,3);
    const opts = shuffle([s.name, ...ds]).map(n => ({label:esc(n), value:n}));
    renderOptions(opts, s.name, v => {
      const byName = Object.fromEntries(stations.map(x=>[x.name,x]));
      for (const o of opts){ const st = byName[o.value]; L.tooltip({permanent:true, direction:'right', offset:[8,0], className:'lbl'+(st===s?' big':'')}).setLatLng([st.lat,st.lon]).setContent(esc(st.name)).addTo(layer); }
      answer(v===s.name, `<p>${stLabel(s)} — ${esc(s.comuna)}.</p>`);
    });
  }
});
MODES.push({ id:'mt-loc', group:'Metro', name:'Ubica la estación', desc:'Con las líneas dibujadas (sin estaciones), toca dónde está. Margen 800 m.',
  pool: metroPool, key: s => s.name,
  ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">Toca dónde está la estación <b>${esc(s.name)}</b></div><div class="q-sub">Las líneas están dibujadas, pero sin estaciones ni colores de ayuda.</div>`);
    outlineComunas(scopeComunas()).addTo(layer);
    for (const id of selLines()) L.polyline(LINES[id].segs, {pane:'metro', color:'#475569', weight:3, opacity:.7, interactive:false}).addTo(layer);
    if (q.i===0) fit(L.latLngBounds(stations.map(x=>[x.lat,x.lon])).pad(0.05), 13);
    map.on('click', e => {
      if (q.answered) return;
      const you = [e.latlng.lat, e.latlng.lng], d = km(you, [s.lat,s.lon]), ok = d <= 0.8;
      drawMetro(layer, {ids:s.lines});
      L.marker(you, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.marker([s.lat,s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(s.name), {permanent:true, direction:'top', offset:[0,-12]});
      L.polyline([you,[s.lat,s.lon]], {pane:'routes', color:'#334155', dashArray:'5 6', weight:2}).addTo(layer);
      answer(ok, `<p>Quedaste a <b>${fmtKm(d)}</b>.</p><p>${stLabel(s)} — ${esc(s.comuna)}.</p>`, {partial:!ok && d<=1.6});
    });
  }
});

// --- Cerros
const cerroTol = c => c.tipo==='Cordillera' ? 3 : c.tipo==='Precordillera' ? 1.8 : 1;
const cerroInfo = c => `<p><b>${esc(c.name)}</b>${c.ele ? ` · ${c.ele.toLocaleString('es-CL')} m` : ''} · ${esc(c.tipo)} · ${comTxt(c)}</p><p class="muted">${esc(c.desc)}</p>${photoHtml('c:'+c.name)}`;
const triIcon = (cls='') => L.divIcon({className:'', html:`<div class="tri ${cls}"></div>`, iconSize:[18,16], iconAnchor:[9,14]});
const fitCerros = () => fit(L.latLngBounds(cerros.map(c => [c.lat, c.lon])).pad(0.03), 12);
MODES.push({ id:'ce-loc', group:'Cerros', name:'Ubica el cerro', desc:'Con el relieve a la vista, toca dónde está el cerro.', relief:true,
  pool: () => cerros, key: c => c.name,
  ask(c, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Dónde está el <b>${esc(c.name)}</b>?</div><div class="q-sub">${esc(c.tipo)}${c.ele ? ' · '+c.ele.toLocaleString('es-CL')+' m' : ''} · margen ${String(cerroTol(c)).replace('.',',')} km</div>`);
    outlineComunas(comunas.filter(f => f.properties.group!=='rural' || ['Lo Barnechea','San José de Maipo'].includes(f.properties.name))).addTo(layer);
    if (q.i===0) fitCerros();
    map.on('click', e => {
      if (q.answered) return;
      const you = [e.latlng.lat, e.latlng.lng], ans = [c.lat, c.lon], d = km(you, ans), ok = d <= cerroTol(c);
      L.marker(you, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.marker(ans, {icon:triIcon(ok?'ok':'bad'), pane:'points'}).addTo(layer).bindTooltip(esc(c.name), {permanent:true, direction:'top', offset:[0,-12]});
      L.polyline([you, ans], {pane:'routes', color:'#334155', dashArray:'5 6', weight:2}).addTo(layer);
      answer(ok, `<p>Quedaste a <b>${fmtKm(d)}</b>.</p>${cerroInfo(c)}`, {partial: !ok && d <= cerroTol(c)*2.5});
    });
  }
});
MODES.push({ id:'ce-name', group:'Cerros', name:'¿Qué cerro es?', desc:'Te marco un cerro sobre el relieve; eliges cuál es.', relief:true,
  pool: () => cerros, key: c => c.name,
  ask(c, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué cerro está marcado?</div>`);
    outlineComunas(comunas.filter(f => f.properties.group!=='rural' || ['Lo Barnechea','San José de Maipo'].includes(f.properties.name))).addTo(layer);
    L.marker([c.lat, c.lon], {icon:triIcon('hi'), pane:'points'}).addTo(layer);
    map.setView([c.lat, c.lon], c.tipo==='Cordillera' ? 10 : 11);
    const ds = nearestBy(cerros, [c.lat, c.lon], x => [x.lat, x.lon], 5, x => x===c);
    const opts = shuffle([c, ...shuffle(ds).slice(0,3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), c.name, v => {
      for (const o of opts) L.marker([o.lat, o.lon], {icon:triIcon(o===c?'ok':(o.name===v?'bad':'')), pane:'points'}).addTo(layer).bindTooltip(esc(o.name), {permanent:true, direction:'top', offset:[0,-12]});
      fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.2), 12);
      answer(v===c.name, cerroInfo(c));
    });
  }
});
MODES.push({ id:'ce-photo', tall:true, group:'Cerros', name:'¿Qué cerro es? (foto)', desc:'Te muestro una foto del cerro; eliges cuál es.', relief:true,
  pool: () => cerros.filter(c => PH['c:'+c.name]), key: c => c.name,
  ask(c, q){
    const ps = PH['c:'+c.name];
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué cerro es este?</div>${photoHtml('c:'+c.name, {start: Math.floor(Math.random()*ps.length), big:true})}`);
    const ds = nearestBy(cerros, [c.lat, c.lon], x => [x.lat, x.lon], 6, x => x===c);
    const opts = shuffle([c, ...shuffle(ds).slice(0,3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), c.name, v => {
      for (const o of opts) L.marker([o.lat, o.lon], {icon:triIcon(o===c?'ok':(o.name===v?'bad':'')), pane:'points'}).addTo(layer).bindTooltip(esc(o.name), {permanent:true, direction:'top', offset:[0,-12]});
      fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.2), 12);
      answer(v===c.name, `<p><b>${esc(c.name)}</b>${c.ele ? ` · ${c.ele.toLocaleString('es-CL')} m` : ''} · ${esc(c.comuna||'')}</p><p class="muted">${esc(c.desc)}</p>`);
    });
  }
});

// --- Fotos
MODES.push({ id:'ph-lm', tall:true, balance: l => l.comuna, group:'Fotos', name:'¿Qué lugar es?', desc:'Te muestro una foto de un landmark; eliges cuál es.', cats:true,
  pool: () => lmPool().filter(l => PH['l:'+l.name]), key: l => l.name, label: l => l.name,
  ask(l, q){
    const ps = PH['l:'+l.name];
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué lugar es este?</div>${photoHtml('l:'+l.name, {start: Math.floor(Math.random()*ps.length), big:true})}`);
    // alternativas: mismo tipo de lugar, preferentemente cercanos
    const same = D.landmarks.filter(x => x!==l && x.cat===l.cat);
    const ds = shuffle(nearestBy(same.length>=3 ? same : D.landmarks, [l.lat, l.lon], x => [x.lat, x.lon], 6, x => x===l)).slice(0,3);
    const opts = shuffle([l, ...ds]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), l.name, v => {
      for (const o of opts) L.marker([o.lat, o.lon], {icon:divIcon('pin '+(o===l?'good':(o.name===v?'ans':'you'))), pane:'points'}).addTo(layer).bindTooltip(esc(o.name), {permanent:true, direction:'top', offset:[0,-10]});
      fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.25), 15);
      answer(v===l.name, `<p><b>${esc(l.name)}</b> — ${esc(l.comuna)}</p><p class="muted">${esc(l.desc||'')}</p>`);
    }, {one:true});
  }
});
MODES.push({ id:'ph-st', tall:true, group:'Fotos', name:'¿Qué calle es?', desc:'Foto de una calle o avenida; eliges cuál es. Con token de Mapillary hay fotos de todas.',
  pool: () => D.streets.filter(s => settings.mly || PH['s:'+s.name]), key: s => s.name,
  async ask(s, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué calle es esta?</div><div id="phq"><p class="muted">Cargando foto…</p></div>`);
    const myI = q.i;
    let html = '', at = null;
    const useMly = settings.mly && (!PH['s:'+s.name] || Math.random() < 0.6);
    if (useMly){ const img = await mapillaryOnStreet(s, 6); if (img){ html = mlyHtml(img); at = img.at; } }
    if (!html && PH['s:'+s.name]) html = photoHtml('s:'+s.name, {start: Math.floor(Math.random()*PH['s:'+s.name].length), big:true});
    if (quiz!==q || q.i!==myI) return;
    if (!html){ $('#phq').innerHTML = '<p class="muted">No encontré foto para esta calle; pasemos a la siguiente.</p>'; q.items.splice(q.i, 1); setTimeout(() => nextQuestion(true), 900); return; }
    $('#phq').innerHTML = html;
    const opts = shuffle([s, ...streetDistractors(s, 3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), s.name, v => {
      if (v!==s.name) drawStreet(streetByName[v], COLORS.bad, {labelText:v});
      drawStreet(s, COLORS.ok, {labelText:s.name});
      if (at) L.circleMarker(at, {pane:'points', radius:7, color:'#fff', weight:2, fillColor:'#05cb63', fillOpacity:1}).addTo(layer).bindTooltip('📷 aquí se tomó la foto');
      fit(L.latLngBounds(s.bb).pad(0.15), 14);
      answer(v===s.name, `<p><b>${esc(s.name)}</b></p><p class="muted">${esc(s.hint)}</p>`);
    }, {one:true});
  }
});

// --- Conexiones: preguntas que relacionan comunas, calles, lugares, metro y cerros
const labOf = f => [f.properties.lab[1], f.properties.lab[0]];
const coreComunas = () => scopeComunas().filter(f => f.properties.group!=='rural');
const lmInCom = (l, c) => l.comuna===c || (l.alt||[]).includes(c);
const opt = (v, label) => ({label: label || esc(v), value: v});
function hiComuna(f, color=COLORS.hi){ comunaLayer([f], {interactive:false, style:()=>({fillColor:color, fillOpacity:.25, color:'#92400e', weight:2})}).addTo(layer); label(labOf(f), f.properties.name, 'lbl big').addTo(layer); }
const GEN = {
  roundabout(){
    const R = pick(D.rotondas||[]); if (!R) return null;
    const near = ROADS.filter(s => !R.streets.some(n => n.replace(/^Av\. /,'') === s.name.replace(/^Av\. /,'').replace(/\s*\(.*\)/,'')) && distToPolyline(R.c, s.lines) > 0.25 && distToPolyline(R.c, s.lines) < 2.5).map(s => s.name);
    if (near.length < 2) return null;
    const cor = shuffle(R.streets).slice(0, Math.min(3, R.streets.length)); const ds = shuffle(near).slice(0, 5 - cor.length);
    return { key:'rotonda:'+R.name, prompt:`¿Qué calles llegan a la <b>${esc(R.name)}</b>?`, sub:'Es la rotonda marcada en el mapa.', multi:true,
      opts: shuffle([...cor, ...ds]).map(n => opt(n)), correct: cor,
      pre(){ L.marker(R.c, {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer); map.setView(R.c, 14); },
      reveal(sel){ setTiles('streets'); L.marker(R.c, {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(R.name), {permanent:true, direction:'top', offset:[0,-12]});
        for (const n of sel.filter(x => !cor.includes(x))){ const s = streetByName[n]; if (s) drawStreet(s, COLORS.bad, {weight:3, labelText:n}); }
        for (const n of R.streets){ const s = streetByName[n]; if (s) drawStreet(s, COLORS.ok, {weight:4}); }
        map.setView(R.c, 15); return `<p>A la <b>${esc(R.name)}</b> llegan: ${R.streets.map(esc).join(', ')}.</p>`; } };
  },
  metroStreets(){
    const L0 = pick(LINE_IDS.filter(id => (D.metroAlong[id]||[]).length)); const al = D.metroAlong[L0]; const cor = al.map(x => x[0]);
    const no = ROADS.filter(s => !cor.includes(s.name) && LINES[L0].segs.some(seg => seg.some((p, i) => i % 8 === 0 && distToPolyline(p, s.lines) < 1.5))).map(s => s.name);
    if (no.length < 2) return null;
    const c = shuffle(cor).slice(0, Math.min(3, cor.length)); const ds = shuffle(no).slice(0, 5 - c.length);
    return { key:'metro-calles:'+L0, prompt:`¿Por (sobre o bajo) cuáles de estas calles corre la ${linePill(L0)} <b>${lineName(L0)}</b>?`, multi:true,
      opts: shuffle([...c, ...ds]).map(n => opt(n)), correct: c,
      reveal(sel){ for (const n of ds) if (sel.includes(n)) drawStreet(streetByName[n], COLORS.bad, {weight:3, labelText:n});
        for (const [n] of al) drawStreet(streetByName[n], COLORS.ok, {weight:7, labelText:n});
        drawMetro(layer, {ids:[L0]}); fit(L.latLngBounds(LINES[L0].segs.flat()).pad(0.05), 13);
        return `<p>La ${lineName(L0)} va principalmente por: ${al.map(([n, k]) => `<b>${esc(n)}</b> (${String(k).replace('.',',')} km)`).join(', ')}.</p>`; } };
  },
  streetsInComuna(){
    const C = pick(coreComunas()); const c = C.properties.name;
    const yes = ROADS.filter(s => (s.cl[c]||0) >= 300);
    const no = ROADS.filter(s => !s.cl[c] && distToPolyline(labOf(C), s.lines) < 3.5);
    if (!yes.length || no.length < 2) return null;
    const k = 1 + Math.floor(Math.random()*Math.min(3, yes.length)); const cor = shuffle(yes).slice(0, k); const ds = shuffle(no).slice(0, 5-k);
    return { key:'calles-comuna:'+c, prompt:`¿Cuáles de estas calles pasan por <b>${esc(c)}</b>?`, multi:true,
      opts: shuffle([...cor, ...ds]).map(s => opt(s.name)), correct: cor.map(s => s.name),
      reveal(sel){ hiComuna(C); for (const s of [...cor, ...ds]){ const isC = cor.includes(s); drawStreet(s, isC ? COLORS.ok : (sel.includes(s.name) ? COLORS.bad : '#94a3b8'), {weight: isC ? 5 : 3, labelText: s.name}); }
        fit(boundsOfFeatures([C]).pad(0.4), 14); return `<p>Pasan por ${esc(c)}: <b>${cor.map(s => esc(s.name)).join(', ')}</b>.</p>`; } };
  },
  crossings(){
    const X = pick(ROADS.filter(s => crossingsOf(s.name).length >= 2));
    const cr = crossingsOf(X.name).filter(o => streetByName[o.other] && isRoad(streetByName[o.other])); const crN = cr.map(o => o.other);
    const no = (X.nb||[]).map(([n]) => n).filter(n => n!==X.name && !crN.includes(n) && !isPara(n, X.name)).slice(0, 8);
    if (no.length < 2) return null;
    const k = 1 + Math.floor(Math.random()*Math.min(3, crN.length)); const cor = shuffle(crN).slice(0, k); const ds = shuffle(no).slice(0, 5-k);
    return { key:'cruces:'+X.name, prompt:`¿Cuáles de estas calles se cruzan con <b>${esc(X.name)}</b>?`, sub:'Cuenta también si una termina en la otra.', multi:true,
      opts: shuffle([...cor, ...ds]).map(n => opt(n)), correct: cor,
      pre(){ drawStreet(X, COLORS.hi, {weight:6}); fit(L.latLngBounds(X.bb).pad(0.2), 14); },
      reveal(sel){ for (const n of [...cor, ...ds]){ const s = streetByName[n], isC = cor.includes(n); drawStreet(s, isC ? COLORS.ok : (sel.includes(n) ? COLORS.bad : '#94a3b8'), {weight: isC ? 5 : 3, labelText:n}); }
        for (const o of cr.filter(o => cor.includes(o.other))) for (const p of o.i.pts) L.circleMarker(p, {pane:'points', radius:6, color:'#fff', weight:2, fillColor:COLORS.ok, fillOpacity:1}).addTo(layer).bindTooltip(`${esc(X.name)} × ${esc(o.other)} (${esc(o.i.comunas.join(' / '))})`);
        return `<p><b>${esc(X.name)}</b> se cruza con: ${cr.map(o => esc(o.other)).join(', ')}.</p>`; } };
  },
  nearestStreet(){
    const l = pick(D.landmarks.filter(l => l.ns && l.ns[0][1] <= 0.4 && l.ns[1][1] - l.ns[0][1] >= 0.35)); if (!l) return null;
    const corr = l.ns[0][0];
    const far = ROADS.filter(s => { const d = distToPolyline([l.lat, l.lon], s.lines); return d > 1.2 && d < 6; });
    if (far.length < 3) return null; const ds = shuffle(far).slice(0, 3).map(s => s.name);
    return { key:'calle-cerca:'+l.name, prompt:`¿Qué calle importante pasa más cerca de <b>${esc(l.name)}</b>?`, opts: shuffle([corr, ...ds]).map(n => opt(n)), correct: corr,
      reveal(v){ L.marker([l.lat, l.lon], {icon:divIcon('pin good'), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
        drawStreet(streetByName[corr], COLORS.ok, {labelText:corr}); if (v!==corr) drawStreet(streetByName[v], COLORS.bad, {labelText:v});
        fit(L.latLngBounds([[l.lat, l.lon]]).extend(L.latLngBounds(streetByName[v].bb)).pad(0.1), 15); return `<p>${esc(l.name)} está a ${fmtKm(l.ns[0][1])} de <b>${esc(corr)}</b>.</p>${lmInfo(l)}`; } };
  },
  nearestStation(){
    const l = pick(D.landmarks.filter(l => l.nm && l.nm[0][1] <= 1.2 && l.nm[1][1] - l.nm[0][1] >= 0.3)); if (!l) return null;
    const corr = l.nm[0][0];
    const far = stations.filter(s => { const d = km([l.lat, l.lon], [s.lat, s.lon]); return d > 2.5 && d < 8; });
    const ds = shuffle(far).slice(0, 3).map(s => s.name);
    return { key:'metro-cerca:'+l.name, prompt:`¿Cuál es la estación de metro más cercana a <b>${esc(l.name)}</b>?`, opts: shuffle([corr, ...ds]).map(n => opt(n, `${esc(n)} ${stByName[n].lines.map(linePill).join('')}`)), correct: corr,
      reveal(v){ L.marker([l.lat, l.lon], {icon:divIcon('pin good'), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
        for (const n of [corr, v]){ const s = stByName[n]; L.marker([s.lat, s.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(n), {permanent:true, direction:'right', offset:[10,0]}); }
        drawMetro(layer, {ids: stByName[corr].lines, dots:false, opacity:.6});
        fit(L.latLngBounds([[l.lat, l.lon], [stByName[corr].lat, stByName[corr].lon], [stByName[v].lat, stByName[v].lon]]).pad(0.2), 15);
        return `<p>La más cercana es <b>${esc(corr)}</b> ${stByName[corr].lines.map(linePill).join('')}, a ${fmtKm(l.nm[0][1])}.</p>`; } };
  },
  crossComuna(){
    const I = pick((D.inter||[]).filter(i => isRoad(streetByName[i.a]) && isRoad(streetByName[i.b]) && i.pts.length===1 && i.comunas.length===1 && comunaByName[i.comunas[0]] && inScope(comunaByName[i.comunas[0]]))); if (!I) return null;
    const c = I.comunas[0]; const ds = comunaDistractors(c, 3);
    return { key:'cruce-comuna:'+I.a+'×'+I.b, prompt:`¿En qué comuna se cruzan <b>${esc(I.a)}</b> y <b>${esc(I.b)}</b>?`, opts: shuffle([c, ...ds]).map(n => opt(n)), correct: c,
      reveal(v){ drawStreet(streetByName[I.a], COLORS.street, {labelText:I.a}); drawStreet(streetByName[I.b], '#7c3aed', {labelText:I.b});
        L.circleMarker(I.pts[0], {pane:'points', radius:8, color:'#fff', weight:2, fillColor:COLORS.hi, fillOpacity:1}).addTo(layer);
        hiComuna(comunaByName[c]); fit(L.latLng(I.pts[0]).toBounds(4000), 14); return `<p>Se cruzan en <b>${esc(c)}</b>.</p>`; } };
  },
  landmarksInComuna(){
    const C = pick(coreComunas()); const c = C.properties.name;
    const yes = D.landmarks.filter(l => lmInCom(l, c) && !l.obvious); const nbs = C.properties.nb;
    const no = D.landmarks.filter(l => !lmInCom(l, c) && nbs.includes(l.comuna) && !(l.alt||[]).length && !l.obvious);
    if (!yes.length || no.length < 2) return null;
    const k = 1 + Math.floor(Math.random()*Math.min(3, yes.length)); const cor = shuffle(yes).slice(0, k); const ds = shuffle(no).slice(0, 5-k);
    return { key:'lugares-comuna:'+c, prompt:`¿Cuáles de estos lugares están en <b>${esc(c)}</b>?`, multi:true,
      opts: shuffle([...cor, ...ds]).map(l => opt(l.name)), correct: cor.map(l => l.name),
      reveal(sel){ hiComuna(C); for (const l of [...cor, ...ds]){ const isC = cor.includes(l); L.marker([l.lat, l.lon], {icon:divIcon('pin '+(isC?'good':(sel.includes(l.name)?'ans':'you'))), pane:'points'}).addTo(layer).bindTooltip(`${esc(l.name)} (${esc(l.comuna)})`, {permanent:true, direction:'top', offset:[0,-10]}); }
        fit(boundsOfFeatures([C]).extend(L.latLngBounds([...cor, ...ds].map(l => [l.lat, l.lon]))).pad(0.1), 14);
        return `<p>En ${esc(c)}: <b>${cor.map(l => esc(l.name)).join(', ')}</b>. Los otros están en: ${ds.map(l => esc(l.name)+' ('+esc(l.comuna)+')').join(', ')}.</p>`; } };
  },
  comunaNeighbors(){
    const C = pick(coreComunas()); const c = C.properties.name; const sc = scopeComunas().map(f => f.properties.name);
    const nb = C.properties.nb.filter(n => sc.includes(n));
    const ring2 = [...new Set(nb.flatMap(n => comunaByName[n].properties.nb))].filter(n => n!==c && !nb.includes(n) && sc.includes(n));
    if (nb.length < 2 || ring2.length < 2) return null;
    const k = 2 + Math.floor(Math.random()*Math.min(2, nb.length-1)); const cor = shuffle(nb).slice(0, k); const ds = shuffle(ring2).slice(0, Math.max(2, 5-k));
    return { key:'limites:'+c, prompt:`¿Cuáles de estas comunas limitan con <b>${esc(c)}</b>?`, multi:true,
      opts: shuffle([...cor, ...ds]).map(n => opt(n)), correct: cor,
      reveal(sel){ comunaLayer(scopeComunas(), {interactive:false, style: f => { const n = f.properties.name;
          return n===c ? {fillColor:COLORS.hi, fillOpacity:.85} : nb.includes(n) ? {fillColor:COLORS.ok, fillOpacity:.55} : sel.includes(n) ? {fillColor:COLORS.bad, fillOpacity:.6} : {fillOpacity:.25}; }}).addTo(layer);
        for (const n of [c, ...nb, ...ds]) label(labOf(comunaByName[n]), n).addTo(layer);
        fit(boundsOfFeatures([C, ...nb.map(n => comunaByName[n])]), 13); return `<p>${esc(c)} limita con: <b>${nb.map(esc).join(', ')}</b>.</p>`; } };
  },
  linesInComuna(){
    const inC = (s, c) => s.comuna===c || (s.alt||[]).includes(c);
    const withSt = coreComunas().filter(f => stations.some(s => inC(s, f.properties.name))); const C = pick(withSt); const c = C.properties.name;
    const sts = stations.filter(s => inC(s, c)); const cor = [...new Set(sts.flatMap(s => s.lines))];
    return { key:'lineas-comuna:'+c, prompt:`¿Qué líneas de metro tienen estaciones en <b>${esc(c)}</b>?`, multi:true,
      opts: LINE_IDS.map(id => opt(id, `${linePill(id)} ${lineName(id)}`)), correct: cor,
      reveal(){ hiComuna(C); drawMetro(layer, {ids:cor, dots:false, opacity:.7});
        for (const s of sts) L.circleMarker([s.lat, s.lon], {pane:'points', radius:5, color:'#fff', weight:2, fillColor:LINES[s.lines[0]].color, fillOpacity:1}).addTo(layer).bindTooltip(esc(s.name), {permanent:true, direction:'right', offset:[6,0], className:'lbl'});
        fit(boundsOfFeatures([C]).pad(0.2), 14); return `<p>Estaciones en ${esc(c)}: ${sts.map(s => esc(s.name)+' '+s.lines.map(linePill).join('')).join(', ')}.</p>`; } };
  },
  extreme(){
    const dirs = [['norte', l => l.lat], ['sur', l => -l.lat], ['oriente', l => l.lon], ['poniente', l => -l.lon]];
    const [dn, f] = pick(dirs); const KM = dn==='norte'||dn==='sur' ? KY : KX;
    const pool = shuffle(D.landmarks.filter(l => comunaByName[l.comuna] && comunaByName[l.comuna].properties.group==='core'));
    const ch = []; for (const l of pool){ if (ch.every(x => x.comuna!==l.comuna)) ch.push(l); if (ch.length===4) break; }
    const sorted = ch.slice().sort((a,b) => f(b)-f(a)); if ((f(sorted[0]) - f(sorted[1]))*KM < 1.5) return null;
    return { key:'extremo:'+dn+':'+sorted[0].name, prompt:`¿Cuál de estos lugares está más al <b>${dn}</b>?`, opts: shuffle(ch).map(l => opt(l.name)), correct: sorted[0].name,
      reveal(v){ for (const l of ch) L.marker([l.lat, l.lon], {icon:divIcon('pin '+(l===sorted[0]?'good':(l.name===v?'ans':'you'))), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
        fit(L.latLngBounds(ch.map(l => [l.lat, l.lon])).pad(0.2), 14); return `<p>El más al ${dn} es <b>${esc(sorted[0].name)}</b> (${esc(sorted[0].comuna)}).</p>`; } };
  },
  stationStreet(){
    const st = pick(stations.filter(s => s.ns && s.ns[0][1] <= 0.15 && s.ns[1][1] >= 0.35)); if (!st) return null;
    const corr = st.ns[0][0];
    const far = ROADS.filter(s => { const d = distToPolyline([st.lat, st.lon], s.lines); return d > 1 && d < 5; });
    if (far.length < 3) return null; const ds = shuffle(far).slice(0, 3).map(s => s.name);
    return { key:'estacion-calle:'+st.name, prompt:`¿Sobre (o junto a) qué calle está la estación <b>${esc(st.name)}</b> ${st.lines.map(linePill).join('')}?`, opts: shuffle([corr, ...ds]).map(n => opt(n)), correct: corr,
      reveal(v){ drawStreet(streetByName[corr], COLORS.ok, {labelText:corr}); if (v!==corr) drawStreet(streetByName[v], COLORS.bad, {labelText:v});
        L.marker([st.lat, st.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer).bindTooltip(esc(st.name), {permanent:true, direction:'right', offset:[10,0]});
        fit(L.latLngBounds([[st.lat, st.lon]]).extend(L.latLngBounds(streetByName[v].bb)).pad(0.1), 15); return `<p>${esc(st.name)} está sobre <b>${esc(corr)}</b> (${esc(st.comuna)}).</p>`; } };
  },
  nearestCerro(){
    const urb = cerros.filter(c => c.tipo==='Cerros islas'); const l = pick(D.landmarks);
    const ds = urb.map(c => ({c, d: km([l.lat, l.lon], [c.lat, c.lon])})).sort((a,b) => a.d-b.d);
    if (ds[0].d > 5 || ds[1].d - ds[0].d < 1.5) return null;
    const corr = ds[0].c.name; const others = shuffle(ds.slice(3, 12)).slice(0, 3).map(o => o.c.name);
    return { key:'cerro-cerca:'+l.name, prompt:`¿Qué cerro queda más cerca de <b>${esc(l.name)}</b>?`, opts: shuffle([corr, ...others]).map(n => opt(n)), correct: corr,
      reveal(v){ L.marker([l.lat, l.lon], {icon:divIcon('pin good'), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-10]});
        for (const n of new Set([corr, v])){ const c = cerros.find(x => x.name===n); L.marker([c.lat, c.lon], {icon:triIcon(n===corr?'ok':'bad'), pane:'points'}).addTo(layer).bindTooltip(esc(n), {permanent:true, direction:'top', offset:[0,-12]}); }
        const cs = cerros.filter(x => x.name===corr || x.name===v);
        fit(L.latLngBounds([[l.lat, l.lon], ...cs.map(c => [c.lat, c.lon])]).pad(0.2), 14); return `<p>El más cercano es el <b>${esc(corr)}</b>, a ${fmtKm(ds[0].d)}.</p>`; } };
  }
};
const GEN_NAMES = {roundabout:'Rotondas', metroStreets:'Calles de cada línea de metro', streetsInComuna:'Calles por comuna', crossings:'Cruces de calles', nearestStreet:'Calle más cercana a un lugar', nearestStation:'Metro más cercano', crossComuna:'Comuna de un cruce', landmarksInComuna:'Lugares por comuna', comunaNeighbors:'Comunas vecinas', linesInComuna:'Líneas por comuna', extreme:'Más al norte / sur / oriente / poniente', stationStreet:'Calle de una estación', nearestCerro:'Cerro más cercano'};
MODES.push({ id:'cx', group:'Conexiones', name:'Conexiones (mezcla)', desc:'Preguntas que relacionan todo: cruces, calles por comuna, metro más cercano, vecinas, puntos cardinales…',
  pool(){ const out = [], keys = new Set(), gens = Object.keys(GEN);
    for (let t=0; t<400 && out.length<80; t++){ const g = gens[t % gens.length]; const qq = GEN[g](); if (qq && !keys.has(qq.key)){ keys.add(qq.key); qq.gen = g; out.push(qq); } }
    return out; },
  key: x => x.key, label: x => x.key.split(':').slice(1).join(':'),
  ask(x, q){
    showPanel(qHead(q) + `<div class="q-head" style="margin-top:-4px"><span>${esc(GEN_NAMES[x.gen])}</span></div><div class="q-prompt">${x.prompt}</div>${x.sub ? `<div class="q-sub">${esc(x.sub)}</div>` : ''}`);
    outlineComunas(coreComunas()).addTo(layer);
    if (x.pre) x.pre(); else if (q.i===0) fitCity();
    if (x.multi) renderMulti(x.opts, x.correct, sel => { const html = x.reveal(sel); answer(sameSet(sel, x.correct), html); });
    else renderOptions(x.opts, x.correct, v => { const html = x.reveal(v); answer(v===x.correct, html); }, {one: x.opts.some(o => o.label.length > 22)});
  }
});

// --- ¿Cómo llego en metro? (desde Los Trapenses o el Campus San Joaquín)
const TRANSFER = 3; // una combinación "cuesta" como ~3 estaciones
const sjLm = D.landmarks.find(l => /Campus San Joaquín/.test(l.name));
const ORIGINS = [
  {id:'trap', name:'Los Trapenses (Lo Barnechea)', st:'Escuela Militar', note:'llegas en micro hasta Escuela Militar (L1)', lat:-33.3426, lon:-70.5461},
  {id:'sj', name:'Campus San Joaquín UC', st:'San Joaquín', note:'la estación San Joaquín (L5) está en el campus', lat: sjLm ? sjLm.lat : -33.4988, lon: sjLm ? sjLm.lon : -70.6107}
];
const sIdx = (L, n) => LINES[L].stations.indexOf(n);
function metroPaths(o, d){
  const res = [];
  function rec(L, station, cost, legs, used){
    const di = sIdx(L, d);
    if (di >= 0 && station !== d) res.push({legs:[...legs, {L, from:station, to:d}], cost: cost + Math.abs(sIdx(L, station) - di)});
    if (used.length >= 3) return;
    for (const t of LINES[L].stations){
      const ts = stByName[t]; if (!ts || ts.lines.length < 2 || t === station) continue;
      for (const L2 of ts.lines){ if (used.includes(L2)) continue;
        rec(L2, t, cost + Math.abs(sIdx(L, station) - sIdx(L, t)) + TRANSFER, [...legs, {L, from:station, to:t}], [...used, L2]); }
    }
  }
  for (const L of stByName[o].lines) rec(L, o, 0, [], [L]);
  const best = {};
  for (const r of res){ const k = r.legs.map(l => l.L+'>'+l.to).join('|'); if (!best[k] || best[k].cost > r.cost) best[k] = r; }
  return Object.values(best).sort((a,b) => a.cost - b.cost);
}
const legsLabel = legs => legs.map((l, i) => `${linePill(l.L)} ${legs.length===1 ? 'directo hasta' : 'hasta'} ${esc(l.to)}`).join(' → ');
const legsText = legs => legs.map(l => `${l.L} hasta ${l.to}`).join(' → ');
function drawLegs(legs, target=layer){
  for (const l of legs){ const a = sIdx(l.L, l.from), b = sIdx(l.L, l.to); const seq = LINES[l.L].stations.slice(Math.min(a,b), Math.max(a,b)+1).map(n => stByName[n]).filter(Boolean);
    L.polyline(seq.map(s => [s.lat, s.lon]), {pane:'routes', color:'#fff', weight:9, opacity:.9}).addTo(target);
    L.polyline(seq.map(s => [s.lat, s.lon]), {pane:'routes', color:LINES[l.L].color, weight:6}).addTo(target);
    for (const s of seq) L.circleMarker([s.lat, s.lon], {pane:'points', radius:3.5, color:'#fff', weight:1.5, fillColor:LINES[l.L].color, fillOpacity:1}).addTo(target);
    const t = stByName[l.to]; L.tooltip({permanent:true, direction:'right', offset:[8,0], className:'lbl'}).setLatLng([t.lat, t.lon]).setContent(esc(l.to)).addTo(target);
  }
}
MODES.push({ id:'mt-route', balance: x => x.l.comuna, group:'Ruteo', name:'¿Cómo llego en metro?', desc:'Desde Los Trapenses o el Campus San Joaquín: elige qué líneas tomar y dónde combinar.',
  pool(){ const out = [];
    for (const O of ORIGINS) for (const l of D.landmarks){ if (!l.nm || l.nm[0][1] > 1.2) continue; const d = l.nm[0][0];
      if (d === O.st || km([O.lat, O.lon], [l.lat, l.lon]) < 3) continue; out.push({O, l, d}); }
    return out; },
  key: x => x.O.id+'→'+x.l.name, label: x => x.O.name.split(' (')[0]+' → '+x.l.name,
  ask(x, q){
    const {O, l, d} = x; const paths = metroPaths(O.st, d); const best = paths[0];
    showPanel(qHead(q) + `<div class="q-prompt">Desde <b style="color:#2563eb">${esc(O.name)}</b> a <b style="color:#db2777">${esc(l.name)}</b></div><div class="q-sub">${esc(O.note)}. ¿Qué metro tomas? (se muestra hasta qué estación vas en cada línea)</div>`);
    outlineComunas(coreComunas()).addTo(layer);
    L.marker([O.lat, O.lon], {icon:divIcon('pin a','A',28), pane:'points'}).addTo(layer);
    L.marker([l.lat, l.lon], {icon:divIcon('pin b','B',28), pane:'points'}).addTo(layer);
    drawMetro(layer, {dots:false, opacity:.25, weight:3});
    fit(L.latLngBounds([[O.lat, O.lon], [l.lat, l.lon]]).pad(0.2), 13);
    if (!best){ $('#panel').insertAdjacentHTML('beforeend', '<p class="muted">Sin ruta.</p>'); q.items.splice(q.i,1); setTimeout(() => nextQuestion(true), 500); return; }
    const used = new Set([legsText(best.legs)]); const opts = [{label: legsLabel(best.legs), value: legsText(best.legs)}];
    // 1) rutas válidas pero claramente peores
    for (const p of paths.slice(1)){ if (opts.length >= 3) break; if (p.cost >= best.cost + 5 && !used.has(legsText(p.legs))){ used.add(legsText(p.legs)); opts.push({label: legsLabel(p.legs), value: legsText(p.legs)}); } }
    // 2) rutas imposibles: combinar en una estación que no tiene esa línea, o usar una línea que no llega
    const tries = [];
    best.legs.forEach((leg, i) => { if (i < best.legs.length-1){ const k = sIdx(leg.L, leg.to);
      for (const dk of [-1, 1, -2, 2]){ const n = LINES[leg.L].stations[k+dk]; if (n && !stByName[n].lines.includes(best.legs[i+1].L)){ const legs = best.legs.map(z => ({...z})); legs[i].to = n; legs[i+1].from = n; tries.push(legs); } } } });
    for (const Lw of shuffle(LINE_IDS)){ const last = best.legs[best.legs.length-1]; if (Lw !== last.L && !LINES[Lw].stations.includes(d)){ const legs = best.legs.map(z => ({...z})); legs[legs.length-1].L = Lw; tries.push(legs); } }
    for (const legs of shuffle(tries)){ if (opts.length >= 4) break; const t = legsText(legs); if (!used.has(t)){ used.add(t); opts.push({label: legsLabel(legs), value: t}); } }
    const alt = paths.slice(1).find(p => p.cost <= best.cost + 2);
    renderOptions(shuffle(opts), legsText(best.legs), v => {
      layer.clearLayers(); outlineComunas(coreComunas()).addTo(layer);
      L.marker([O.lat, O.lon], {icon:divIcon('pin a','A',28), pane:'points'}).addTo(layer).bindTooltip(esc(O.name), {permanent:true, direction:'top', offset:[0,-14]});
      L.marker([l.lat, l.lon], {icon:divIcon('pin b','B',28), pane:'points'}).addTo(layer).bindTooltip(esc(l.name), {permanent:true, direction:'top', offset:[0,-14]});
      drawLegs(best.legs);
      const o = stByName[O.st], ds = stByName[d];
      L.polyline([[O.lat, O.lon], [o.lat, o.lon]], {pane:'routes', color:'#334155', dashArray:'6 6', weight:2}).addTo(layer);
      L.polyline([[ds.lat, ds.lon], [l.lat, l.lon]], {pane:'routes', color:'#334155', dashArray:'3 5', weight:2}).addTo(layer);
      fit(L.latLngBounds([[O.lat, O.lon], [l.lat, l.lon], [o.lat, o.lon]]).pad(0.15), 14);
      const n = best.legs.reduce((s, z) => s + Math.abs(sIdx(z.L, z.from) - sIdx(z.L, z.to)), 0);
      answer(v === legsText(best.legs), `<p><b>${legsLabel(best.legs)}</b></p><p class="muted">${n} estaciones, ${best.legs.length-1 ? best.legs.length-1 + ' combinación' + (best.legs.length > 2 ? 'es' : '') : 'sin combinaciones'}. Luego caminas ${fmtKm(l.nm[0][1])} desde ${esc(d)}.</p>${alt ? `<p class="muted">También sirve (casi igual): ${legsLabel(alt.legs)}</p>` : ''}`);
    }, {one:true});
  }
});

// --- Rutas paso a paso (auto / micro y metro)
const HOME = {id:'home', name:'Casa (Los Trapenses)', comuna:'Lo Barnechea', lat:-33.3426, lon:-70.5461};
const SJ = {id:'sj', name:'Campus San Joaquín UC', comuna:'Macul', lat: sjLm ? sjLm.lat : -33.4988, lon: sjLm ? sjLm.lon : -70.6107};
const endp = id => id==='home' ? HOME : id==='sj' ? SJ : lmById[id];
const otherEnd = r => { const a = endp(r.from), b = endp(r.to); return (a===HOME || a===SJ) ? b : a; };
const fillerStreets = ROADS.map(s => s.name.replace(/\s*\(.*\)/,''));
/* cfg: {A, B, steps:[{label, x:[...], g, color}], sub, firstQ, nextQ, summary} */
function askSteps(q, cfg){
  const {A, B, steps} = cfg; let i = 0, errors = 0; const done = [];
  outlineComunas(coreComunas()).addTo(layer);
  L.marker([A.lat, A.lon], {icon:divIcon('pin a','A',28), pane:'points'}).addTo(layer);
  L.marker([B.lat, B.lon], {icon:divIcon('pin b','B',28), pane:'points'}).addTo(layer);
  if (cfg.pre) cfg.pre();
  let here = null;
  const render = () => {
    const st = steps[i];
    showPanel(qHead(q) + `<div class="q-prompt">De <b style="color:#2563eb">${esc(A.name)}</b> a <b style="color:#db2777">${esc(B.name)}</b></div><div class="q-sub">${cfg.sub}</div>
      ${done.length ? `<div class="trail">${done.map((d, k) => `<span class="tstep ${d.ok?'ok':'bad'}">${k+1}. ${d.label}</span>`).join('')}</div>` : ''}
      <div class="q-sub" style="margin:8px 0 6px"><b>Paso ${i+1} de ${steps.length}:</b> ${i===0 ? cfg.firstQ : cfg.nextQ}</div>`);
    if (here) layer.removeLayer(here);
    here = L.marker(st.g[0], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer);
    if (i > 0) fit(L.latLngBounds([st.g[0], [B.lat, B.lon]]).pad(0.3), 14);
    let xs = shuffle(st.x || []).slice(0, 3);
    if (xs.length < 3 && cfg.filler) for (const f of shuffle(cfg.filler)){ if (xs.length >= 3) break; if (f !== st.label && !xs.includes(f) && !steps.some(s => s.label === f)) xs.push(f); }
    const opts = shuffle([st.label, ...xs]).map(v => ({label: cfg.html ? cfg.html(v) : esc(v), value: v}));
    const box = document.createElement('div'); box.className = 'opts one';
    opts.forEach((o, idx) => { const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = `<span class="k">${idx+1}</span> ${o.label}`;
      b.onclick = () => {
        if (box.dataset.done) return; box.dataset.done = '1';
        const ok = o.value === st.label; if (!ok){ errors++; b.classList.add('bad'); }
        box.querySelectorAll('.opt').forEach((x, j) => { x.disabled = true; if (opts[j].value === st.label) x.classList.add('ok'); });
        done.push({label: cfg.html ? cfg.html(st.label) : esc(st.label), ok});
        L.polyline(st.g, {pane:'routes', color:'#fff', weight:9, opacity:.9, interactive:false}).addTo(layer);
        L.polyline(st.g, {pane:'routes', color: st.color || (ok ? COLORS.ok : COLORS.hi), weight:5, interactive:false}).addTo(layer);
        L.tooltip({permanent:true, direction:'top', className:'lbl', offset:[0,-4]}).setLatLng(st.g[Math.floor(st.g.length/2)]).setContent(esc(st.short || st.label)).addTo(layer);
        i++;
        if (i < steps.length) setTimeout(() => { if (quiz === q && !q.answered) render(); }, ok ? 500 : 1700);
        else setTimeout(() => { if (quiz !== q) return; if (here) layer.removeLayer(here);
          fit(L.latLngBounds(steps.flatMap(s => s.g)).extend([A.lat, A.lon]).extend([B.lat, B.lon]).pad(0.1), 15);
          answer(errors === 0, `<p>${errors === 0 ? 'Ruta completa sin errores.' : `Te equivocaste en ${errors} de ${steps.length} pasos.`}</p>${cfg.summary}`, {partial: errors === 1 && steps.length >= 4}); }, ok ? 500 : 1700);
      };
      box.appendChild(b); });
    panel.appendChild(box);
  };
  fit(L.latLngBounds([[A.lat, A.lon], [B.lat, B.lon]]).pad(0.2), 14);
  render();
}
function carStepsMode(id, name, desc, filt){
  MODES.push({ id, group:'Ruteo', name, desc, balance: r => (otherEnd(r)||{}).comuna,
    pool: () => (D.steps||[]).filter(filt), key: r => r.k, label: r => endp(r.from).name+' → '+endp(r.to).name,
    ask(r, q){ const A = endp(r.from), B = endp(r.to);
      askSteps(q, { A, B, steps: r.steps.map(s => ({label:s.n, x:s.x, g:s.g})), filler: fillerStreets,
        sub: `En auto · ~${String(r.km).replace('.',',')} km · ${r.steps.length} calles principales (las chicas se omiten)`,
        firstQ: '¿por qué calle partes?', nextQ: '¿a qué calle sigues?',
        summary: `<p><b>${r.steps.map(s => esc(s.n)).join(' → ')}</b></p><p class="muted">~${String(r.km).replace('.',',')} km, ~${r.min} min sin taco. Ruta calculada por OSRM; puede haber otras igual de buenas (y no considera TAG ni tacos).</p>` });
    } });
}
carStepsMode('rs-home-car', 'Paso a paso · casa o campus · auto', 'Construye calle por calle la ruta en auto desde/hacia tu casa (Los Trapenses) o el Campus San Joaquín.', r => !!r.o);
carStepsMode('rs-any-car', 'Paso a paso · libre · auto', 'Lo mismo, pero entre dos puntos cualquiera de la ciudad.', r => !r.o);
const tpColor = l => l.t === 'metro' && LINES[l.r[0]] ? LINES[l.r[0]].color : l.t === 'bus' ? '#ea580c' : '#1d4ed8';
const tpHtml = v => { const m = v.match(/^(Micro|Metro|Tren) (.+?) → hasta (.+)$/); if (!m) return esc(v);
  const pills = m[2].split(' / ').map(n => m[1]==='Metro' && LINES[n] ? linePill(n) : `<span class="lpill" style="background:${m[1]==='Micro' ? '#ea580c' : '#1d4ed8'}">${esc(n)}</span>`).join('');
  return `${m[1]==='Micro' ? '🚌' : m[1]==='Metro' ? '🚇' : '🚆'} ${pills} hasta <b>${esc(m[3])}</b>`; };
function tpStepsMode(id, name, desc, filt){
  MODES.push({ id, group:'Ruteo', name, desc, balance: r => (otherEnd(r)||{}).comuna,
    pool: () => (D.transit||[]).filter(filt), key: r => r.k, label: r => endp(r.from).name+' → '+endp(r.to).name,
    ask(r, q){ const A = endp(r.from), B = endp(r.to);
      askSteps(q, { A, B, html: tpHtml, steps: r.legs.map(l => ({label:l.label, short:(l.t==='bus'?'Micro ':'')+l.r.join('/'), x:l.x, g:l.g, color:tpColor(l)})),
        pre: () => drawMetro(layer, {dots:false, opacity:.22, weight:3}),
        sub: `En micro y metro · ~${r.min} min en total · ${r.legs.length} tramos`,
        firstQ: '¿qué tomas primero y hasta dónde?', nextQ: '¿qué tomas ahora?',
        summary: `<ol class="blist">${r.legs.map(l => `<li>${tpHtml(l.label)} <span class="muted">(${l.n} paradas, ~${l.min} min)</span></li>`).join('')}</ol><p class="muted">~${r.min} min en total, contando esperas${r.walk > 150 ? ` y ${r.walk} m a pie al final` : ''}. Calculado con los recorridos oficiales de Red (día laboral, media mañana); las alternativas incorrectas demoran al menos 8 min más.</p>` });
    } });
}
tpStepsMode('rs-home-tp', 'Paso a paso · casa o campus · micro y metro', 'Tramo por tramo: qué micro o línea de metro tomar y dónde bajarte, desde/hacia tu casa o el Campus San Joaquín.', r => !!r.o);
tpStepsMode('rs-any-tp', 'Paso a paso · libre · micro y metro', 'Lo mismo, entre dos puntos cualquiera.', r => !r.o);

// --- Barrios y zonas (con perímetro)
const ZONES = D.zones || [];
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length-1; i < poly.length; j = i++){ const a = poly[i], b = poly[j];
  if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < (b[1]-a[1]) * (p[0]-a[0]) / (b[0]-a[0]) + a[1]) c = !c; } return c; };
const zoneBounds = z => L.latLngBounds(z.poly);
function drawZone(z, color=COLORS.hi, {lab=true, target=layer}={}){
  L.polygon(z.poly, {pane:'comunas', color, weight:3, fillColor:color, fillOpacity:.25, interactive:false}).addTo(target);
  if (lab) label(z.c, z.name, 'lbl big').addTo(target);
}
const zoneInfo = z => `<p><b>${esc(z.name)}</b> — ${z.comunas.map(esc).join(' / ')}</p><p class="muted">${esc(z.desc)}</p>${zoneLine(z)}`;
const zonesNear = (z, n) => nearestBy(ZONES, z.c, x => x.c, n, x => x === z);
MODES.push({ id:'zn-name', group:'Barrios', name:'¿Qué barrio es?', desc:'Te marco el perímetro de un barrio o zona; eliges cuál es.',
  pool: () => ZONES, key: z => z.name,
  ask(z, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué barrio o zona está marcado?</div>`);
    outlineComunas(coreComunas()).addTo(layer); drawZone(z, COLORS.hi, {lab:false});
    fit(zoneBounds(z).pad(1.2), 15);
    const opts = shuffle([z, ...shuffle(zonesNear(z, 6)).slice(0, 3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), z.name, v => {
      setTiles('streets'); label(z.c, z.name, 'lbl big').addTo(layer);
      if (v !== z.name){ const w = ZONES.find(x => x.name === v); drawZone(w, COLORS.bad); fit(zoneBounds(z).extend(zoneBounds(w)).pad(0.2), 15); }
      answer(v === z.name, zoneInfo(z));
    }, {one:true});
  }
});
MODES.push({ id:'zn-loc', group:'Barrios', name:'Ubica el barrio', desc:'Toca dónde queda el barrio. Vale si caes dentro del perímetro o a menos de 400 m.',
  pool: () => ZONES, key: z => z.name,
  ask(z, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Dónde queda <b>${esc(z.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`);
    outlineComunas(coreComunas()).addTo(layer);
    if (q.i === 0) fit(L.latLngBounds(ZONES.flatMap(x => x.poly)).pad(0.15), 13);
    map.on('click', e => {
      if (q.answered) return;
      const p = [e.latlng.lat, e.latlng.lng]; const d = inPoly(p, z.poly) ? 0 : distToPolyline(p, [[...z.poly, z.poly[0]]]); const ok = d <= 0.4;
      L.marker(p, {icon:divIcon('pin you'), pane:'points'}).addTo(layer); drawZone(z, ok ? COLORS.ok : COLORS.hi); setTiles('streets');
      fit(zoneBounds(z).extend(p).pad(0.3), 15);
      answer(ok, `${d ? `<p>Quedaste a ${fmtKm(d)} del borde.</p>` : '<p>Caíste dentro.</p>'}${zoneInfo(z)}`, {partial: !ok && d <= 1});
    });
  }
});
MODES.push({ id:'zn-streets', group:'Barrios', name:'¿Qué calles lo rodean?', desc:'Selección múltiple: marca las calles que forman el perímetro del barrio.',
  pool: () => ZONES, key: z => z.name,
  ask(z, q){
    const clean = s => s.replace(/\s*\(.*\)/, '');
    const all = z.streets.map(clean).filter(s => !/^(Plaza Italia|Faldeo)/.test(s));
    const cor = shuffle(all).slice(0, Math.min(3, all.length));
    const pool = [...new Set(zonesNear(z, 5).flatMap(x => x.streets.map(clean)))].filter(s => !all.includes(s) && !/^(Plaza Italia|Faldeo|Río)/.test(s));
    const ds = shuffle(pool).slice(0, 5 - cor.length);
    showPanel(qHead(q) + `<div class="q-prompt">¿Cuáles de estas calles bordean <b>${esc(z.name)}</b>?</div>`);
    outlineComunas(coreComunas()).addTo(layer); drawZone(z, COLORS.hi, {lab:false}); fit(zoneBounds(z).pad(0.8), 15);
    renderMulti(shuffle([...cor, ...ds]).map(v => opt(v)), cor, sel => { setTiles('streets'); label(z.c, z.name, 'lbl big').addTo(layer); fit(zoneBounds(z).pad(0.25), 16); answer(sameSet(sel, cor), zoneInfo(z)); });
  }
});

// --- Chile: regiones y ciudades
const CH = D.chile || {regions:{features:[]}, cities:[]};
const REG = CH.regions.features; const regByName = Object.fromEntries(REG.map(f => [f.properties.name, f]));
const RM_BOUNDS = [[-34.3,-71.8],[-32.8,-69.7]];
let chileOn = false;
function setChile(on){ if (on === chileOn) return; chileOn = on;
  if (on){ map.setMinZoom(3); map.setMaxBounds([[-66,-150],[-5,8]]); }
  else { map.setMaxBounds(RM_BOUNDS); map.setMinZoom(9); map.setView([-33.46,-70.64], 11, {animate:false}); } }
const fitChile = () => setTimeout(() => { map.invalidateSize(); map.fitBounds(L.latLngBounds([[-44,-76],[-17.5,-66.5]]), Object.assign({maxZoom:6, animate:false}, panelPad())); }, 80);
const REG_COLS = ['#93c5fd','#a7f3d0','#fde68a','#fbcfe8','#c4b5fd','#fdba74'];
const regLayer = (opts) => comunaLayer(REG, Object.assign({style: f => ({color:'#475569', weight:1, fillColor: REG_COLS[f.properties.ord % REG_COLS.length], fillOpacity:.75})}, opts));
const regTxt = f => `<p><b>Región de ${esc(f.properties.name)}</b> (${f.properties.rom}) — capital: <b>${esc(f.properties.cap)}</b></p><p class="muted">Ciudades: ${CH.cities.filter(c => c.region === f.properties.name).map(c => esc(c.name) + (c.pop ? ' (' + c.pop.toLocaleString('es-CL') + ')' : '')).join(', ')}</p>`;
MODES.push({ id:'ch-find', group:'Chile', name:'Ubica la región', desc:'Te digo la región; la tocas en el mapa de Chile.', chile:true,
  pool: () => REG, key: f => f.properties.name,
  ask(f, q){
    showPanel(qHead(q) + `<div class="q-prompt">Toca la región: <b>${esc(f.properties.name)}</b></div><div class="q-sub">Haz zoom: las del centro son angostas.</div>`);
    if (q.i === 0) fitChile();
    const lay = regLayer({ onClick: (g, l) => { if (q.answered) return; const ok = g === f;
      l.setStyle({fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity:.8}); label(labOf(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer);
      if (!ok){ lay.eachLayer(x => { if (x.feature === f) x.setStyle({fillColor:COLORS.hi, fillOpacity:.85}); }); label(labOf(f), f.properties.name, 'lbl big').addTo(layer); }
      answer(ok, (ok ? '' : `<p>Tocaste ${esc(g.properties.name)}.</p>`) + regTxt(f)); }}).addTo(layer);
  }
});
MODES.push({ id:'ch-name', group:'Chile', name:'¿Qué región es?', desc:'Te marco una región; eliges su nombre.', chile:true,
  pool: () => REG, key: f => f.properties.name,
  ask(f, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué región está marcada en naranjo?</div>`);
    regLayer({interactive:false, style: g => g === f ? {fillColor:COLORS.hi, fillOpacity:.9, color:'#92400e', weight:2} : {color:'#64748b', weight:1, fillColor:'#cbd5e1', fillOpacity:.6}}).addTo(layer);
    const i = f.properties.ord; const nb = REG.filter(g => g !== f && Math.abs(g.properties.ord - i) <= 3);
    fit(boundsOfFeatures([f, ...REG.filter(g => Math.abs(g.properties.ord - i) <= 1)]), 8);
    const opts = shuffle([f, ...shuffle(nb).slice(0, 3)]).map(g => ({label:esc(g.properties.name), value:g.properties.name}));
    renderOptions(opts, f.properties.name, v => { for (const g of [f, ...nb]) label(labOf(g), g.properties.name, g === f ? 'lbl big' : 'lbl').addTo(layer); answer(v === f.properties.name, regTxt(f)); });
  }
});
MODES.push({ id:'ch-cap', group:'Chile', name:'Capitales regionales', desc:'¿Cuál es la capital de cada región?', chile:true,
  pool: () => REG, key: f => f.properties.name,
  ask(f, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Cuál es la capital de la región de <b>${esc(f.properties.name)}</b>?</div>`);
    regLayer({interactive:false, style: g => g === f ? {fillColor:COLORS.hi, fillOpacity:.7} : {color:'#64748b', weight:1, fillColor:'#cbd5e1', fillOpacity:.5}}).addTo(layer);
    fit(boundsOfFeatures([f]).pad(0.6), 8);
    const same = CH.cities.filter(c => c.region === f.properties.name && c.name !== f.properties.cap).map(c => c.name);
    const others = REG.filter(g => g !== f && Math.abs(g.properties.ord - f.properties.ord) <= 2).map(g => g.properties.cap);
    const ds = [...new Set([...shuffle(same), ...shuffle(others)])].filter(n => n !== f.properties.cap).slice(0, 3);
    renderOptions(shuffle([f.properties.cap, ...ds]).map(n => ({label:esc(n), value:n})), f.properties.cap, v => {
      for (const c of CH.cities.filter(c => c.region === f.properties.name)) L.circleMarker([c.lat, c.lon], {pane:'points', radius: c.cap ? 7 : 5, color:'#fff', weight:2, fillColor: c.cap ? COLORS.ok : '#475569', fillOpacity:1}).addTo(layer).bindTooltip(esc(c.name), {permanent:true, direction:'right', offset:[8,0], className:'lbl'});
      answer(v === f.properties.cap, regTxt(f)); });
  }
});
MODES.push({ id:'ch-city', group:'Chile', name:'Ubica la ciudad', desc:'Toca dónde está la ciudad en el mapa de Chile (margen 60 km).', chile:true,
  pool: () => CH.cities, key: c => c.name,
  ask(c, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Dónde está <b>${esc(c.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`);
    regLayer({interactive:false, style: () => ({color:'#64748b', weight:1, fillOpacity:.08})}).addTo(layer);
    if (q.i === 0) fitChile();
    map.on('click', e => { if (q.answered) return; const you = [e.latlng.lat, e.latlng.lng], d = km(you, [c.lat, c.lon]) * (KY / KY); const dk = Math.hypot((you[0]-c.lat)*111.2, (you[1]-c.lon)*111.2*Math.cos(c.lat*Math.PI/180)); const ok = dk <= 60;
      L.marker(you, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.marker([c.lat, c.lon], {icon:divIcon('pin ' + (ok ? 'good' : 'ans')), pane:'points'}).addTo(layer).bindTooltip(esc(c.name), {permanent:true, direction:'top', offset:[0,-10]});
      L.polyline([you, [c.lat, c.lon]], {pane:'routes', color:'#334155', dashArray:'5 6', weight:2}).addTo(layer);
      const R = regByName[c.region]; if (R) label(labOf(R), R.properties.name).addTo(layer);
      answer(ok, `<p>Quedaste a <b>${Math.round(dk)} km</b>.</p>${cityTxt(c)}`, {partial: !ok && dk <= 150}); });
  }
});
MODES.push({ id:'ch-cityreg', group:'Chile', name:'¿En qué región está la ciudad?', desc:'Toca la región donde queda la ciudad.', chile:true,
  pool: () => CH.cities.filter(c => regByName[c.region]), key: c => c.name,
  ask(c, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿En qué región está <b>${esc(c.name)}</b>?</div><div class="q-sub">Toca la región</div>`);
    if (q.i === 0) fitChile();
    regLayer({ onClick: (g, l) => { if (q.answered) return; const ok = g.properties.name === c.region;
      l.setStyle({fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity:.75}); label(labOf(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer);
      if (!ok) label(labOf(regByName[c.region]), c.region, 'lbl big').addTo(layer);
      L.marker([c.lat, c.lon], {icon:divIcon('pin good'), pane:'points'}).addTo(layer).bindTooltip(esc(c.name), {permanent:true, direction:'top', offset:[0,-10]});
      answer(ok, cityTxt(c)); }}).addTo(layer);
  }
});

// --- Fronteras entre comunas
const BORD = (D.borders || []).filter(P => comunaByName[P.a] && comunaByName[P.b]);
const NONE = '__none';
const FEAT_COLORS = ['#2563eb','#db2777','#16a34a','#ea580c','#7c3aed','#0891b2','#ca8a04','#dc2626'];
const typeLabel = t => ({'río':'río','canal':'canal','estero':'estero','acequia':'canal','cauce':'cauce','vía férrea':'línea férrea','calle':''})[t] || '';
const featLabel = f => esc(f.n) + (typeLabel(f.t) && !/^(Río|Canal|Estero|Zanjón)/.test(f.n) ? ` <span class="muted">(${typeLabel(f.t)})</span>` : '');
const bordersOf = c => BORD.filter(P => P.a === c || P.b === c);
const otherOf = (P, c) => P.a === c ? P.b : P.a;
const mainFeats = P => P.feats.filter(f => f.km >= Math.max(0.4, 0.2 * P.km));
function drawBorder(P, colorOf, {labels=true}={}){
  const lab = new Set();
  for (const r of P.runs){ const col = colorOf(r.n); if (!col) continue;
    L.polyline(r.pts, {pane:'routes', color:'#fff', weight: r.n ? 9 : 5, opacity:.9, interactive:false}).addTo(layer);
    L.polyline(r.pts, {pane:'routes', color: col, weight: r.n ? 5 : 3, dashArray: r.n ? null : '4 6', interactive:false}).addTo(layer);
    if (labels && r.n && !lab.has(r.n) && r.pts.length > 2){ lab.add(r.n); L.tooltip({permanent:true, direction:'top', className:'lbl', offset:[0,-4]}).setLatLng(r.pts[Math.floor(r.pts.length/2)]).setContent(esc(r.n)).addTo(layer); }
  }
}
function pairComunas(P){ comunaLayer([comunaByName[P.a], comunaByName[P.b]], {interactive:false, style: f => ({fillColor: f.properties.name===P.a ? '#93c5fd' : '#fda4af', fillOpacity:.35, color:'#475569', weight:1})}).addTo(layer);
  for (const n of [P.a, P.b]) label(labOf(comunaByName[n]), n, 'lbl big').addTo(layer); }
const borderSummary = P => `<p><b>${esc(P.a)} – ${esc(P.b)}</b> (${String(P.km).replace('.',',')} km de límite):</p><ul class="blist">${P.feats.slice(0,6).map(f => `<li>${featLabel(f)} — ${fmtKm(f.km)}</li>`).join('')}${P.free >= 0.3 ? `<li class="muted">Sin calle ni cauce (cerros, terrenos o línea imaginaria) — ${fmtKm(P.free)}</li>` : ''}</ul>`;
const pairBounds = P => L.latLngBounds(P.runs.flatMap(r => r.pts));

MODES.push({ id:'fr-study', group:'Fronteras', name:'Estudiar fronteras', desc:'Elige una comuna y mira qué calle, río o canal la separa de cada vecina.', study:true,
  pool: () => [1], key: () => 'study',
  ask(_, q){
    const opts = coreComunas().map(f => f.properties.name).filter(n => bordersOf(n).length).sort((a,b) => a.localeCompare(b,'es'));
    const cur = store.get('frStudy', 'Las Condes');
    showPanel(`<div class="q-prompt" style="margin-top:0">Fronteras de…</div><select id="frSel">${opts.map(n => `<option ${n===cur?'selected':''}>${esc(n)}</option>`).join('')}</select><div id="frList" style="margin-top:8px"></div>
      <p class="muted" style="font-size:12px">Calculado comparando el límite oficial (OpenStreetMap) con las calles, ríos y canales que corren a menos de ~70 m. Toca una vecina para acercarte.</p>`);
    hud.textContent = '';
    const render = c => { store.set('frStudy', c); layer.clearLayers(); const C = comunaByName[c]; const bs = bordersOf(c).sort((a,b) => b.km - a.km);
      comunaLayer(coreComunas(), {interactive:false, style: f => f.properties.name===c ? {fillColor:COLORS.hi, fillOpacity:.3, color:'#92400e', weight:2} : {fillOpacity:.12, color:'#94a3b8', weight:1}}).addTo(layer);
      for (const P of bs) label(labOf(comunaByName[otherOf(P, c)]), otherOf(P, c)).addTo(layer);
      label(labOf(C), c, 'lbl big').addTo(layer);
      const names = [...new Set(bs.flatMap(P => P.feats.map(f => f.n)))]; const col = n => n ? FEAT_COLORS[names.indexOf(n) % FEAT_COLORS.length] : '#94a3b8';
      for (const P of bs) drawBorder(P, col);
      $('#frList').innerHTML = bs.map((P, i) => { const o = otherOf(P, c);
        return `<button class="mode" data-i="${i}" style="margin-bottom:6px"><span><b>${esc(o)}</b> <small>· ${String(P.km).replace('.',',')} km</small><br><small>${P.feats.length ? P.feats.slice(0,4).map(f => `<span class="dot" style="background:${col(f.n)}"></span>${esc(f.n)} (${fmtKm(f.km)})`).join(' · ') : 'sin calle ni cauce: cerros / terrenos'}${P.free >= 0.3 && P.feats.length ? ` · <span class="muted">sin calle ${fmtKm(P.free)}</span>` : ''}</small></span></button>`; }).join('');
      $('#frList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => fit(pairBounds(bs[+b.dataset.i]).pad(0.2), 15));
      fit(boundsOfFeatures([C]).pad(0.15), 14);
    };
    $('#frSel').onchange = e => render(e.target.value);
    render(opts.includes(cur) ? cur : opts[0]);
  }
});
MODES.push({ id:'fr-what', group:'Fronteras', name:'¿Qué separa a estas comunas?', desc:'Te doy dos comunas vecinas; eliges qué calle(s), río o canal forman su límite.',
  pool: () => BORD.filter(P => inScope(comunaByName[P.a]) && inScope(comunaByName[P.b]) && P.km >= 0.8 && (mainFeats(P).length || P.free / P.km >= 0.5)),
  key: P => P.a+'|'+P.b, label: P => P.a+' – '+P.b,
  ask(P, q){
    const cor = mainFeats(P).map(f => f.n); const none = P.free / P.km >= 0.4; if (none) cor.push(NONE);
    const near = shuffle([...new Set([...bordersOf(P.a), ...bordersOf(P.b)].filter(Z => Z !== P).flatMap(Z => mainFeats(Z).map(f => f.n)))].filter(n => !P.feats.some(f => f.n === n)));
    const ds = near.slice(0, Math.max(2, 4 - cor.length));
    if (ds.length < 2) for (const s of shuffle(D.streets)){ if (ds.length >= 3) break; if (!P.feats.some(f => f.n === s.name) && !ds.includes(s.name) && distToPolyline(labOf(comunaByName[P.a]), s.lines) < 4) ds.push(s.name); }
    const opts = shuffle([...cor.filter(n => n !== NONE), ...ds]).map(n => opt(n));
    opts.push(opt(NONE, '<i>Ninguna: cerros, terrenos o línea imaginaria</i>'));
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué forma el límite entre <b>${esc(P.a)}</b> y <b>${esc(P.b)}</b>?</div><div class="q-sub">Marca lo que forme una parte importante del límite.</div>`);
    pairComunas(P); fit(pairBounds(P).pad(0.35), 15);
    renderMulti(opts, cor, sel => {
      drawBorder(P, n => n ? (cor.includes(n) ? COLORS.ok : '#64748b') : '#94a3b8');
      for (const n of sel.filter(x => x !== NONE && !cor.includes(x))){ const s = streetByName[n]; if (s) drawStreet(s, COLORS.bad, {weight:3, labelText:n}); }
      answer(sameSet(sel, cor), borderSummary(P));
    });
  }
});
MODES.push({ id:'fr-which', group:'Fronteras', name:'¿Qué comunas separa?', desc:'Te doy una calle, río o canal; eliges entre qué comunas hace de límite.',
  pool(){ const m = {};
    for (const P of BORD){ if (!inScope(comunaByName[P.a]) || !inScope(comunaByName[P.b])) continue; for (const f of mainFeats(P)) if (f.km >= 0.5) (m[f.n] = m[f.n] || {n:f.n, t:f.t, pairs:[]}).pairs.push(P); }
    return Object.values(m); },
  key: F => F.n, label: F => F.n,
  ask(F, q){
    const pk = P => P.a+' – '+P.b; const cor = F.pairs.map(pk);
    const cs = [...new Set(F.pairs.flatMap(P => [P.a, P.b]))];
    const cand = shuffle(BORD.filter(P => !F.pairs.includes(P) && (cs.includes(P.a) || cs.includes(P.b)) && inScope(comunaByName[P.a]) && inScope(comunaByName[P.b])));
    const shown = shuffle(cor).slice(0, 3); const ds = cand.slice(0, 5 - shown.length).map(pk);
    showPanel(qHead(q) + `<div class="q-prompt">¿Entre qué comunas hace de límite <b>${featLabel(F)}</b>?</div>`);
    renderMulti(shuffle([...shown, ...ds]).map(v => opt(v)), shown, sel => {
      const all = F.pairs; const fs = [...new Set(all.flatMap(P => [P.a, P.b]))].map(n => comunaByName[n]);
      comunaLayer(fs, {interactive:false, style: () => ({fillColor:'#93c5fd', fillOpacity:.25, color:'#475569', weight:1})}).addTo(layer);
      for (const f of fs) label(labOf(f), f.properties.name).addTo(layer);
      for (const P of all) drawBorder(P, n => n === F.n ? COLORS.ok : null, {labels:false});
      fit(L.latLngBounds(all.flatMap(P => P.runs.filter(r => r.n === F.n).flatMap(r => r.pts))).pad(0.25), 14);
      answer(sameSet(sel, shown), `<p><b>${esc(F.n)}</b> es límite entre: ${all.map(P => `${esc(P.a)} – ${esc(P.b)} (${fmtKm(P.feats.find(f => f.n === F.n).km)})`).join('; ')}.</p>`);
    });
  }
});

// --- Chile: ciudades por región y parques nacionales
const fmtPop = n => n ? n.toLocaleString('es-CL') + ' hab. aprox.' : '';
const cityTxt = c => `<p><b>${esc(c.name)}</b> — región de <b>${esc(c.region)}</b>${c.cap ? ' (capital regional)' : ''}${c.pop ? ` · ${fmtPop(c.pop)}` : ''}</p>`;
MODES.push({ id:'ch-cities', group:'Chile', name:'¿Qué ciudades son de esta región?', desc:'Selección múltiple: marca las ciudades que pertenecen a la región.', chile:true,
  pool: () => REG.filter(f => CH.cities.some(c => c.region === f.properties.name)), key: f => f.properties.name,
  ask(f, q){
    const mine = CH.cities.filter(c => c.region === f.properties.name);
    const others = CH.cities.filter(c => c.region !== f.properties.name && regByName[c.region] && Math.abs(regByName[c.region].properties.ord - f.properties.ord) <= 2);
    const cor = shuffle(mine).slice(0, Math.min(3, mine.length)); const ds = shuffle(others).slice(0, 6 - cor.length);
    showPanel(qHead(q) + `<div class="q-prompt">¿Cuáles de estas ciudades están en la región de <b>${esc(f.properties.name)}</b>?</div>`);
    regLayer({interactive:false, style: g => g === f ? {fillColor:COLORS.hi, fillOpacity:.7} : {color:'#64748b', weight:1, fillColor:'#cbd5e1', fillOpacity:.5}}).addTo(layer);
    fit(boundsOfFeatures([f]).pad(0.8), 8);
    renderMulti(shuffle([...cor, ...ds]).map(c => opt(c.name)), cor.map(c => c.name), sel => {
      for (const c of [...mine, ...ds]) L.circleMarker([c.lat, c.lon], {pane:'points', radius:6, color:'#fff', weight:2, fillColor: c.region === f.properties.name ? COLORS.ok : (sel.includes(c.name) ? COLORS.bad : '#475569'), fillOpacity:1}).addTo(layer).bindTooltip(esc(c.name), {permanent:true, direction:'right', offset:[8,0], className:'lbl'});
      fit(L.latLngBounds([...mine, ...ds].map(c => [c.lat, c.lon])).pad(0.2), 9);
      answer(sameSet(sel, cor.map(c => c.name)), `<p><b>Región de ${esc(f.properties.name)}:</b> ${mine.map(c => esc(c.name) + (c.pop ? ` (${c.pop.toLocaleString('es-CL')})` : '')).join(', ')}.</p><p class="muted">Las otras: ${ds.map(c => esc(c.name) + ' → ' + esc(c.region)).join('; ')}.</p>`);
    });
  }
});
const PARKS = CH.parks || [];
const parkTxt = p => `<p><b>Parque Nacional ${esc(p.name)}</b> — región de <b>${esc(p.region)}</b></p>`;
const parkIcon = (cls='') => L.divIcon({className:'', html:`<div class="tree ${cls}">🌲</div>`, iconSize:[22,22], iconAnchor:[11,11]});
const farPark = p => /Rapa Nui|Juan Fernández/.test(p.name);
MODES.push({ id:'pn-loc', group:'Chile', name:'Ubica el parque nacional', desc:'Toca dónde está el parque (margen 80 km).', chile:true,
  pool: () => PARKS.filter(p => !farPark(p)), key: p => p.name,
  ask(p, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Dónde está el Parque Nacional <b>${esc(p.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`);
    regLayer({interactive:false, style: () => ({color:'#64748b', weight:1, fillOpacity:.08})}).addTo(layer);
    if (q.i === 0) fitChile();
    map.on('click', e => { if (q.answered) return; const you = [e.latlng.lat, e.latlng.lng]; const dk = Math.hypot((you[0]-p.lat)*111.2, (you[1]-p.lon)*111.2*Math.cos(p.lat*Math.PI/180)); const ok = dk <= 80;
      L.marker(you, {icon:divIcon('pin you'), pane:'points'}).addTo(layer);
      L.marker([p.lat, p.lon], {icon:parkIcon(), pane:'points'}).addTo(layer).bindTooltip(esc(p.name), {permanent:true, direction:'top', offset:[0,-10]});
      L.polyline([you, [p.lat, p.lon]], {pane:'routes', color:'#334155', dashArray:'5 6', weight:2}).addTo(layer);
      answer(ok, `<p>Quedaste a <b>${Math.round(dk)} km</b>.</p>${parkTxt(p)}`, {partial: !ok && dk <= 200}); });
  }
});
MODES.push({ id:'pn-reg', group:'Parques nacionales', name:'¿En qué región está el parque?', desc:'Toca la región del parque nacional.', chile:true,
  pool: () => PARKS.filter(p => regByName[p.region]), key: p => p.name,
  ask(p, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿En qué región está el Parque Nacional <b>${esc(p.name)}</b>?</div><div class="q-sub">Toca la región</div>`);
    if (q.i === 0) fitChile();
    regLayer({ onClick: (g, l) => { if (q.answered) return; const ok = g.properties.name === p.region;
      l.setStyle({fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity:.8}); label(labOf(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer);
      if (!ok) label(labOf(regByName[p.region]), p.region, 'lbl big').addTo(layer);
      if (!farPark(p)) L.marker([p.lat, p.lon], {icon:parkIcon(), pane:'points'}).addTo(layer).bindTooltip(esc(p.name), {permanent:true, direction:'top', offset:[0,-10]});
      answer(ok, parkTxt(p) + (farPark(p) ? '<p class="muted">Es territorio insular: administrativamente pertenece a la región de Valparaíso.</p>' : '')); }}).addTo(layer);
  }
});
MODES.push({ id:'pn-name', group:'Chile', name:'¿Qué parque nacional es?', desc:'Te marco un parque en el mapa; eliges cuál es.', chile:true,
  pool: () => PARKS.filter(p => !farPark(p)), key: p => p.name,
  ask(p, q){
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué parque nacional está marcado?</div>`);
    regLayer({interactive:false, style: () => ({color:'#64748b', weight:1, fillOpacity:.08})}).addTo(layer);
    L.marker([p.lat, p.lon], {icon:divIcon('pulse','',22), pane:'points'}).addTo(layer); map.setView([p.lat, p.lon], 6);
    const near = PARKS.filter(x => x !== p && !farPark(x)).map(x => ({x, d: Math.hypot(x.lat-p.lat, x.lon-p.lon)})).sort((a,b) => a.d-b.d).slice(0, 6).map(o => o.x);
    const opts = shuffle([p, ...shuffle(near).slice(0, 3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), p.name, v => {
      for (const o of opts) L.marker([o.lat, o.lon], {icon:parkIcon(), pane:'points'}).addTo(layer).bindTooltip(esc(o.name), {permanent:true, direction:'right', offset:[10,0], className:'lbl' + (o === p ? ' big' : '')});
      fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.3), 8); answer(v === p.name, parkTxt(p)); });
  }
});

MODES.push({ id:'ch-all', group:'Chile', name:'Completa el mapa (regiones)', desc:'Las 16 regiones, una por una, hasta pintar el mapa entero.', all:true, keepLayer:true, chile:true,
  pool: () => REG, key: f => f.properties.name,
  setup(q){ clearLayer(); q.state = {}; q.tries = 0; q.lay = regLayer({ style: () => ({color:'#475569', weight:1, fillColor:'#cbd5e1', fillOpacity:.6}), onClick: (g, l) => this.click(g, l) }).addTo(layer); fitChile(); },
  ask(f, q){ q.tries = 0; showPanel(qHead(q) + `<div class="q-prompt">Toca: <b>${esc(f.properties.name)}</b></div><div class="q-sub">Verde = a la primera · amarillo = 2º intento · naranjo = 3º · rojo = no la encontraste</div>`); },
  click(g, l){ const q = quiz; if (!q || q.answered) return; const f = q.items[q.i], name = f.properties.name;
    if (q.state[g.properties.name]){ toast(g.properties.name + ' (ya respondida)'); return; }
    if (g === f){ l.setStyle({fillColor:[COLORS.ok, COLORS.ok2, COLORS.mid][q.tries], fillOpacity:.85}); q.state[name] = true; label(labOf(g), name).addTo(layer);
      answer(q.tries === 0, q.tries ? `<p>Encontrada al intento ${q.tries+1}.</p>` : '', {partial: q.tries > 0}); }
    else { q.tries++; toast('Esa es ' + g.properties.name); const tl = label(labOf(g), g.properties.name, 'lbl bad').addTo(layer); setTimeout(() => layer.removeLayer(tl), 1500);
      if (q.tries >= 3){ q.lay.eachLayer(x => { if (x.feature === f) x.setStyle({fillColor:COLORS.bad, fillOpacity:.8}); }); q.state[name] = true; label(labOf(f), name, 'lbl bad').addTo(layer); answer(false, '<p>Está marcada en rojo.</p>'); } } }
});
MODES.push({ id:'pn-photo', group:'Parques nacionales', name:'Reconoce el parque por la foto', desc:'Te muestro una foto de un parque nacional; eliges cuál es.', chile:true, tall:true,
  pool: () => PARKS.filter(p => PH['p:'+p.name]), key: p => p.name,
  ask(p, q){ const ps = PH['p:'+p.name];
    showPanel(qHead(q) + `<div class="q-prompt">¿Qué parque nacional es este?</div>${photoHtml('p:'+p.name, {start: Math.floor(Math.random()*ps.length), big:true})}`);
    regLayer({interactive:false, style: () => ({color:'#64748b', weight:1, fillOpacity:.08})}).addTo(layer); if (q.i === 0) fitChile();
    const near = PARKS.filter(x => x !== p).map(x => ({x, d: Math.abs(x.lat - p.lat)})).sort((a,b) => a.d - b.d).slice(0, 8).map(o => o.x);
    const opts = shuffle([p, ...shuffle(near).slice(0, 3)]);
    renderOptions(opts.map(x => ({label:esc(x.name), value:x.name})), p.name, v => {
      for (const o of opts.filter(o => !farPark(o))) L.marker([o.lat, o.lon], {icon:parkIcon(), pane:'points'}).addTo(layer).bindTooltip(esc(o.name), {permanent:true, direction:'right', offset:[10,0], className:'lbl' + (o === p ? ' big' : '')});
      const vis = opts.filter(o => !farPark(o)); if (vis.length) fit(L.latLngBounds(vis.map(o => [o.lat, o.lon])).pad(0.4), 8);
      answer(v === p.name, parkTxt(p)); }, {one:true});
  }
});

// modos retirados (se conservan los datos para el mapa de Explorar)
{ const OFF = new Set(['mt-line','mt-com','com-find','ch-name','ch-cap','ch-cities','pn-loc','pn-name','mt-loc','ce-loc','ce-name','ce-photo','rs-home-tp','mt-which','st-conf','route','mt-route','rs-home-car','ph-lm','ph-st','zn-name','zn-loc','zn-streets','fr-study','fr-what','fr-which']);
  for (let i = MODES.length - 1; i >= 0; i--) if (OFF.has(MODES[i].id)) MODES.splice(i, 1); }

// ---------- explorar ----------
function explore(){
  quiz = null; home.classList.add('hidden'); title.textContent = 'Explorar'; hud.textContent = '';
  clearLayer(); map.removeControl(hintCtl); setTiles('labels');
  const st = Object.assign({com:true, names:true, metro:false, streets:false, lm:false, cerros:false, zones:false, tren:false, micros:false, regs:false, cities:false, parks:false, relief:false, cats:CATS.slice()}, store.get('explore', {}));
  const groups = { com:L.layerGroup(), names:L.layerGroup(), metro:L.layerGroup(), streets:L.layerGroup(), lm:L.layerGroup(), cerros:L.layerGroup() };
  groups.zones = L.layerGroup();
  for (const z of ZONES){ L.polygon(z.poly, {pane:'comunas', color:'#b45309', weight:2.5, dashArray: z.approx ? '6 6' : null, fillColor:'#f59e0b', fillOpacity:.25}).bindPopup(`<h4>${esc(z.name)}</h4>${zoneInfo(z)}`, {maxWidth:280}).addTo(groups.zones); label(z.c, z.name).addTo(groups.zones); }
  for (const c of cerros) L.marker([c.lat, c.lon], {icon:triIcon(), pane:'points'}).bindPopup(`<h4>${esc(c.name)}</h4>${cerroInfo(c)}`, {maxWidth:280}).addTo(groups.cerros);
  const all = comunas.filter(f => f.properties.group!=='rural' || settings.scope==='all');
  comunaLayer(all, { style: ()=>({fillOpacity:.12, fillColor:'#0f766e', color:'#0f766e', weight:1.6}), onClick:(f, l, e) => {
    L.popup().setLatLng(e.latlng).setContent(`<h4>${esc(f.properties.name)}</h4><p>${f.properties.km2.toLocaleString('es-CL')} km²</p><p class="muted">Limita con: ${f.properties.nb.map(esc).join(', ')}</p>`).openOn(map);
  }}).addTo(groups.com);
  const nameLabels = all.map(f => ({f, t: label([f.properties.lab[1], f.properties.lab[0]], f.properties.name)}));
  const refreshNames = () => { groups.names.clearLayers(); const z = map.getZoom();
    for (const {f, t} of nameLabels){ if (z>=11 || f.properties.km2>40 || (z>=10 && f.properties.km2>15)) groups.names.addLayer(t); } };
  map.on('zoomend', refreshNames); refreshNames();
  groups.tren = L.layerGroup(); groups.micros = L.layerGroup(); groups.regs = L.layerGroup(); groups.cities = L.layerGroup(); groups.parks = L.layerGroup();
  const MC = ['#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#0f766e','#a16207'];
  (D.micros||[]).forEach((m, i) => { const pl = L.polyline(m.g, {pane:'routes', color:MC[i % MC.length], weight:3.5, opacity:.8}).bindPopup(`<h4>🚌 Micro ${esc(m.name)}</h4><p>${esc(m.long)}</p><p class="muted">Pasa cada ~${m.min} min (día laboral, media mañana) · ${m.km} km${m.why==='casa' ? ' · pasa cerca de tu casa' : m.why==='campus' ? ' · pasa por el Campus San Joaquín' : ''}</p>`);
    pl.on('mouseover', () => pl.setStyle({weight:7, opacity:1})); pl.on('mouseout', () => pl.setStyle({weight:3.5, opacity:.8})); groups.micros.addLayer(pl);
    L.tooltip({permanent:true, direction:'center', className:'lbl'}).setLatLng(m.g[Math.floor(m.g.length * (0.3 + 0.4 * ((i % 5) / 5)))]).setContent(esc(m.name)).addTo(groups.micros); });
  comunaLayer(REG, {style: f => ({color:'#475569', weight:1, fillColor: REG_COLS[f.properties.ord % REG_COLS.length], fillOpacity:.45}), onClick:(f, l, e) => L.popup().setLatLng(e.latlng).setContent(`<h4>Región de ${esc(f.properties.name)}</h4>${regTxt(f)}`).openOn(map)}).addTo(groups.regs);
  for (const c of CH.cities) L.circleMarker([c.lat, c.lon], {pane:'points', radius: c.cap ? 7 : (c.pop > 100000 ? 6 : 4.5), color:'#fff', weight:2, fillColor: c.cap ? '#dc2626' : '#1e293b', fillOpacity:1}).bindPopup(cityTxt(c)).bindTooltip(esc(c.name), {permanent: !!c.cap, direction:'right', offset:[7,0], className:'lbl'}).addTo(groups.cities);
  for (const p of PARKS) L.marker([p.lat, p.lon], {icon:parkIcon(), pane:'points'}).bindPopup(parkTxt(p)).bindTooltip(esc(p.name), {direction:'right', offset:[10,0], className:'lbl'}).addTo(groups.parks);
  for (const s of D.streets){
    const pl = L.polyline(s.lines, {pane:'streets', color: s.kind==='agua' ? '#0891b2' : s.kind==='tren' ? '#57534e' : s.kind==='autopista' ? '#7c3aed' : '#2563eb', dashArray: s.kind==='tren' ? '8 6' : null, weight:4, opacity:.75});
    pl.bindPopup(`<h4>${esc(s.name)}</h4><p>${esc(s.hint)}</p><p class="muted">${s.comunas.map(esc).join(', ')}</p>${photoHtml('s:'+s.name)}`, {maxWidth:280});
    pl.on('mouseover', () => pl.setStyle({weight:7, opacity:1})); pl.on('mouseout', () => pl.setStyle({weight:4, opacity:.75}));
    if (s.tr) pl.setPopupContent(`<h4>${esc(s.name)}</h4><p>${esc(s.hint)}</p>${tramosHtml(s)}${photoHtml('s:'+s.name)}`);
    (s.kind === 'tren' ? groups.tren : groups.streets).addLayer(pl);
  }
  drawMetro(groups.metro, {dots:false});
  for (const s of stations) L.circleMarker([s.lat,s.lon], {pane:'metro', radius:5, color:'#fff', weight:2, fillColor:LINES[s.lines[0]].color, fillOpacity:1})
    .bindPopup(`<h4>${esc(s.name)}</h4><p>${s.lines.map(linePill).join('')}</p><p class="muted">${esc(s.comuna)}</p>`).addTo(groups.metro);
  const CAT_COLORS = ['#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#64748b','#0f766e','#a16207','#4b5563'];
  const lmMarkers = D.landmarks.filter(l => !l.metro).map(l => ({l, m: L.circleMarker([l.lat,l.lon], {pane:'points', radius:6, color:'#fff', weight:2, fillColor:CAT_COLORS[CATS.indexOf(l.cat)%CAT_COLORS.length], fillOpacity:1})
    .bindPopup(`<h4>${esc(l.name)}</h4><p>${esc(l.cat)} · <b>${esc(l.comuna)}</b></p><p class="muted">${esc(l.desc||'')}</p>${l.car ? `<p><b>Qué se estudia:</b> ${esc(l.car)}</p>` : ''}${photoHtml('l:'+l.name)}`, {maxWidth:280})}));
  const refreshLm = () => { groups.lm.clearLayers(); lmMarkers.forEach(({l,m}) => { if (st.cats.includes(l.cat)) groups.lm.addLayer(m); }); };
  refreshLm();
  const apply = () => { setRelief(st.relief); for (const k of ['com','names','metro','streets','lm','cerros','zones','tren','micros','regs','cities','parks']) { if (st[k]) layer.addLayer(groups[k]); else layer.removeLayer(groups[k]); }
    const wantCh = st.regs || st.cities || st.parks; if (wantCh !== chileOn){ setChile(wantCh); if (wantCh) fitChile(); }
    if (curTiles!=='plain') setTiles(st.names ? 'streets' : 'labels'); store.set('explore', st); };
  const searchItems = [
    ...comunas.map(f => ({t:f.properties.name, k:'Comuna', go:()=>{ fit(boundsOfFeatures([f]), 14); }})),
    ...D.landmarks.map(l => ({t:l.name, k:l.cat, go:()=>{ map.setView([l.lat,l.lon], 15); setTimeout(()=>{ if (!st.lm){ st.lm=true; $('#ex-lm').checked=true; } if (!st.cats.includes(l.cat)){ st.cats.push(l.cat); refreshLm(); } apply(); lmMarkers.find(x=>x.l===l).m.openPopup(); }, 300); }})),
    ...D.streets.map(s => ({t:s.name, k:'Calle', go:()=>{ if (!st.streets){ st.streets=true; $('#ex-streets').checked=true; apply(); } fit(L.latLngBounds(s.bb).pad(0.1), 15);
       const hl = L.polyline(s.lines, {pane:'routes', color:'#f59e0b', weight:8, opacity:.9}).addTo(layer); setTimeout(()=>layer.removeLayer(hl), 4000); }})),
    ...cerros.map(c => ({t:c.name, k:'Cerro', go:()=>{ if (!st.cerros){ st.cerros=true; $('#ex-cerros').checked=true; $('#ex-cerros').parentElement.classList.add('on'); apply(); } map.setView([c.lat,c.lon], c.tipo==='Cordillera'?11:13); }})),
    ...stations.map(s => ({t:'Metro '+s.name, k:s.lines.join('/'), go:()=>{ if (!st.metro){ st.metro=true; $('#ex-metro').checked=true; apply(); } map.setView([s.lat,s.lon], 15); }}))
  ];
  showPanel(`<div class="q-prompt" style="margin-top:0">Explora el mapa</div>
    <input type="search" id="ex-q" placeholder="Buscar comuna, lugar, calle o estación…" list="ex-list" autocomplete="off">
    <datalist id="ex-list">${searchItems.map(s => `<option value="${esc(s.t)}">${esc(s.k)}</option>`).join('')}</datalist>
    <div class="chips" style="margin-top:10px">
      ${[['com','Comunas'],['names','Nombres comunas'],['metro','Metro'],['streets','Calles principales'],['lm','Lugares'],['zones','Barrios (perímetros)'],['cerros','Cerros'],['tren','Tren'],['micros','Micros importantes'],['regs','Chile: regiones'],['cities','Chile: ciudades'],['parks','Chile: parques nacionales'],['relief','Relieve']].map(([k,t]) => `<label class="chip ${st[k]?'on':''}"><input type="checkbox" id="ex-${k}" ${st[k]?'checked':''}>${t}</label>`).join('')}
    </div>
    <div id="ex-cats" style="margin-top:10px;${st.lm?'':'display:none'}"><div class="muted" style="font-size:12.5px;margin-bottom:4px">Categorías de lugares</div><div class="chips">
      ${CATS.map((c,i) => `<label class="chip ${st.cats.includes(c)?'on':''}"><input type="checkbox" data-cat="${esc(c)}" ${st.cats.includes(c)?'checked':''}><span class="dot" style="background:${CAT_COLORS[i%CAT_COLORS.length]}"></span>${esc(c)}</label>`).join('')}
    </div></div>
    <div class="row" style="margin-top:10px"><button class="btn sec small" id="ex-tiles">Mapa sin nombres</button><button class="btn sec small" id="ex-hide">Ocultar panel</button></div>
    <p class="muted" style="font-size:12px;margin-bottom:0">Toca cualquier comuna, calle, estación o lugar para ver su info.</p>`);
  panel.querySelectorAll('.chip input').forEach(inp => inp.onchange = () => {
    inp.parentElement.classList.toggle('on', inp.checked);
    if (inp.dataset.cat){ const c = inp.dataset.cat; st.cats = inp.checked ? [...st.cats, c] : st.cats.filter(x=>x!==c); refreshLm(); }
    else { const k = inp.id.slice(3); st[k] = inp.checked; if (k==='lm') $('#ex-cats').style.display = inp.checked ? '' : 'none'; }
    apply();
  });
  $('#ex-q').onchange = e => { const it = searchItems.find(s => s.t.toLowerCase()===e.target.value.trim().toLowerCase()); if (it){ it.go(); if (innerWidth<=760) e.target.blur(); } };
  $('#ex-tiles').onclick = e => { const on = curTiles!=='plain'; setTiles(on ? 'plain' : (st.names ? 'streets' : 'labels')); e.target.textContent = on ? 'Mapa con nombres' : 'Mapa sin nombres'; };
  $('#ex-hide').onclick = () => { hidePanel(); showReopen(); };
  apply();
  if (!explore._fitted){ fitCity(); explore._fitted = true; }
  explore._cleanup = () => { map.off('zoomend', refreshNames); setRelief(false); };
}
let reopenCtl = null;
function showReopen(){
  const C = L.Control.extend({ options:{position:'bottomleft'}, onAdd(){ const b = L.DomUtil.create('button','maptoggle'); b.textContent='☰ Panel'; L.DomEvent.disableClickPropagation(b);
    b.onclick = () => { panel.classList.remove('hidden'); map.removeControl(reopenCtl); reopenCtl=null; }; return b; } });
  reopenCtl = new C().addTo(map);
}

// ---------- menú principal ----------
const GROUPS = [
  {g:'Comunas', em:'🗺️', d:'Ubica las comunas del Gran Santiago y aprende con cuáles limita cada una.'},
  {g:'Landmarks', em:'📍', d:`${D.landmarks.length} lugares: estadios, parques, malls, universidades, colegios, barrios, restaurantes y las estaciones de metro.`},
  {g:'Calles', em:'🛣️', d:`${QUIZ_STREETS.length} avenidas, autopistas y carreteras, más ríos y canales. Las que cambian de nombre muestran sus tramos.`},
  {g:'Ruteo', em:'🧭', d:`Arma rutas paso a paso: ${(D.steps||[]).length} en auto entre dos puntos cualquiera y ${(D.transit||[]).length} en micro y metro. En Explorar puedes ver los recorridos de micro más importantes.`},
  {g:'Chile', em:'🇨🇱', d:`Las 16 regiones y ${CH.cities.length} ciudades (con su población).`},
  {g:'Parques nacionales', em:'🌲', d:`Los ${(CH.parks||[]).length} parques nacionales: en qué región están y cómo se ven.`},
  {g:'Conexiones', em:'🔗', d:'Relaciona todo: cruces, calles de cada comuna, metro más cercano, comunas vecinas, puntos cardinales…'},
];
function mastery(mode){
  if (mode.study) return '';
  const items = mode.pool(); if (!items.length) return '';
  let m = 0, seen = 0; for (const it of items){ const s = stats[mode.id+':'+mode.key(it)]; if (s){ seen++; if (s.streak>=2) m++; } }
  return seen ? `${Math.round(m/items.length*100)}% dominado` : 'nuevo';
}
function goHome(){
  if (explore._cleanup){ explore._cleanup(); explore._cleanup = null; }
  if (reopenCtl){ map.removeControl(reopenCtl); reopenCtl = null; }
  quiz = null; clearInterval(hudTimer); clearLayer(); hidePanel(); map.removeControl(hintCtl); setRelief(false); setChile(false);
  title.textContent = 'NoTengoCalle.com'; hud.textContent = '';
  home.classList.remove('hidden');
  const catsSel = settings.cats || CATS;
  home.innerHTML = `<div class="wrap">
    <div class="hero"><h2>¿Dónde queda eso? 🏔️</h2><p>Practica comunas, lugares, calles, rutas y metro de Santiago. Lo que fallas te lo pregunta más seguido.</p></div>
    <div class="grid">
      <div class="card"><h3><span class="em">🔎</span>Explorar</h3><p>Mapa interactivo con comunas, metro, calles y lugares. Para estudiar antes de jugar.</p>
        <button class="btn" id="goExplore" style="width:100%">Abrir mapa</button></div>
      ${GROUPS.map(G => `<div class="card"><h3><span class="em">${G.em}</span>${G.g}</h3><p>${G.d}</p>${G.g==='Landmarks' ? `<div class="chips" id="setLines" style="margin-bottom:10px">${LINE_IDS.map(id => `<label class="chip ${selLines().includes(id)?'on':''}" style="${selLines().includes(id)?`background:${LINES[id].color};border-color:${LINES[id].color};color:#fff`:''}"><input type="checkbox" data-line="${id}" ${selLines().includes(id)?'checked':''}>${id}</label>`).join('')}<span class="muted" style="font-size:12px;align-self:center">← líneas de metro incluidas (categoría Metro)</span></div>` : ''}<div class="modes">
        ${MODES.filter(m => m.group===G.g).sort((a,b) => (b.id.startsWith('rs-')?1:0) - (a.id.startsWith('rs-')?1:0)).map(m => `<button class="mode" data-mode="${m.id}"><span><b>${esc(m.name)}</b><br><small>${esc(m.desc)}</small></span><span class="mastery">${mastery(m)}</span></button>`).join('')}
      </div></div>`).join('')}
    </div>
    <div class="grid settings">
      <div class="card"><h3><span class="em">⚙️</span>Ajustes</h3>
        <label for="setScope">Comunas incluidas</label>
        <select id="setScope"><option value="core">Gran Santiago (34 comunas)</option><option value="peri">Gran Santiago + periferia (Colina, Lampa, Padre Hurtado, Pirque, Buin…)</option><option value="all">Toda la Región Metropolitana (52)</option></select>
        <label for="setLen">Preguntas por ronda</label>
        <select id="setLen"><option>10</option><option>15</option><option>20</option><option>30</option><option value="999">Todas</option></select>
        <label>Categorías de landmarks</label>
        <div class="chips" id="setCats">${CATS.map(c => `<label class="chip ${catsSel.includes(c)?'on':''}"><input type="checkbox" data-cat="${esc(c)}" ${catsSel.includes(c)?'checked':''}>${esc(c)}</label>`).join('')}</div>
        <label class="chip ${settings.strict?'on':''}" style="margin-top:10px"><input type="checkbox" id="setStrict" ${settings.strict?'checked':''}>Modo estricto en landmarks (800 m en vez de 1,5 km)</label>
      </div>
      <div class="card"><h3><span class="em">➕</span>Mis calles</h3><p>Agrega calles que te importan a ti (la de tu casa, la de un amigo). Aparecen en los juegos de calles y se guardan solo en este navegador.</p><div id="myst"></div></div>
      <div class="card"><h3><span class="em">📊</span>Tu progreso</h3>${statsHtml()}
        <div class="row" style="margin-top:10px"><button class="btn sec small" id="resetStats">Borrar progreso</button></div></div>
    </div>
    <p class="foot">Mapas y datos: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL), mapa base © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / OpenMapTiles, rutas: <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a>, relieve: AWS Terrain Tiles, fotos: autores indicados en cada foto vía <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> y Mapillary. Datos generados el ${esc(D.built)}.</p>
  </div>`;
  $('#goExplore').onclick = explore; myStreetsUI();
  home.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startQuiz(MODES.find(m => m.id===b.dataset.mode)));
  $('#setLines').querySelectorAll('input').forEach(inp => inp.onchange = () => { const sel = [...$('#setLines').querySelectorAll('input:checked')].map(x => x.dataset.line);
    settings.lines = (!sel.length || sel.length===LINE_IDS.length) ? null : sel; saveSettings(); goHome(); });
  const sc = $('#setScope'); sc.value = settings.scope; sc.onchange = () => { settings.scope = sc.value; saveSettings(); goHome(); };
  const ln = $('#setLen'); ln.value = String(settings.len); ln.onchange = () => { settings.len = +ln.value; saveSettings(); };
  $('#setCats').querySelectorAll('input').forEach(inp => inp.onchange = () => {
    inp.parentElement.classList.toggle('on', inp.checked);
    const sel = [...$('#setCats').querySelectorAll('input:checked')].map(x => x.dataset.cat);
    settings.cats = sel.length===CATS.length ? null : sel; saveSettings();
  });
  $('#setStrict').onchange = e => { settings.strict = e.target.checked; e.target.parentElement.classList.toggle('on', e.target.checked); saveSettings(); };
  $('#resetStats').onclick = () => { if (confirm('¿Borrar todo tu progreso?')){ for (const k in stats) delete stats[k]; store.set('stats', stats); for (const k in bests) delete bests[k]; store.set('best', bests); goHome(); } };
}
const OVERPASS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
async function findStreet(name){
  const core = name.trim().replace(/^(avenida|av\.?|calle|pasaje|camino)\s+/i, '');
  const rx = core.replace(/[.*+?^${}()|[\]\\"]/g, '.').replace(/[aá]/gi,'[aáAÁ]').replace(/[eé]/gi,'[eéEÉ]').replace(/[ií]/gi,'[iíIÍ]').replace(/[oó]/gi,'[oóOÓ]').replace(/[uúü]/gi,'[uúüUÚ]').replace(/[nñ]/gi, m => /ñ/i.test(m) ? '[ñÑ]' : '[nN]');
  const q = `[out:json][timeout:25];way["highway"]["name"~"^(Avenida |Calle |Pasaje |Camino )?${rx}( Norte| Sur| Oriente| Poniente)?$",i](-33.75,-70.95,-33.25,-70.40);out geom tags;`;
  let ways = null;
  try { // Nominatim (OpenStreetMap): acepta consultas desde el navegador
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50&dedupe=0&countrycodes=cl&polygon_geojson=1&viewbox=-70.95,-33.25,-70.40,-33.75&bounded=1&q=' + encodeURIComponent(name.trim()));
    if (r.ok){ const J = await r.json(); const re = new RegExp('^(Avenida |Calle |Pasaje |Camino )?' + rx + '( Norte| Sur| Oriente| Poniente)?$', 'i');
      ways = J.filter(h => h.category === 'highway' && h.geojson && h.geojson.type === 'LineString' && !/^(footway|path|cycleway|steps|service)$/.test(h.type) && re.test(h.name || '')).map(h => ({n:h.name, l:h.geojson.coordinates.map(c => [+c[1].toFixed(5), +c[0].toFixed(5)])})); }
  } catch(e){}
  if (!ways || !ways.length){ let j = null;
    for (const u of OVERPASS){ try { const r = await fetch(u, {method:'POST', body:'data=' + encodeURIComponent(q), headers:{'Content-Type':'application/x-www-form-urlencoded'}}); if (r.ok){ j = await r.json(); break; } } catch(e){} }
    if (j) ways = j.elements.filter(e => e.geometry && !/^(footway|path|cycleway|steps|service)$/.test(e.tags.highway)).map(e => ({n:e.tags.name, l:e.geometry.map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)])}));
    else if (!ways) throw new Error('sin conexión con el servidor de mapas'); }
  // agrupar tramos cercanos (< 400 m) en una misma calle
  const par = ways.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
  for (let a = 0; a < ways.length; a++) for (let b = a+1; b < ways.length; b++){ if (f(a) === f(b)) continue;
    const A = ways[a].l, B = ways[b].l; if ([A[0], A[A.length-1]].some(p => distToPolyline(p, [B]) < 0.4) || [B[0], B[B.length-1]].some(p => distToPolyline(p, [A]) < 0.4)) par[f(a)] = f(b); }
  const g = {}; ways.forEach((w, i) => (g[f(i)] = g[f(i)] || []).push(w));
  return Object.values(g).map(ws => { const lines = ws.map(w => w.l); let len = 0; for (const l of lines) for (let i = 0; i < l.length-1; i++) len += km(l[i], l[i+1]);
    const cnt = {}; ws.forEach(w => cnt[w.n] = (cnt[w.n]||0) + w.l.length); const nm = Object.entries(cnt).sort((a,b) => b[1]-a[1])[0][0].replace(/^Avenida /, 'Av. ');
    return {name:nm, km:+len.toFixed(1), lines, comunas:comunasOfLines(lines)}; }).filter(c => c.km >= 0.15).sort((a,b) => b.km - a.km).slice(0, 8);
}
function myStreetsUI(){
  const box = $('#myst'); if (!box) return;
  const list = () => myStreets.length ? myStreets.map((m, i) => `<span class="chip on">${esc(m.name)} <small class="muted">${esc(m.comunas[0]||'')}</small> <a href="#" data-del="${i}" title="Quitar" style="text-decoration:none">✕</a></span>`).join('') : '<span class="muted" style="font-size:13px">Todavía no agregas ninguna.</span>';
  box.innerHTML = `<div class="row"><input type="text" id="mystQ" placeholder="Nombre de la calle (ej.: Las Nieves)" style="flex:1;min-width:180px"><button class="btn small" id="mystGo">Buscar</button></div><div id="mystRes" style="margin-top:8px"></div><div class="chips" style="margin-top:8px">${list()}</div>`;
  box.querySelectorAll('[data-del]').forEach(a => a.onclick = e => { e.preventDefault(); myStreets.splice(+a.dataset.del, 1); store.set('myStreets', myStreets); location.reload(); });
  const go = async () => { const v = $('#mystQ').value.trim(); if (v.length < 3) return; const res = $('#mystRes'); res.innerHTML = '<p class="muted">Buscando en OpenStreetMap…</p>';
    try { const c = await findStreet(v);
      if (!c.length){ res.innerHTML = '<p class="muted">No encontré ninguna calle con ese nombre en Santiago. Prueba con el nombre completo.</p>'; return; }
      res.innerHTML = '<p class="muted" style="margin:0 0 4px;font-size:13px">Elige cuál es:</p>' + c.map((x, i) => `<button class="mode" data-pick="${i}" style="margin-bottom:5px"><span><b>${esc(x.name)}</b><br><small>${esc(x.comunas.slice(0,3).join(', ') || 'fuera del Gran Santiago')} · ${String(x.km).replace('.',',')} km</small></span><span class="mastery">Agregar</span></button>`).join('');
      res.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const x = c[+b.dataset.pick];
        if (D.streets.some(s => s.name === x.name) && !confirm(`Ya hay una calle llamada "${x.name}" en el juego. ¿Agregar esta igual, con la comuna en el nombre?`)) return;
        if (D.streets.some(s => s.name === x.name)) x.name += ` (${x.comunas[0] || 'otra'})`;
        myStreets.push(x); store.set('myStreets', myStreets); location.reload(); });
    } catch(err){ res.innerHTML = `<p class="muted">No pude buscar (${esc(err.message)}). Intenta de nuevo en un rato.</p>`; } };
  $('#mystGo').onclick = go; $('#mystQ').onkeydown = e => { if (e.key === 'Enter') go(); };
}
function bestOf(id){ const ks = Object.keys(bests).filter(k => k.startsWith(id + ':')); if (!ks.length) return '—';
  const k = ks.sort((a,b) => bests[b].d - bests[a].d)[0], n = k.split(':').pop(); return `${bests[k].ok}/${n} · ${fmtTime(bests[k].ms)}`; }
function statsHtml(){
  const rows = MODES.map(m => { let n=0, ok=0; for (const k in stats) if (k.startsWith(m.id+':')){ n+=stats[k].n; ok+=stats[k].ok; } return {m, n, ok}; }).filter(r => r.n);
  if (!rows.length) return '<p class="muted">Todavía no juegas. ¡Parte por “Encuentra la comuna”!</p>';
  const weak = Object.entries(stats).filter(([,s]) => s.n>=2 && s.ok/s.n < 0.6).sort((a,b) => (a[1].ok/a[1].n)-(b[1].ok/b[1].n)).slice(0,10);
  return `<table class="stats"><tr><th>Modo</th><th>Respuestas</th><th>Acierto</th><th>Mejor ronda</th></tr>
    ${rows.map(r => `<tr><td>${esc(r.m.name)}</td><td>${r.n}</td><td>${Math.round(r.ok/r.n*100)}%</td><td>${bestOf(r.m.id)}</td></tr>`).join('')}</table>
    ${weak.length ? `<p class="muted" style="margin:10px 0 4px">Tus puntos débiles:</p><p style="margin:0;font-size:13.5px">${weak.map(([k]) => esc(k.split(':').slice(1).join(':'))).join(' · ')}</p>` : ''}`;
}

$('#btnHome').onclick = goHome;
window.addEventListener('resize', () => map.invalidateSize());
goHome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
