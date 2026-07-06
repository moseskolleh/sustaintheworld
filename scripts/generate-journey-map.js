// Regenerates assets/journey-map.svg — the world map behind the Journey section.
//
// Usage:  npm install d3-geo topojson-client world-atlas
//         node scripts/generate-journey-map.js
//
// The projected stop coordinates printed at the end must match the STOPS
// table in script.js (journey map section) if you change stops or projection.

const { geoNaturalEarth1, geoPath, geoGraticule } = require('d3-geo');
const topojson = require('topojson-client');
const fs = require('fs');
const path = require('path');
const land110 = require('world-atlas/land-110m.json');

const W = 1000, H = 500;
const projection = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
const geo = geoPath(projection);
// round coordinates to shrink the path string
const fmt = (d) => d.replace(/\d+\.\d+/g, (m) => (+m).toFixed(1));

const landPath = fmt(geo(topojson.feature(land110, land110.objects.land)));
const graticulePath = fmt(geo(geoGraticule().step([30, 30])()));
const spherePath = fmt(geo({ type: 'Sphere' }));

const stops = [
    { id: 'freetown',   name: 'Freetown',   lon: -13.2317, lat: 8.4657 },
    { id: 'changsha',   name: 'Changsha',   lon: 112.9388, lat: 28.2282 },
    { id: 'bonn',       name: 'Bonn',       lon: 7.0982,   lat: 50.7374 },
    { id: 'wageningen', name: 'Wageningen', lon: 5.6654,   lat: 51.9692 },
    { id: 'amsterdam',  name: 'Amsterdam',  lon: 4.9041,   lat: 52.3676 }
];
for (const s of stops) {
    const [x, y] = projection([s.lon, s.lat]);
    s.x = +x.toFixed(1);
    s.y = +y.toFixed(1);
}

const stopLabels = {
    freetown:   { dx: 0,   dy: 24, anchor: 'middle' },
    changsha:   { dx: 14,  dy: 5,  anchor: 'start' },
    bonn:       { dx: 10,  dy: 12, anchor: 'start' },
    wageningen: { dx: 10,  dy: 4,  anchor: 'start' },
    amsterdam:  { dx: -10, dy: -6, anchor: 'end' }
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="journey-map-svg" role="img" aria-label="World map tracing the journey from Freetown to Changsha, Bonn, Wageningen and Amsterdam">
<g id="mapScene">
<path class="map-sphere" d="${spherePath}"/>
<path class="map-graticule" d="${graticulePath}"/>
<path class="map-land" d="${landPath}"/>
`;

for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    // geoPath resamples LineStrings along great circles
    const arc = fmt(geo({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }));
    svg += `<path class="map-arc" id="mapArc${i}" pathLength="1" d="${arc}"/>\n`;
}

stops.forEach((s, i) => {
    const l = stopLabels[s.id];
    svg += `<g class="map-stop" id="mapStop${i}" data-stop="${s.id}">
<circle class="map-stop-halo" cx="${s.x}" cy="${s.y}" r="10"/>
<circle class="map-stop-dot" cx="${s.x}" cy="${s.y}" r="3.2"/>
<text class="map-stop-label" x="${s.x + l.dx}" y="${s.y + l.dy}" text-anchor="${l.anchor}">${s.name}</text>
</g>\n`;
});

svg += '</g>\n</svg>\n';
const out = path.join(__dirname, '..', 'assets', 'journey-map.svg');
fs.writeFileSync(out, svg);
console.log('written', out, (svg.length / 1024).toFixed(1) + ' KB');
console.log('stop pixels (sync with STOPS in script.js):');
stops.forEach(s => console.log(`  ${s.id}: x=${s.x} y=${s.y}`));
