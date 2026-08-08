// src/Earthquake.js
import * as THREE from 'three';

export class EarthquakeVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.activeEarthquakes = new Map();
        this.staticPoints = [];
        this.globeRadius = 5;
        
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

    // On ajoute le paramètre isRecent
    addEarthquake(lat, lon, mag, id, place, time, isRecent) {
        if (this.activeEarthquakes.has(id)) return;
        
        const position = this.latLonToVector3(lat, lon, this.globeRadius);
        const intensity = Math.max(0.2, mag - 1.5); // Ajusté pour les micro-séismes
        
        // 1. Le point fixe (subtil pour les petits, gros pour les grands)
        const pointGeo = new THREE.SphereGeometry(0.02 * intensity, 8, 8);
        const pointMat = new THREE.MeshBasicMaterial({ 
            color: 0xFFFFFF,
            blending: THREE.AdditiveBlending, 
            transparent: true,
            opacity: isRecent ? 1.0 : 0.6 // Les anciens sont plus transparents
        });
        const point = new THREE.Mesh(pointGeo, pointMat);
        point.position.copy(position).multiplyScalar(1.01);
        
        const userData = { 
            type: 'Séisme', 
            mag: mag, 
            lat: lat, 
            lon: lon, 
            place: place || 'Localisation inconnue', 
            time: time || null 
        };
        point.userData = userData;
        
        this.group.add(point);
        // Les points restent plus longtemps s'ils sont anciens (contexte historique)
        this.staticPoints.push({ mesh: point, ttl: isRecent ? 30000 : 300000 });
        
        // 2. Anneau et Faisceau SEULEMENT si c'est récent
        if (isRecent) {
            const ringGeo = new THREE.RingGeometry(0.05 * intensity, 0.06 * intensity, 32);
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
            this.group.add(ring);
            
            // Faisceau LASER FIN (radius top et bottom identiques et très petits)
            const beamHeight = 0.3 + (intensity * 0.5); 
            const beamGeo = new THREE.CylinderGeometry(0.005, 0.01, beamHeight, 6, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({ 
                color: 0xFFFFFF, 
                transparent: true, 
                opacity: 0.8, 
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            
            const normal = position.clone().normalize();
            beam.position.copy(position).add(normal.clone().multiplyScalar(beamHeight / 2));
            beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            beam.userData = userData; 
            
            this.group.add(beam);
            
            this.activeEarthquakes.set(id, { 
                ring, 
                point, 
                beam, 
                startTime: Date.now(), 
                intensity 
            });
        }
    }

    update(delta) {
        const now = Date.now();
        
        this.activeEarthquakes.forEach((eq, id) => {
            const elapsed = (now - eq.startTime) / 1000;
            const duration = 2.0; 
            
            if (elapsed > duration) {
                this.group.remove(eq.ring);
                this.group.remove(eq.beam);
                this.activeEarthquakes.delete(id);
            } else {
                const progress = elapsed / duration;
                const scale = 1 + (progress * eq.intensity * 4); 
                eq.ring.scale.set(scale, scale, scale);
                eq.ring.material.opacity = 1 - progress; 
                eq.beam.material.opacity = (1 - progress) * 0.8;
            }
        });

        this.staticPoints = this.staticPoints.filter(p => {
            p.ttl -= delta * 1000;
            if (p.ttl <= 0) {
                this.group.remove(p.mesh);
                return false;
            }
            const pulse = 1 + Math.sin(now * 0.01) * 0.2; 
            p.mesh.scale.set(pulse, pulse, pulse);
            return true;
        });
    }
}