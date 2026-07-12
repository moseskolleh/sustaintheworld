// Regenerates assets/journey-map.svg — the map behind the Journey section.
//
// Usage:  npm install d3-geo topojson-client topojson-simplify world-atlas
//         node scripts/generate-journey-map.js
//
// Instead of the whole world (half of which the journey never touches),
// the projection is fitted to the region the route actually crosses —
// the Atlantic edge of West Africa across Europe to eastern China —
// so every stop gets real map resolution.
//
// The projected stop coordinates printed at the end must match the STOPS
// table in script.js (journey map section) if you change stops, region
// or projection.

const { geoNaturalEarth1, geoPath, geoGraticule } = require('d3-geo');
const topojson = require('topojson-client');
const simplify = require('topojson-simplify');
const fs = require('fs');
const path = require('path');
// 50m coastlines: the map zooms to ~6.5x over the Rhine delta, where the
// 110m outline turns the Netherlands into a blob. Variable simplification
// below keeps the extra detail affordable.
const land = require('world-atlas/land-50m.json');

const W = 1000;

// Crop window: [west, south] .. [east, north]. Densified so the fit
// follows graticule lines rather than great circles between corners, and
// wound clockwise-in-lon/lat — d3-geo's spherical winding rule makes the
// opposite winding mean "everything on Earth EXCEPT this window".
const WEST = -32, EAST = 126, SOUTH = -36, NORTH = 64;
const ring = [];
for (let lon = WEST; lon < EAST; lon += 2) ring.push([lon, NORTH]);
for (let lat = NORTH; lat > SOUTH; lat -= 2) ring.push([EAST, lat]);
for (let lon = EAST; lon > WEST; lon -= 2) ring.push([lon, SOUTH]);
for (let lat = SOUTH; lat < NORTH; lat += 2) ring.push([WEST, lat]);
ring.push([WEST, NORTH]);
const region = { type: 'Polygon', coordinates: [ring] };

const projection = geoNaturalEarth1()
    .rotate([-(WEST + EAST) / 2, 0])
    .fitWidth(W, region);
const geo = geoPath(projection);
const H = Math.ceil(geo.bounds(region)[1][1]);
// everything outside the crop window never renders — drop its path data
projection.clipExtent([[0, 0], [W, H]]);

// round coordinates to shrink the path string (1px ≈ 0.16°, invisible here)
const fmt = (d) => d.replace(/\d+\.\d+/g, (m) => Math.round(+m));

// Variable-resolution land: keep 50m detail where the map zooms deepest
// (the Rhine delta), simplify progressively harder with distance, and drop
// islets too small to ever cover a pixel. Weight boosting turns the single
// global simplification threshold into a distance-graded one.
const pre = simplify.presimplify(land);
const boosted = { ...pre, arcs: pre.arcs.map(arc => arc.map(([x, y, z]) => {
    const dx = (x - 5.5) * 0.62, dy = y - 52; // degrees from the Rhine delta
    const d = Math.sqrt(dx * dx + dy * dy);
    const f = d < 7 ? 1e4 : d < 18 ? 12 : 1;
    return [x, y, z * f];
})) };
const simplified = simplify.simplify(boosted, simplify.quantile(pre, 0.08));
const landGeom = topojson.feature(simplified, simplified.objects.land).features[0].geometry;
const landPolys = (landGeom.type === 'MultiPolygon' ? landGeom.coordinates : [landGeom.coordinates])
    .filter(c => geo.area({ type: 'Polygon', coordinates: c }) >= 2.5);
const landPath = fmt(geo({ type: 'MultiPolygon', coordinates: landPolys }));
const graticulePath = fmt(geo(geoGraticule().step([20, 20])()));

// Route stops — where the journey lived. Order matches the journey cards.
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

// Fieldwork sites — projects done on location, off the residence route.
// data-activate = index of the journey stop whose era they belong to.
const sites = [
    { id: 'wuppertal', name: 'Wuppertal', lon: 7.1508, lat: 51.2562, activate: 3 }
];
for (const s of sites) {
    const [x, y] = projection([s.lon, s.lat]);
    s.x = +x.toFixed(1);
    s.y = +y.toFixed(1);
}

