// src/Satellites.js
import * as THREE from 'three';

export class SatelliteVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.globeRadius = 5;
        this.pointsMesh = null;
        this.clock = new THREE.Clock();
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
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
            const phi = (90 - sat.lat) * (Math.PI / 180);
            const theta = sat.lon * (Math.PI / 180);
            
            // Exagération visuelle de l'altitude (550 km) pour bien les séparer du globe et des avions
            const radius = this.globeRadius + 0.6 + (sat.alt / 1000000); 
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.cos(phi);
            positions[i * 3 + 2] = -radius * Math.sin(phi) * Math.sin(theta);
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

    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        
        // Halo vert fluo
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(0,255,0,1)');
        gradient.addColorStop(0.5, 'rgba(0,255,0,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
    }

    update() {
        if (!this.pointsMesh) return;
        
        // Petit effet de clignotement doux
        const elapsedTime = this.clock.getElapsedTime();
        const blink = (Math.sin(elapsedTime * 3) + 1) / 2; 
        this.pointsMesh.material.opacity = 0.5 + (blink * 0.4);
    }
}