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
import { fetchSatellites } from './src/SatelliteService.js';
import { SatelliteVisualizer } from './src/Satellites.js';

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

const clock = new THREE.Clock(); // Déplacé en haut pour être accessible partout

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
controls.maxDistance = 100;

let autoRotateTimeout;
const autoRotateCheckbox = document.getElementById('toggle-autorotate');

controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(autoRotateTimeout);
});
controls.addEventListener('end', () => {
    if (autoRotateCheckbox.checked) {
        autoRotateTimeout = setTimeout(() => { controls.autoRotate = true; }, 3000);
    }
});

// ==========================================
// 3b. INTRO CINÉMATIQUE (arrivée depuis l'espace)
// ==========================================
const introStartPos = new THREE.Vector3(22, 14, 78);
const introEndPos = camera.position.clone();
const INTRO_DURATION = 4; // secondes

camera.position.copy(introStartPos);
controls.enabled = false;
controls.autoRotate = false;

let introActive = true;
let introElapsed = 0;

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

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
// 5. LOGIQUE UI, EVENT LOG & VITAL SIGNS
// ==========================================
const hud = document.getElementById('hud');
let hudTimeout;
function showHUD() {
    hud.classList.remove('hidden');
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => { hud.classList.add('hidden'); }, 10000);
}

hud.classList.add('hidden');
document.addEventListener('mousemove', () => {
    if (!introActive) showHUD();
});

const clockElement = document.getElementById('clock');
function updateClock() {
    const now = new Date();
    clockElement.textContent = now.toISOString().substring(11, 19) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// --- NOUVEAU : MONITEUR DE SIGNES VITAUX ---
const valPulse = document.getElementById('val-pulse');
const valResp = document.getElementById('val-resp');
const valImmune = document.getElementById('val-immune');
const valNervous = document.getElementById('val-nervous');

// Variables pour l'animation ECG
const ecgCanvas = document.getElementById('ecg-canvas');
const ecgCtx = ecgCanvas.getContext('2d');
const ecgPoints = new Array(120).fill(12);
let heartbeatTimer = 0;
let currentBPM = 60; // Valeur par défaut

// Met à jour une valeur du moniteur et déclenche l'animation visuelle
function updateVitalSign(element, value) {
    if (!element) return;
    element.textContent = value;
    element.classList.remove('pulse-update');
    void element.offsetWidth; // Force le reflow pour relancer l'animation CSS
    element.classList.add('pulse-update');
}

// Système de déplacement de caméra (FlyTo) et de visée
let isFlying = false;
let targetCamPos = null;
let targetRing = null;
let targetRingStartTime = 0;

function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon) * (Math.PI / 180);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = -radius * Math.sin(phi) * Math.sin(theta);
    return new THREE.Vector3(x, y, z);
}

function flyTo(lat, lon) {
    const targetDistance = 8.5; 
    targetCamPos = latLonToVector3(lat, lon, targetDistance);
    
    isFlying = true;
    controls.autoRotate = false;
    autoRotateCheckbox.checked = false; 
    showHUD();

    if (targetRing) scene.remove(targetRing);
    const ringGeo = new THREE.RingGeometry(0.3, 0.35, 64);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 1,
        blending: THREE.AdditiveBlending
    });
    targetRing = new THREE.Mesh(ringGeo, ringMat);
    const ringPos = latLonToVector3(lat, lon, 5.05);
    targetRing.position.copy(ringPos);
    targetRing.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(targetRing);
    targetRingStartTime = clock.getElapsedTime();
}

