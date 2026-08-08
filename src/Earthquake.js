// src/Earthquake.js
import * as THREE from 'three';

export class EarthquakeVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.activeEarthquakes = new Map();
        this.staticPoints = [];
        this.globeRadius = 5;
        
        // NOUVEAU : Un groupe pour contenir tous les séismes (facilite l'affichage ON/OFF)
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

    addEarthquake(lat, lon, mag, id, place, time) {
        if (this.activeEarthquakes.has(id)) return;
        
        const position = this.latLonToVector3(lat, lon, this.globeRadius);
        const intensity = Math.max(0.5, mag - 2);
        
        // 1. Le point fixe (Épicentre lumineux)
        const pointGeo = new THREE.SphereGeometry(0.04 * intensity, 16, 16);
        const pointMat = new THREE.MeshBasicMaterial({ 
            color: 0xFFFFFF,
            blending: THREE.AdditiveBlending, 
            transparent: true
        });
        const point = new THREE.Mesh(pointGeo, pointMat);
        point.position.copy(position).multiplyScalar(1.01);
        
        point.userData = { 
            type: 'Séisme', 
            mag: mag, 
            lat: lat, 
            lon: lon, 
            place: place || 'Localisation inconnue', 
            time: time || null 
        };
        
        // MODIFICATION : On ajoute au groupe au lieu de la scène
        this.group.add(point);
        this.staticPoints.push({ mesh: point, ttl: 30000 });
        
        // 2. L'anneau de pulsation (Onde de choc)
        const ringGeo = new THREE.RingGeometry(0.1, 0.12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xFFFFFF, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(point.position);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        this.group.add(ring); // MODIFICATION : On ajoute au groupe
        
        this.activeEarthquakes.set(id, { 
            ring, 
            point, 
            startTime: Date.now(), 
            intensity 
        });
    }

    update(delta) {
        const now = Date.now();
        
        this.activeEarthquakes.forEach((eq, id) => {
            const elapsed = (now - eq.startTime) / 1000;
            const duration = 2.0; 
            
            if (elapsed > duration) {
                this.group.remove(eq.ring); // MODIFICATION : On retire du groupe
                this.activeEarthquakes.delete(id);
            } else {
                const progress = elapsed / duration;
                const scale = 1 + (progress * eq.intensity * 4); 
                eq.ring.scale.set(scale, scale, scale);
                eq.ring.material.opacity = 1 - progress; 
            }
        });

        this.staticPoints = this.staticPoints.filter(p => {
            p.ttl -= delta * 1000;
            if (p.ttl <= 0) {
                this.group.remove(p.mesh); // MODIFICATION : On retire du groupe
                return false;
            }
            const pulse = 1 + Math.sin(now * 0.01) * 0.2; 
            p.mesh.scale.set(pulse, pulse, pulse);
            return true;
        });
    }
}