const stopLabels = {
    freetown:   { dx: 0,   dy: 26,  anchor: 'middle' },
    changsha:   { dx: 16,  dy: 5,   anchor: 'start' },
    bonn:       { dx: 14,  dy: 14,  anchor: 'start' },
    wageningen: { dx: 16,  dy: 0,   anchor: 'start' },
    amsterdam:  { dx: -13, dy: -8,  anchor: 'end' }
};
const siteLabels = {
    wuppertal:  { dx: -12, dy: 4,   anchor: 'end' }
};

// Projection constants for runtime use (script.js places the visitor's
// "you are here" mark with the same Natural Earth math).
const k = projection.scale().toFixed(2);
const [ptx, pty] = projection.translate().map(v => +v.toFixed(2));
const rot = -(WEST + EAST) / 2;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="journey-map-svg" role="img" aria-label="Map tracing the journey from Freetown to Changsha, Bonn, Wageningen and Amsterdam, with fieldwork in Wuppertal" data-proj-k="${k}" data-proj-tx="${ptx}" data-proj-ty="${pty}" data-proj-rot="${rot}" data-crop="${WEST} ${SOUTH} ${EAST} ${NORTH}">
<g id="mapScene">
<path class="map-graticule" d="${graticulePath}"/>
<path class="map-land" d="${landPath}"/>
`;

for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    // geoPath resamples LineStrings along great circles
    const arc = fmt(geo({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }));
    svg += `<path class="map-arc" id="mapArc${i}" pathLength="1" d="${arc}"/>\n`;
}

// Labels carry their dot position + authored offset so script.js can
// counter-scale the offset as the map zooms (keeps labels hugging their
// markers instead of drifting away at high zoom).
const labelAttrs = (s, l) =>
    `x="${(s.x + l.dx).toFixed(1)}" y="${(s.y + l.dy).toFixed(1)}" data-cx="${s.x}" data-cy="${s.y}" data-dx="${l.dx}" data-dy="${l.dy}" text-anchor="${l.anchor}"`;

sites.forEach((s, i) => {
    const l = siteLabels[s.id];
    svg += `<g class="map-site" id="mapSite${i}" data-activate="${s.activate}">
<path class="map-site-mark" data-x="${s.x}" data-y="${s.y}" d="M 0 -3.4 L 3.4 0 L 0 3.4 L -3.4 0 Z" transform="translate(${s.x} ${s.y})"/>
<text class="map-site-label" ${labelAttrs(s, l)}>${s.name} · fieldwork</text>
</g>\n`;
});

stops.forEach((s, i) => {
    const l = stopLabels[s.id];
    const current = i === stops.length - 1;
    svg += `<g class="map-stop${current ? ' map-stop-current' : ''}" id="mapStop${i}" data-stop="${s.id}">
<circle class="map-stop-halo" cx="${s.x}" cy="${s.y}" r="10"/>
${current ? `<circle class="map-stop-ring" cx="${s.x}" cy="${s.y}" r="6.5"/>\n` : ''}<circle class="map-stop-dot" cx="${s.x}" cy="${s.y}" r="3.2"/>
<text class="map-stop-label" ${labelAttrs(s, l)}>${s.name}</text>
</g>\n`;
});

svg += '</g>\n</svg>\n';
const out = path.join(__dirname, '..', 'assets', 'journey-map.svg');
fs.writeFileSync(out, svg);
console.log('written', out, (svg.length / 1024).toFixed(1) + ' KB, viewBox 0 0', W, H);
console.log('stop pixels (sync with STOPS + VB_H in script.js):');
stops.forEach(s => console.log(`  ${s.id}: x=${s.x} y=${s.y}`));
sites.forEach(s => console.log(`  site ${s.id}: x=${s.x} y=${s.y}`));
