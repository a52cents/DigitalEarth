// src/Globe.js
import * as THREE from 'three';

// --- Sources des textures ---
// Toutes servies en local (public/textures) : même origine que l'app, donc
// aucun souci de CORS (les CDN d'images "grand public" comme solarsystemscope.com
// ne renvoient pas d'en-tête Access-Control-Allow-Origin, ce qui fait planter
// silencieusement le chargement dans un shader WebGL et retombe sur du blanc).
// Textures d'origine : Solar System Scope (CC-BY 4.0, basé sur NASA Blue Marble),
// redimensionnées 8K -> 4K pour un bon rapport netteté / poids.
const TEX = {
    day: '/textures/earth_day_4k.jpg',
    night: '/textures/earth_night_4k.jpg',
    clouds: '/textures/earth_clouds_4k.jpg',
    normal: '/textures/earth_normal_2k.jpg',
    specular: '/textures/earth_specular_2k.jpg'
};

// Texture 1x1 noire utilisée le temps que les vraies textures se chargent.
// Sans ça, un sampler2D non assigné retombe sur le blanc par défaut de Three.js,
// ce qui donne un flash / globe cramé pendant le chargement.
function createBlackPlaceholder() {
    const data = new Uint8Array([0, 0, 0, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
}

const EARTH_VERTEX_SHADER = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const EARTH_FRAGMENT_SHADER = `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform sampler2D cloudsTexture;
    uniform sampler2D specularTexture;
    uniform sampler2D normalTexture;
    uniform vec3 sunDirection;
    uniform vec3 atmosphereDayColor;
    uniform vec3 atmosphereTwilightColor;
    uniform float nightLightsIntensity;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 normal = normalize(vNormal);

        // Léger relief via la normal map (perturbation tangente approximative)
        vec3 normalSample = texture2D(normalTexture, vUv).rgb * 2.0 - 1.0;
        vec3 perturbedNormal = normalize(normal + normalSample * 0.15);

        float sunOrientation = dot(sunDirection, normal);

        // --- Mélange jour / nuit ---
        float dayMix = smoothstep(-0.25, 0.35, sunOrientation);
        vec3 dayColor = texture2D(dayTexture, vUv).rgb;
        vec3 nightColor = texture2D(nightTexture, vUv).rgb * nightLightsIntensity;
        vec3 color = mix(nightColor, dayColor, dayMix);

        // --- Nuages (plus visibles côté jour, légère présence côté nuit) ---
        vec4 cloudsSample = texture2D(cloudsTexture, vUv);
        float cloudVisibility = mix(0.15, 1.0, dayMix);
        float cloudsMix = clamp(cloudsSample.r * cloudVisibility, 0.0, 1.0);
        color = mix(color, vec3(1.0), cloudsMix * 0.85);

        // --- Spéculaire océan (reflet du soleil sur l'eau) ---
        float specularMask = texture2D(specularTexture, vUv).r;
        vec3 reflectDir = reflect(-sunDirection, perturbedNormal);
        float specAngle = max(dot(reflectDir, viewDirection), 0.0);
        float specular = pow(specAngle, 60.0) * specularMask * dayMix;
        color += vec3(1.0, 0.97, 0.9) * specular * 0.9;

        // --- Halo atmosphérique fondu sur le limbe (fresnel jour/crépuscule) ---
        float fresnel = pow(1.0 - clamp(dot(viewDirection, normal), 0.0, 1.0), 3.0);
        float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
        vec3 atmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor, atmosphereDayMix);
        color = mix(color, atmosphereColor, fresnel * 0.45 * dayMix);

        gl_FragColor = vec4(color, 1.0);
    }
`;

const ATMOSPHERE_VERTEX_SHADER = `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
    uniform vec3 sunDirection;
    uniform vec3 dayColor;
    uniform vec3 twilightColor;
    uniform float intensity;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 normal = normalize(vNormal);

        float sunOrientation = dot(sunDirection, normal);
        float dayMix = smoothstep(-0.5, 1.0, sunOrientation);
        vec3 glowColor = mix(twilightColor, dayColor, dayMix);

        float fresnel = pow(1.0 - clamp(dot(viewDirection, normal), 0.0, 1.0), 2.2);
        float edge = smoothstep(0.0, 1.0, fresnel);

        gl_FragColor = vec4(glowColor, edge * intensity);
    }
`;

export class Globe {
    constructor(scene) {
        this.scene = scene;
        this.radius = 5;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.sunDirection = new THREE.Vector3(1, 0.5, 1).normalize();

        this.initMaterials();
        this.createGlobe();
        this.createClouds();
        this.createAtmosphere();
        this.createGrid();
        this.createStarfield();

        this.setTheme('dark');
    }

    initMaterials() {
        const textureLoader = new THREE.TextureLoader();
        const maxAnisotropy = 16;

        this.darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x05050a,
            roughness: 1,
            metalness: 0.2
        });

        // --- Matériau "Real" : shader jour/nuit + spéculaire océan + city lights ---
        const blackPlaceholder = createBlackPlaceholder();
        this.realMaterial = new THREE.ShaderMaterial({
            vertexShader: EARTH_VERTEX_SHADER,
            fragmentShader: EARTH_FRAGMENT_SHADER,
            uniforms: {
                dayTexture: { value: blackPlaceholder },
                nightTexture: { value: blackPlaceholder },
                cloudsTexture: { value: blackPlaceholder },
                specularTexture: { value: blackPlaceholder },
                normalTexture: { value: blackPlaceholder },
                sunDirection: { value: this.sunDirection },
                atmosphereDayColor: { value: new THREE.Color(0x4db2ff) },
                atmosphereTwilightColor: { value: new THREE.Color(0xff8a3d) },
                nightLightsIntensity: { value: 2.4 }
            }
        });

        const loadColorTexture = (url, onLoad) => {
            textureLoader.load(url, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = maxAnisotropy;
                onLoad(texture);
                this.realMaterial.needsUpdate = true;
            });
        };
        const loadDataTexture = (url, onLoad) => {
            textureLoader.load(url, (texture) => {
                texture.anisotropy = maxAnisotropy;
                onLoad(texture);
                this.realMaterial.needsUpdate = true;
            });
        };

        loadColorTexture(TEX.day, (t) => { this.realMaterial.uniforms.dayTexture.value = t; });
        loadColorTexture(TEX.night, (t) => { this.realMaterial.uniforms.nightTexture.value = t; });
        loadDataTexture(TEX.clouds, (t) => { this.realMaterial.uniforms.cloudsTexture.value = t; });
        loadDataTexture(TEX.specular, (t) => { this.realMaterial.uniforms.specularTexture.value = t; });
        loadDataTexture(TEX.normal, (t) => { this.realMaterial.uniforms.normalTexture.value = t; });

        // --- Nuages (calque séparé, légèrement au-dessus de la surface) ---
        this.cloudMaterial = new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        loadColorTexture(TEX.clouds, (t) => {
            this.cloudMaterial.map = t;
            this.cloudMaterial.alphaMap = t;
            this.cloudMaterial.needsUpdate = true;
        });

        this.wireMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
    }

    // Sprite étoile net (coeur plein + chute rapide) : le halo vient du bloom
    // au rendu, pas d'un dégradé étalé dans la texture (source de flou).
    createStarSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.6, 'rgba(255,255,255,0.25)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(canvas);
    }

    createGlobe() {
        const geometry = new THREE.SphereGeometry(this.radius, 128, 128);
        this.earth = new THREE.Mesh(geometry, this.darkMaterial);
        this.group.add(this.earth);
    }

    createClouds() {
        const geometry = new THREE.SphereGeometry(this.radius * 1.012, 128, 128);
        this.clouds = new THREE.Mesh(geometry, this.cloudMaterial);
        this.group.add(this.clouds);
    }

    createAtmosphere() {
        const geometry = new THREE.SphereGeometry(this.radius * 1.1, 96, 96);
        this.atmosphereMat = new THREE.ShaderMaterial({
            vertexShader: ATMOSPHERE_VERTEX_SHADER,
            fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
            uniforms: {
                sunDirection: { value: this.sunDirection },
                dayColor: { value: new THREE.Color(0x4db2ff) },
                twilightColor: { value: new THREE.Color(0xff8a3d) },
                intensity: { value: 1.0 }
            },
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        this.atmosphere = new THREE.Mesh(geometry, this.atmosphereMat);
        this.group.add(this.atmosphere);

        // Halo interne fin, collé à la surface (transition douce texture -> atmosphère)
        this.rimMat = new THREE.ShaderMaterial({
            vertexShader: ATMOSPHERE_VERTEX_SHADER,
            fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
            uniforms: {
                sunDirection: { value: this.sunDirection },
                dayColor: { value: new THREE.Color(0x8fd3ff) },
                twilightColor: { value: new THREE.Color(0xffb066) },
                intensity: { value: 0.6 }
            },
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        const rimGeo = new THREE.SphereGeometry(this.radius * 1.015, 96, 96);
        this.rim = new THREE.Mesh(rimGeo, this.rimMat);
        this.group.add(this.rim);
    }

    createGrid() {
        const geometry = new THREE.SphereGeometry(this.radius * 1.001, 36, 18);
        this.gridMat = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            wireframe: true,
            transparent: true,
            opacity: 0.15
        });
        this.grid = new THREE.Mesh(geometry, this.gridMat);
        this.group.add(this.grid);
    }

    createStarfield() {
        // Champ d'étoiles procédural : réparti sur une coquille sphérique, tailles et
        // luminosités variées pour un effet naturel. Aucune texture externe requise
        // (fiable à 100%, ne dépend d'aucun tiers).
        const starCount = 6000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        // Quelques teintes réalistes (blanc dominant, un peu de bleuté/ambré)
        const tint = new THREE.Color();
        const tints = [0xffffff, 0xcfe3ff, 0xfff1d6];

        for (let i = 0; i < starCount; i++) {
            // Distribution uniforme sur une coquille sphérique (rayon variable = un peu de profondeur)
            const radius = 250 + Math.random() * 150;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // La majorité des étoiles restent discrètes ; ~8% sont plus brillantes
            // (le bloom les fera légèrement ressortir, comme des étoiles plus proches).
            const brightness = Math.random() < 0.08 ? 1.4 + Math.random() * 0.8 : 0.3 + Math.random() * 0.5;
            tint.set(tints[Math.floor(Math.random() * tints.length)]).multiplyScalar(brightness);
            colors[i * 3] = tint.r;
            colors[i * 3 + 1] = tint.g;
            colors[i * 3 + 2] = tint.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.1,
            map: this.createStarSprite(),
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            sizeAttenuation: false,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    setTheme(theme) {
        this.grid.visible = false;
        this.atmosphere.visible = true;
        this.rim.visible = true;
        this.clouds.visible = false;
        this.starfield.visible = true;

        switch (theme) {
            case 'dark':
                this.earth.material = this.darkMaterial;
                this.grid.visible = true;
                this.atmosphereMat.uniforms.dayColor.value.set(0x00FFFF);
                this.atmosphereMat.uniforms.twilightColor.value.set(0x00FFFF);
                this.rim.visible = false;
                this.gridMat.color.set(0x00FFFF);
                this.starfield.visible = true;
                break;
            case 'real':
                this.earth.material = this.realMaterial;
                this.clouds.visible = true;
                this.cloudMaterial.opacity = 0.85;
                this.atmosphereMat.uniforms.dayColor.value.set(0x4db2ff);
                this.atmosphereMat.uniforms.twilightColor.value.set(0xff8a3d);
                this.rim.visible = true;
                this.starfield.visible = true;
                break;
            case 'wire':
                this.earth.material = this.wireMaterial;
                this.atmosphere.visible = false;
                this.rim.visible = false;
                this.grid.visible = true;
                this.gridMat.color.set(0x00FF00);
                this.starfield.visible = true;
                break;
        }
    }

    update() {
        if (this.clouds.visible) {
            this.clouds.rotation.y += 0.00005;
        }
    }
}
