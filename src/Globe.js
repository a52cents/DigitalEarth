// src/Globe.js
import * as THREE from 'three';

export class Globe {
    constructor(scene) {
        this.scene = scene;
        this.radius = 5;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.initMaterials();
        this.createGlobe();
        this.createClouds();
        this.createAtmosphere();
        this.createGrid();
        
        this.setTheme('dark');
    }

    initMaterials() {
        this.darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x05050a,
            roughness: 1,
            metalness: 0.2
        });

        this.realMaterial = new THREE.MeshPhongMaterial({
            shininess: 25,
            bumpScale: 0.05
        });

        const textureLoader = new THREE.TextureLoader();
        
        textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 16;
                this.realMaterial.map = texture;
                this.realMaterial.needsUpdate = true;
            }
        );

        textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
            (texture) => {
                this.realMaterial.normalMap = texture;
                this.realMaterial.normalScale = new THREE.Vector2(0.8, 0.8);
                this.realMaterial.needsUpdate = true;
            }
        );

        textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
            (texture) => {
                this.realMaterial.specularMap = texture;
                this.realMaterial.specular = new THREE.Color(0x333344);
                this.realMaterial.needsUpdate = true;
            }
        );

        this.cloudMaterial = new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
            (texture) => {
                this.cloudMaterial.map = texture;
                this.cloudMaterial.alphaMap = texture;
                this.cloudMaterial.needsUpdate = true;
            }
        );

        this.wireMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
    }

    createGlobe() {
        const geometry = new THREE.SphereGeometry(this.radius, 128, 128);
        this.earth = new THREE.Mesh(geometry, this.darkMaterial);
        this.group.add(this.earth);
    }

    createClouds() {
        const geometry = new THREE.SphereGeometry(this.radius * 1.01, 128, 128);
        this.clouds = new THREE.Mesh(geometry, this.cloudMaterial);
        this.group.add(this.clouds);
    }

    createAtmosphere() {
        // RÉDUCTION : 1.08 au lieu de 1.15 pour un liseré fin et réaliste
        const geometry = new THREE.SphereGeometry(this.radius * 1.08, 64, 64);
        this.atmosphereMat = new THREE.ShaderMaterial({
            uniforms: { glowColor: { value: new THREE.Color(0x00FFFF) } },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                uniform vec3 glowColor;
                void main() {
                    // Ajustement de l'intensité pour qu'elle soit plus concentrée sur le bord
                    float intensity = pow(0.75 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
                    gl_FragColor = vec4(glowColor, 1.0) * intensity;
                }
            `,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        this.atmosphere = new THREE.Mesh(geometry, this.atmosphereMat);
        this.group.add(this.atmosphere);
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

    setTheme(theme) {
        this.grid.visible = false;
        this.atmosphere.visible = true;
        this.clouds.visible = false;

        switch (theme) {
            case 'dark':
                this.earth.material = this.darkMaterial;
                this.grid.visible = true;
                this.atmosphereMat.uniforms.glowColor.value.set(0x00FFFF);
                this.gridMat.color.set(0x00FFFF);
                break;
            case 'real':
                this.earth.material = this.realMaterial;
                this.clouds.visible = true;
                this.cloudMaterial.opacity = 0.4;
                this.atmosphereMat.uniforms.glowColor.value.set(0x3366ff);
                break;
            case 'wire':
                this.earth.material = this.wireMaterial;
                this.atmosphere.visible = false;
                this.grid.visible = true;
                this.gridMat.color.set(0x00FF00);
                break;
        }
    }

    update() {
        if (this.clouds.visible) {
            this.clouds.rotation.y += 0.00005;
        }
    }
}