const logContent = document.getElementById('log-content');
function addLogEntry(type, text, lat = null, lon = null) {
    const timeStr = new Date().toISOString().substring(11, 19);
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="time">${timeStr}</span> - ${text}`;
    
    if (lat !== null && lon !== null) {
        entry.addEventListener('click', () => flyTo(lat, lon));
    }
    
    logContent.prepend(entry); 
    
    while (logContent.children.length > 50) {
        logContent.removeChild(logContent.lastChild);
    }
}

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

const earthquakeViz = new EarthquakeVisualizer(scene);
const disasterViz = new DisasterVisualizer(scene);
const airTrafficViz = new AirTrafficVisualizer(scene);
const satelliteViz = new SatelliteVisualizer(scene);

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

const satToggle = document.getElementById('toggle-satellites');
if (satToggle) {
    satToggle.addEventListener('change', (e) => {
        satelliteViz.group.visible = e.target.checked;
        showHUD();
    });
}

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
// 5b. CAPTURE CINÉMATIQUE & LOCALISATION
// ==========================================
const captureBtn = document.getElementById('capture-btn');
const shutterFlash = document.getElementById('shutter-flash');
let captureRequested = false;

if (captureBtn) {
    captureBtn.addEventListener('click', () => {
        captureRequested = true;
        showHUD();
    });
}

function playShutterSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
}

function performCapture() {
    const sourceCanvas = renderer.domElement;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = sourceCanvas.width;
    outCanvas.height = sourceCanvas.height;
    const ctx = outCanvas.getContext('2d');

    ctx.drawImage(sourceCanvas, 0, 0, outCanvas.width, outCanvas.height);

    const vignette = ctx.createRadialGradient(
        outCanvas.width / 2, outCanvas.height / 2, outCanvas.height / 3,
        outCanvas.width / 2, outCanvas.height / 2, outCanvas.height / 1.1
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    const scale = outCanvas.width / 1920;

    ctx.shadowColor = 'rgba(0, 255, 255, 0.6)';
    ctx.shadowBlur = 8 * scale;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `${28 * scale}px "JetBrains Mono", monospace`;
    ctx.fillText('DIGITAL EARTH // LIVE', 30 * scale, 46 * scale);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 255, 255, 0.85)';
    ctx.font = `${16 * scale}px "JetBrains Mono", monospace`;
    const timeStr = new Date().toISOString().substring(0, 19).replace('T', ' ') + ' UTC';
    ctx.fillText(timeStr, 30 * scale, 46 * scale + 26 * scale);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `${14 * scale}px "JetBrains Mono", monospace`;
    ctx.fillText('digital-earth-nine.vercel.app', outCanvas.width - 30 * scale, outCanvas.height - 30 * scale);
    ctx.textAlign = 'left';

    const dataUrl = outCanvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `digital-earth-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    playShutterSound();
    if (shutterFlash) {
        shutterFlash.classList.add('active');
        setTimeout(() => shutterFlash.classList.remove('active'), 90);
    }
}

// --- GÉOLOCALISATION & ÉVÉNEMENT LE PLUS PROCHE ---
const activeEvents = []; 
const locateBtn = document.getElementById('locate-btn');
const distanceBadge = document.getElementById('distance-badge');
let distanceBadgeTimeout;

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function showDistanceBadge(text) {
    if (!distanceBadge) return;
    distanceBadge.textContent = text;
    distanceBadge.classList.add('visible');
    clearTimeout(distanceBadgeTimeout);
    distanceBadgeTimeout = setTimeout(() => {
        distanceBadge.classList.remove('visible');
    }, 5000); 
}

if (locateBtn) {
    locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showDistanceBadge("GÉOLOCALISATION NON SUPPORTÉE");
            return;
        }

        showDistanceBadge("RECHERCHE DE POSITION...");

        navigator.geolocation.getCurrentPosition((position) => {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;

            if (activeEvents.length === 0) {
                showDistanceBadge("AUCUN ÉVÉNEMENT CHARGÉ");
                return;
            }

            let closestEvent = null;
            let minDistance = Infinity;

            activeEvents.forEach(event => {
                const dist = getDistanceFromLatLonInKm(userLat, userLon, event.lat, event.lon);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestEvent = event;
                }
            });

            if (closestEvent) {
                flyTo(closestEvent.lat, closestEvent.lon);
                
                const distStr = minDistance < 1 ? `${(minDistance * 1000).toFixed(0)} M` : `${minDistance.toFixed(0)} KM`;
                showDistanceBadge(`ÉVÉNEMENT LE PLUS PROCHE — ${distStr}`);
            }
            // --- NOUVEAU : SUIVI DE L'ISS ---
const locateIssBtn = document.getElementById('locate-iss-btn');
if (locateIssBtn) {
    locateIssBtn.addEventListener('click', () => {
        const issPos = satelliteViz.getISSPosition();
        if (issPos) {
            // On s'assure que le groupe satellites est visible
            satelliteViz.group.visible = true;
            const satToggle = document.getElementById('toggle-satellites');
            if (satToggle) satToggle.checked = true;
            
            flyTo(issPos.lat, issPos.lon);
            showDistanceBadge("SUIVI ISS — STATION SPATIALE INTERNATIONALE");
        } else {
            showDistanceBadge("ISS NON ENCORE CHARGÉE...");
        }
    });
}
        }, (error) => {
            console.error("Erreur de géolocalisation:", error);
            showDistanceBadge("GÉOLOCALISATION REFUSÉE");
        });
    });
}

