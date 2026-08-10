// src/Satellites.js
import * as THREE from 'three';

export class SatelliteVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.globeRadius = 5;
        this.pointsMesh = null;
        this.issMesh = null;
        this.clock = new THREE.Clock();
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    latLonToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon) * (Math.PI / 180);
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = -radius * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
    }

    updateSatellites(satellites) {
        if (this.pointsMesh) {
            this.group.remove(this.pointsMesh);
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
        }

        if (satellites.length === 0) return;

        this.satData = satellites;
        const positions = new Float32Array(satellites.length * 3);
        
        for (let i = 0; i < satellites.length; i++) {
            const sat = satellites[i];
            const pos = this.latLonToVector3(sat.lat, sat.lon, this.globeRadius + 0.6 + (sat.alt / 1000000));
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const texture = this.createCircleTexture();

        const material = new THREE.PointsMaterial({
            size: 0.1,
            color: 0x00FF00, // Couleur Verte
            map: texture,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.pointsMesh = new THREE.Points(geometry, material);
        this.group.add(this.pointsMesh);
    }

    // Mise à jour de la position de l'ISS
    updateISS(issData) {
        if (this.issMesh) {
            this.group.remove(this.issMesh);
            this.issMesh.material.dispose();
        }

        if (!issData) return;

        // L'ISS est à ~400 km d'altitude, on la place un peu plus bas que les Starlink (550 km)
        const radius = this.globeRadius + 0.55 + (issData.alt / 1000000);
        const pos = this.latLonToVector3(issData.lat, issData.lon, radius);

        const texture = this.createISSTexture();
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffaa33, // Teinte orange chaude
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.issMesh = new THREE.Sprite(material);
        this.issMesh.position.copy(pos);
        this.issMesh.scale.set(1.2, 1.2, 1.2); // GROSSIE : de 0.5 à 1.2 pour bien la voir
        
        // On stocke les données pour le tooltip au survol et pour le flyTo
        this.issMesh.userData = { ...issData, type: 'iss' };

        this.group.add(this.issMesh);
    }

    // NOUVEAU : Renvoie les coordonnées actuelles de l'ISS pour le flyTo
    getISSPosition() {
        if (this.issMesh && this.issMesh.userData) {
            return { lat: this.issMesh.userData.lat, lon: this.issMesh.userData.lon };
        }
        return null;
    }

    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(0,255,0,1)');
        gradient.addColorStop(0.5, 'rgba(0,255,0,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
    }

    // Texture spéciale pour l'ISS (Halo orange/blanc intense)
    createISSTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; // Plus grande résolution pour un halo plus net
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.1, 'rgba(255,220,150,1)');
        gradient.addColorStop(0.3, 'rgba(255,150,0,0.8)');
        gradient.addColorStop(0.6, 'rgba(255,100,0,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    update() {
        const elapsedTime = this.clock.getElapsedTime();
        
        // Clignotement des Starlink
        if (this.pointsMesh) {
            const blink = (Math.sin(elapsedTime * 3) + 1) / 2; 
            this.pointsMesh.material.opacity = 0.5 + (blink * 0.4);
        }

        // Pulsation de l'ISS (plus lente et très amplifiée pour qu'elle crève l'écran)
        if (this.issMesh) {
            const pulse = (Math.sin(elapsedTime * 2) + 1) / 2;
            const scale = 1.1 + (pulse * 0.4); // Oscille entre 1.1 et 1.5
            this.issMesh.scale.set(scale, scale, scale);
            this.issMesh.material.opacity = 0.8 + (pulse * 0.2);
        }
    }
}