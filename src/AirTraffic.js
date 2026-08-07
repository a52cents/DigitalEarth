// src/AirTraffic.js
import * as THREE from 'three';

export class AirTrafficVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.globeRadius = 5.05;
        this.pointsMesh = null;
        this.clock = new THREE.Clock();
        
        // NOUVEAU : Un groupe pour contenir le trafic aérien (facilite l'affichage ON/OFF)
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    updateFlights(flights) {
        if (this.pointsMesh) {
            this.group.remove(this.pointsMesh); // MODIFICATION : On retire du groupe
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
        }

        if (flights.length === 0) return;

        this.flightData = flights;
        const positions = new Float32Array(flights.length * 3);
        
        for (let i = 0; i < flights.length; i++) {
            const flight = flights[i];
            const phi = (90 - flight.lat) * (Math.PI / 180);
            const theta = flight.lon * (Math.PI / 180);
            
            const radius = this.globeRadius + (flight.alt / 5000000); 
            const safeRadius = Math.max(5.05, radius);
            
            positions[i * 3] = safeRadius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = safeRadius * Math.cos(phi);
            positions[i * 3 + 2] = -safeRadius * Math.sin(phi) * Math.sin(theta);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const texture = this.createCircleTexture();

        const material = new THREE.PointsMaterial({
            size: 0.12, 
            color: 0xFF00FF,
            map: texture,
            transparent: true,
            opacity: 0.8, 
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.pointsMesh = new THREE.Points(geometry, material);
        this.group.add(this.pointsMesh); // MODIFICATION : On ajoute au groupe
    }

    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.1, 'rgba(255,0,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,0,255,0.4)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
    }

    update() {
        if (!this.pointsMesh) return;
        
        const elapsedTime = this.clock.getElapsedTime();
        const breathing = (Math.sin(elapsedTime * 1.2) + 1) / 2; 
        
        this.pointsMesh.material.opacity = 0.5 + (breathing * 0.3); 
        
        const scaleVal = 1 + (breathing * 0.01);
        this.pointsMesh.scale.set(scaleVal, scaleVal, scaleVal);
    }
}