// src/AirTraffic.js
import * as THREE from 'three';

export class AirTrafficVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.globeRadius = 5.05;
        this.pointsMesh = null;
        this.linesMesh = null; // NOUVEAU : Pour les traînées
        this.clock = new THREE.Clock();
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    updateFlights(flights) {
        // Nettoyage des anciens points
        if (this.pointsMesh) {
            this.group.remove(this.pointsMesh);
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
        }
        
        // Nettoyage des anciennes traînées
        if (this.linesMesh) {
            this.group.remove(this.linesMesh);
            this.linesMesh.geometry.dispose();
            this.linesMesh.material.dispose();
        }

        if (flights.length === 0) return;

        this.flightData = flights;
        
        const positions = new Float32Array(flights.length * 3);
        const trailPositions = new Float32Array(flights.length * 6); // 2 points par ligne (début et fin)
        const trailLength = 0.3; // Longueur visuelle de la traînée
        
        for (let i = 0; i < flights.length; i++) {
            const flight = flights[i];
            const phi = (90 - flight.lat) * (Math.PI / 180);
            const theta = flight.lon * (Math.PI / 180);
            
            const radius = this.globeRadius + (flight.alt / 5000000); 
            const safeRadius = Math.max(5.05, radius);
            
            const x = safeRadius * Math.sin(phi) * Math.cos(theta);
            const y = safeRadius * Math.cos(phi);
            const z = -safeRadius * Math.sin(phi) * Math.sin(theta);
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // --- CALCUL DE LA TRAÎNÉE (Trail) ---
            const pos = new THREE.Vector3(x, y, z);
            const normal = pos.clone().normalize();
            
            // Gestion des pôles pour éviter les erreurs de calcul de direction
            if (Math.abs(normal.y) > 0.99) {
                trailPositions[i * 6] = x;
                trailPositions[i * 6 + 1] = y;
                trailPositions[i * 6 + 2] = z;
                trailPositions[i * 6 + 3] = x;
                trailPositions[i * 6 + 4] = y - trailLength;
                trailPositions[i * 6 + 5] = z;
            } else {
                // Calcul des vecteurs tangents (Nord et Est) à la surface du globe
                const east = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
                const north = new THREE.Vector3().crossVectors(east, normal).normalize();
                
                // Orientation de l'avion (0 = Nord, 90 = Est)
                const headingRad = (flight.heading || 0) * Math.PI / 180;
                const dir = north.multiplyScalar(Math.cos(headingRad)).add(east.multiplyScalar(Math.sin(headingRad)));
                
                // Le point de fin de la traînée (derrière l'avion)
                const trailEnd = pos.clone().sub(dir.multiplyScalar(trailLength));
                
                trailPositions[i * 6] = x;
                trailPositions[i * 6 + 1] = y;
                trailPositions[i * 6 + 2] = z;
                trailPositions[i * 6 + 3] = trailEnd.x;
                trailPositions[i * 6 + 4] = trailEnd.y;
                trailPositions[i * 6 + 5] = trailEnd.z;
            }
        }

        // 1. Création des points (avions)
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const texture = this.createCircleTexture();

        const pointsMaterial = new THREE.PointsMaterial({
            size: 0.09,
            color: 0xFF3DF0,
            map: texture,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
        this.group.add(this.pointsMesh);

        // 2. Création des traînées (lignes)
        const linesGeometry = new THREE.BufferGeometry();
        linesGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        
        const linesMaterial = new THREE.LineBasicMaterial({
            color: 0xFF3DF0,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.linesMesh = new THREE.LineSegments(linesGeometry, linesMaterial);
        this.group.add(this.linesMesh);
    }

    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);

        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.22, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.35, 'rgba(255,61,240,1)');
        gradient.addColorStop(0.6, 'rgba(255,61,240,0.35)');
        gradient.addColorStop(1, 'rgba(255,61,240,0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    update() {
        if (!this.pointsMesh) return;
        
        const elapsedTime = this.clock.getElapsedTime();
        const breathing = (Math.sin(elapsedTime * 1.2) + 1) / 2; 
        
        const opacityVal = 0.5 + (breathing * 0.3);
        this.pointsMesh.material.opacity = opacityVal;
        this.linesMesh.material.opacity = opacityVal * 0.6; // Les traînées sont un peu plus discrètes
        
        const scaleVal = 1 + (breathing * 0.01);
        this.pointsMesh.scale.set(scaleVal, scaleVal, scaleVal);
        this.linesMesh.scale.set(scaleVal, scaleVal, scaleVal);
    }
}