// ==========================================
// 6. INTÉGRATION DES DONNÉES
// ==========================================
let knownEarthquakeIds = new Set();
let isInitialEarthquakeLoad = true;

async function updateEarthquakes() {
    const earthquakes = await fetchEarthquakes();
    let recentCount = 0;
    
    earthquakes.forEach(eq => {
        if (!knownEarthquakeIds.has(eq.id)) {
            knownEarthquakeIds.add(eq.id);
            
            const isRecent = (Date.now() - eq.time) < 300000; 
            
            earthquakeViz.addEarthquake(eq.lat, eq.lon, eq.mag, eq.id, eq.place, eq.time, isRecent);
            activeEvents.push({ lat: eq.lat, lon: eq.lon, type: 'eq' });
            
            if (isRecent) {
                playEarthquakeSound(eq.mag);
                addLogEntry('earthquake', `SÉISME M${eq.mag} - ${eq.place}`, eq.lat, eq.lon);
            }
        }
    });

    if (isInitialEarthquakeLoad) {
        recentCount = earthquakes.filter(eq => (Date.now() - eq.time) < 7200000).length;
        if (recentCount > 0) {
            addLogEntry('earthquake', `${recentCount} SÉISMES RÉCENTS (2H)`);
        }
        isInitialEarthquakeLoad = false;
    }

    // --- CALCUL DU POULS (BPM) ---
    // On compte les séismes significatifs (M >= 2.5) des 2 dernières heures (7200000 ms)
    const twoHoursAgo = Date.now() - 7200000;
    const significantRecentEq = earthquakes.filter(eq => eq.time > twoHoursAgo && eq.mag >= 2.5).length;
    
    // Formule: Base 40 BPM + 5 BPM par séisme récent significatif. Clamp entre 40 et 140.
    const bpm = Math.min(140, 40 + (significantRecentEq * 5));
    currentBPM = bpm;
    updateVitalSign(valPulse, bpm);
}
updateEarthquakes();
setInterval(updateEarthquakes, 300000);

let previousDisasterIds = new Set();
let isInitialDisasterLoad = true;

async function updateDisasters() {
    const disasters = await fetchDisasters();
    const currentDisasterIds = new Set();
    let newAlertsCount = 0;
    
    disasters.forEach(d => {
        currentDisasterIds.add(d.id);
        if (!previousDisasterIds.has(d.id)) {
            disasterViz.addDisaster(d.lat, d.lon, d.alert, d.id, d.name, d.type, d.date, d.source);
            playDisasterSound(d.alert);
            newAlertsCount++;
            activeEvents.push({ lat: d.lat, lon: d.lon, type: 'dis' });
            
            if (!isInitialDisasterLoad) {
                addLogEntry('disaster', `ALERTE ${d.alert.toUpperCase()} - ${d.name}`, d.lat, d.lon);
            }
        }
    });
    
    if (isInitialDisasterLoad && newAlertsCount > 0) {
        addLogEntry('disaster', `${newAlertsCount} ALERTES ACTIVES DÉTECTÉES`);
        isInitialDisasterLoad = false;
    }
    
    previousDisasterIds.forEach(id => {
        if (!currentDisasterIds.has(id)) disasterViz.removeDisaster(id);
    });
    previousDisasterIds = currentDisasterIds;

    // --- CALCUL DU SYSTÈME IMMUNITAIRE ---
    const redAlerts = disasters.filter(d => d.alert.toLowerCase() === 'red').length;
    const orangeAlerts = disasters.filter(d => d.alert.toLowerCase() === 'orange').length;
    
    let immuneStatus = "FAIBLE";
    if (redAlerts >= 3) immuneStatus = "CRITIQUE";
    else if (redAlerts > 0 || orangeAlerts >= 5) immuneStatus = "ÉLEVÉE";
    else if (orangeAlerts > 0) immuneStatus = "MODÉRÉE";
    
    updateVitalSign(valImmune, immuneStatus);
}
updateDisasters();
setInterval(updateDisasters, 900000);

