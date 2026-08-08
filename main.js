import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Globe } from './src/Globe.js';
import { fetchEarthquakes } from './src/UsgsService.js';
import { EarthquakeVisualizer } from './src/Earthquake.js';
import { fetchDisasters } from './src/GdacsService.js';
import { DisasterVisualizer } from './src/Disaster.js';
import { fetchAirTraffic } from './src/OpenSkyService.js';
import { AirTrafficVisualizer } from './src/AirTraffic.js';

// ==========================================
// 1. CONFIGURATION DE BASE THREE.JS
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// ==========================================
// 2. LE GLOBE
// ==========================================
const globe = new Globe(scene);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// Le shader "Real" du globe a besoin de la direction du soleil à chaque frame
// (utile si la lumière est un jour amenée à bouger : cycle jour/nuit, etc.)
function syncSunDirection() {
    globe.sunDirection.copy(directionalLight.position).normalize();
}
syncSunDirection();

// ==========================================
// 2b. POST-PROCESSING (Bloom sélectif sur les éléments lumineux)
// ==========================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.2,   // strength
    0.4,   // radius
    0.82   // threshold : seuls les pixels vifs (lumières de nuit, points radar, atmosphère) brillent
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ==========================================
// 3. CONTRÔLES CAMÉRA
// ==========================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.minDistance = 8;
controls.maxDistance = 20;

let autoRotateTimeout;
const autoRotateCheckbox = document.getElementById('toggle-autorotate');

controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(autoRotateTimeout);
});
controls.addEventListener('end', () => {
    // Ne reprend l'auto-rotation que si l'interrupteur est coché
    if (autoRotateCheckbox.checked) {
        autoRotateTimeout = setTimeout(() => { controls.autoRotate = true; }, 3000);
    }
});

// ==========================================
// 4. AUDIO PROCÉDURAL
// ==========================================
let audioCtx;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const droneOscillator = audioCtx.createOscillator();
    droneOscillator.type = 'sine';
    droneOscillator.frequency.value = 50;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.05;
    droneOscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    droneOscillator.start();

    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.2;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.05;

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    whiteNoise.start();
    lfo.start();
}

function playEarthquakeSound(magnitude) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(150 - (magnitude * 10), audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(Math.min(1, magnitude / 5), audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
}

function playDisasterSound(alertLevel) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    const baseFreq = alertLevel === 'Red' ? 1000 : (alertLevel === 'Orange' ? 800 : 600);
    osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
}

document.body.addEventListener('click', initAudio, { once: true });

// ==========================================
// 5. LOGIQUE UI
// ==========================================
const hud = document.getElementById('hud');
let hudTimeout;
function showHUD() {
    hud.classList.remove('hidden');
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => { hud.classList.add('hidden'); }, 10000);
}
document.addEventListener('mousemove', showHUD);
showHUD();

const clockElement = document.getElementById('clock');
function updateClock() {
    const now = new Date();
    clockElement.textContent = now.toISOString().substring(11, 19) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// Gestion des boutons de thème
const themeButtons = document.querySelectorAll('#theme-selector button');
themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.getAttribute('data-theme');
        globe.setTheme(theme);
        showHUD();
    });
});

// NOUVEAU : Gestion du panneau de paramètres
const earthquakeViz = new EarthquakeVisualizer(scene);
const disasterViz = new DisasterVisualizer(scene);
const airTrafficViz = new AirTrafficVisualizer(scene);

document.getElementById('toggle-earthquakes').addEventListener('change', (e) => {
    earthquakeViz.group.visible = e.target.checked;
    showHUD();
});

document.getElementById('toggle-disasters').addEventListener('change', (e) => {
    disasterViz.group.visible = e.target.checked;
    showHUD();
});

document.getElementById('toggle-airtraffic').addEventListener('change', (e) => {
    airTrafficViz.group.visible = e.target.checked;
    showHUD();
});

autoRotateCheckbox.addEventListener('change', (e) => {
    controls.autoRotate = e.target.checked;
    if (!e.target.checked) clearTimeout(autoRotateTimeout);
    showHUD();
});

document.getElementById('rotation-speed').addEventListener('input', (e) => {
    controls.autoRotateSpeed = parseFloat(e.target.value);
    showHUD();
});

// ==========================================
// 6. INTÉGRATION DES DONNÉES
// ==========================================
let knownEarthquakeIds = new Set();

