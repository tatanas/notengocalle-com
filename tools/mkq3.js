const L=require('./streetlist.js');
const re=L.map(x=>x[1]).join('|');
const q='[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"]["name"~"'+re+'",i](-33.72,-70.92,-33.28,-70.40);out geom tags;';
require('fs').writeFileSync('q3.txt',q);