async function updateAirTraffic() {
    const flights = await fetchAirTraffic();
    if (flights.length > 0) airTrafficViz.updateFlights(flights);

    // --- CALCUL DE LA RESPIRATION ---
    // Formule: Base 8 resp/min + 1 par tranche de 1000 vols. Clamp entre 8 et 25.
    const resp = Math.min(25, Math.max(8, 8 + Math.floor(flights.length / 1000)));
    updateVitalSign(valResp, resp);
}
updateAirTraffic();
setInterval(updateAirTraffic, 120000);

// Mise à jour des Satellites + ISS
let isInitialSatLoad = true;
async function updateSatellites() {
    const satData = await fetchSatellites();
    if (satData.satellites && satData.satellites.length > 0) {
        satelliteViz.updateSatellites(satData.satellites);
        
        // --- CALCUL DU SYSTÈME NERVEUX ---
        updateVitalSign(valNervous, satData.satellites.length);
    }
    if (satData.iss) {
        satelliteViz.updateISS(satData.iss);
        if (isInitialSatLoad) {
            addLogEntry('sat', `STATION SPATIALE INTERNATIONALE (ISS) DÉTECTÉE`);
            isInitialSatLoad = false;
        }
    }
}
updateSatellites();
setInterval(updateSatellites, 60000);

// ==========================================
// 6b. EASTER EGG : L'OVNI
// ==========================================
let ufo = null;
let ufoTrail = null;
let ufoStartTime = 0;
let nextUfoTime = clock.getElapsedTime() + (120 + Math.random() * 120);

function spawnUFO() {
    const ufoGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const ufoMat = new THREE.MeshBasicMaterial({ 
        color: 0xFF0000, 
        transparent: true, 
        opacity: 1,
        blending: THREE.AdditiveBlending
    });
    ufo = new THREE.Mesh(ufoGeo, ufoMat);
    
    const startSide = Math.random() > 0.5 ? 1 : -1;
    const startY = (Math.random() - 0.5) * 20;
    const startZ = (Math.random() - 0.5) * 20;
    ufo.position.set(startSide * 30, startY, startZ);
    
    ufo.userData.direction = new THREE.Vector3(-startSide, 0, 0).normalize();
    ufo.userData.type = 'ufo';
    
    scene.add(ufo);
    
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(30 * 3); 
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({ 
        color: 0xFF0000, 
        transparent: true, 
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    ufoTrail = new THREE.Line(trailGeo, trailMat);
    scene.add(ufoTrail);
    
    ufoStartTime = clock.getElapsedTime();
}

function updateUFO(delta) {
    if (!ufo) return;
    
    const speed = 40;
    ufo.position.add(ufo.userData.direction.clone().multiplyScalar(speed * delta));
    
    const positions = ufoTrail.geometry.attributes.position.array;
    for (let i = positions.length - 3; i >= 3; i--) {
        positions[i] = positions[i - 3];
    }
    positions[0] = ufo.position.x;
    positions[1] = ufo.position.y;
    positions[2] = ufo.position.z;
    ufoTrail.geometry.attributes.position.needsUpdate = true;
    
    if (Math.abs(ufo.position.x) > 35) {
        scene.remove(ufo);
        scene.remove(ufoTrail);
        ufo.geometry.dispose();
        ufo.material.dispose();
        ufoTrail.geometry.dispose();
        ufoTrail.material.dispose();
        ufo = null;
        ufoTrail = null;
        nextUfoTime = clock.getElapsedTime() + (120 + Math.random() * 120); 
    }
}

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

    if (satelliteViz.group.visible && satelliteViz.pointsMesh) {
        const satHits = raycaster.intersectObject(satelliteViz.pointsMesh);
        satHits.forEach(h => intersects.push({ ...h, category: 'sat' }));
    }

        // L'ISS est raycastable si le groupe est visible OU si l'ISS existe indépendamment
    if (satelliteViz.issMesh && satelliteViz.issMesh.visible) {
        const issHits = raycaster.intersectObject(satelliteViz.issMesh);
        issHits.forEach(h => intersects.push({ ...h, category: 'iss' }));
    }
    if (ufo) {
        const ufoHits = raycaster.intersectObject(ufo);
        ufoHits.forEach(h => intersects.push({ ...h, category: 'ufo' }));
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
        } else if (hit.category === 'sat') {
            const sat = satelliteViz.satData[hit.index];
            if (sat) {
                html = `<strong>Satellite (Starlink)</strong>
                        <div>Nom: <b>${sat.name}</b></div>
                        <div>Altitude: ${sat.alt.toFixed(0)} km</div>
                        <div>Vitesse: ${sat.velocity} km/h</div>
                        <div>Lat: ${sat.lat.toFixed(2)}° | Lon: ${sat.lon.toFixed(2)}°</div>`;
            }
        } else if (hit.category === 'iss') {
            html = `<strong>Station Spatiale Internationale</strong>
                    <div>Nom: <b>ISS (ZARYA)</b></div>
                    <div>Altitude: ${data.alt.toFixed(0)} km</div>
                    <div>Vitesse: ${data.velocity} km/h</div>
                    <div>Lat: ${data.lat.toFixed(2)}° | Lon: ${data.lon.toFixed(2)}°</div>`;
        } else if (hit.category === 'ufo') {
            html = `<strong>??? NON IDENTIFIÉ ???</strong>
                    <div>Je veux croire...</div>
                    <div style="margin-top:5px; font-size:10px; opacity:0.6;">X-Files Easter Egg</div>`;
        }
        if (html) { tooltip.innerHTML = html; tooltip.style.display = 'block'; }
    } else {
        tooltip.style.display = 'none';
    }
}