async function updateEarthquakes() {
    const earthquakes = await fetchEarthquakes();
    earthquakes.forEach(eq => {
        if (!knownEarthquakeIds.has(eq.id)) {
            knownEarthquakeIds.add(eq.id);
            const isRecent = true;
            if (isRecent) {
                earthquakeViz.addEarthquake(eq.lat, eq.lon, eq.mag, eq.id, eq.place, eq.time);
                playEarthquakeSound(eq.mag);
            }
        }
    });
}
updateEarthquakes();
setInterval(updateEarthquakes, 300000);

let previousDisasterIds = new Set();

async function updateDisasters() {
    const disasters = await fetchDisasters();
    const currentDisasterIds = new Set();
    disasters.forEach(d => {
        currentDisasterIds.add(d.id);
        if (!previousDisasterIds.has(d.id)) {
            disasterViz.addDisaster(d.lat, d.lon, d.alert, d.id, d.name, d.type, d.date, d.source);
            playDisasterSound(d.alert);
        }
    });
    previousDisasterIds.forEach(id => {
        if (!currentDisasterIds.has(id)) disasterViz.removeDisaster(id);
    });
    previousDisasterIds = currentDisasterIds;
}
updateDisasters();
setInterval(updateDisasters, 900000);

async function updateAirTraffic() {
    const flights = await fetchAirTraffic();
    if (flights.length > 0) airTrafficViz.updateFlights(flights);
}
updateAirTraffic();
setInterval(updateAirTraffic, 120000);

// ==========================================
// 7. RAYCASTING (TOOLTIP)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
raycaster.params.Points.threshold = 0.15; 

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY + 15) + 'px';
}
window.addEventListener('mousemove', onMouseMove, false);

function checkIntersections() {
    raycaster.setFromCamera(mouse, camera);
    const intersects = [];
    
    // On ne raycast que les groupes visibles
    if (earthquakeViz.group.visible) {
        const eqMeshes = earthquakeViz.staticPoints.map(p => p.mesh);
        const eqHits = raycaster.intersectObjects(eqMeshes);
        eqHits.forEach(h => intersects.push({ ...h, category: 'eq' }));
    }
    
    if (disasterViz.group.visible) {
        const disMeshes = Array.from(disasterViz.activeDisasters.values()).map(d => d.mesh);
        const disHits = raycaster.intersectObjects(disMeshes);
        disHits.forEach(h => intersects.push({ ...h, category: 'dis' }));
    }
    
    if (airTrafficViz.group.visible && airTrafficViz.pointsMesh) {
        const airHits = raycaster.intersectObject(airTrafficViz.pointsMesh);
        airHits.forEach(h => intersects.push({ ...h, category: 'air' }));
    }
    
    intersects.sort((a, b) => a.distance - b.distance);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const data = hit.object.userData;
        let html = '';
        
        if (hit.category === 'eq') {
            const eqDate = data.time ? new Date(data.time).toISOString().substring(0, 19) + ' UTC' : 'N/A';
            html = `<strong>Séisme (USGS)</strong>
                    <div>Lieu: ${data.place}</div>
                    <div>Magnitude: <b>${data.mag}</b></div>
                    <div>Heure: ${eqDate}</div>
                    <div>Lat: ${data.lat.toFixed(2)}° | Lon: ${data.lon.toFixed(2)}°</div>`;
        } else if (hit.category === 'dis') {
            const disDate = data.date !== 'Date inconnue' ? new Date(data.date).toLocaleDateString('fr-FR') : 'N/A';
            html = `<strong>Alerte ${data.alert} (EONET)</strong>
                    <div>Type: ${data.category}</div>
                    <div>Nom: ${data.name}</div>
                    <div>Date: ${disDate}</div>
                    <div>Source: ${data.source}</div>`;
        } else if (hit.category === 'air') {
            const flight = airTrafficViz.flightData[hit.index];
            if (flight) {
                html = `<strong>Trafic Aérien (OpenSky)</strong>
                        <div>Vol: <b>${flight.callsign}</b></div>
                        <div>Pays: ${flight.country}</div>
                        <div>Altitude: ${(flight.alt / 0.3048).toFixed(0)} ft</div>
                        <div>Vitesse: ${flight.velocity} km/h</div>
                        <div>Lat: ${flight.lat.toFixed(2)}° | Lon: ${flight.lon.toFixed(2)}°</div>`;
            }
        }
        if (html) { tooltip.innerHTML = html; tooltip.style.display = 'block'; }
    } else {
        tooltip.style.display = 'none';
    }
}

// ==========================================
// 8. BOUCLE DE RENDU
// ==========================================
let clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    controls.update();
    globe.update(); // Fait tourner les nuages
    syncSunDirection();
    earthquakeViz.update(delta);
    disasterViz.update(delta);
    airTrafficViz.update();
    checkIntersections();
    
    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});