// ==========================================
// 8. BOUCLE DE RENDU
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    
    controls.update();
    globe.update(); 
    syncSunDirection();
    earthquakeViz.update(delta);
    disasterViz.update(delta);
    airTrafficViz.update();
    satelliteViz.update();
    checkIntersections();

    // --- ANIMATION ECG (Électrocardiogramme) ---
    // Le timer s'incrémente plus ou moins vite selon le BPM réel
    heartbeatTimer += delta * (currentBPM / 60);
    if (heartbeatTimer >= 1.0) heartbeatTimer = 0;

    let y = 12; // Ligne plat
    // Si on est dans le pic du battement (10% du cycle), on monte puis on descend
    if (heartbeatTimer < 0.05) y = 2; 
    else if (heartbeatTimer < 0.1) y = 22; 

    ecgPoints.shift();
    ecgPoints.push(y);

    ecgCtx.clearRect(0, 0, 120, 24);
    ecgCtx.strokeStyle = '#00FFFF';
    ecgCtx.lineWidth = 1.5;
    ecgCtx.beginPath();
    ecgCtx.moveTo(0, ecgPoints[0]);
    for (let i = 1; i < ecgPoints.length; i++) {
        ecgCtx.lineTo(i, ecgPoints[i]);
    }
    ecgCtx.stroke();

    // Gestion de l'intro cinématique
    if (introActive) {
        introElapsed += delta;
        const t = Math.min(introElapsed / INTRO_DURATION, 1);
        camera.position.lerpVectors(introStartPos, introEndPos, easeOutCubic(t));

        if (t >= 1) {
            introActive = false;
            controls.enabled = true;
            controls.autoRotate = autoRotateCheckbox.checked;
            showHUD();
        }
    }

    // Gestion du déplacement fluide de la caméra
    if (isFlying && targetCamPos) {
        camera.position.lerp(targetCamPos, 0.05);
        if (camera.position.distanceTo(targetCamPos) < 0.1) {
            isFlying = false;
        }
    }

    // Gestion de l'anneau de visée temporaire
    if (targetRing) {
        const elapsedRing = elapsed - targetRingStartTime;
        const duration = 3.0; 
        
        if (elapsedRing > duration) {
            scene.remove(targetRing);
            targetRing.geometry.dispose();
            targetRing.material.dispose();
            targetRing = null;
        } else {
            const progress = elapsedRing / duration;
            const scale = 1 + (progress * 4); 
            targetRing.scale.set(scale, scale, scale);
            targetRing.material.opacity = 1 - progress; 
        }
    }

    // Gestion de l'OVNI
    if (!introActive) {
        if (!ufo && elapsed > nextUfoTime) {
            spawnUFO();
        }
        if (ufo) {
            updateUFO(delta);
        }
    }
    
    composer.render();

    if (captureRequested) {
        captureRequested = false;
        performCapture();
    }
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});