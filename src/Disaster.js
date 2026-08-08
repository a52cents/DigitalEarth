// src/Disaster.js
import * as THREE from 'three';

export class DisasterVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.activeDisasters = new Map();
        this.globeRadius = 5.1;
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.textures = {
            Red: this.createHaloTexture('#FF0033'),
            Orange: this.createHaloTexture('#FF8800'),
            Green: this.createHaloTexture('#00FF88')
        };
        
        this.colors = {
            Red: 0xFF0033,
            Orange: 0xFF8800,
            Green: 0x00FF88
        };
    }

    createHaloTexture(colorHex) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        
        const r = parseInt(colorHex.slice(1, 3), 16);
        const g = parseInt(colorHex.slice(3, 5), 16);
        const b = parseInt(colorHex.slice(5, 7), 16);

        gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
        gradient.addColorStop(0.3, `rgba(${r},${g},${b},0.6)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        
        return new THREE.CanvasTexture(canvas);
    }

    latLonToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon) * (Math.PI / 180);
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = -radius * Math.sin(phi) * Math.sin(theta);
        
        return new THREE.Vector3(x, y, z);
    }

    addDisaster(lat, lon, alert, id, name, type, date, source) {
        if (this.activeDisasters.has(id)) return;

        const position = this.latLonToVector3(lat, lon, this.globeRadius);
        const alertKey = alert.charAt(0).toUpperCase() + alert.slice(1).toLowerCase();
        const texture = this.textures[alertKey] || this.textures.Green;
        const colorHex = this.colors[alertKey] || this.colors.Green;

        const size = alertKey === 'Red' ? 1.2 : (alertKey === 'Orange' ? 0.9 : 0.6);

        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide, 
            blending: THREE.AdditiveBlending
        });
        
        const halo = new THREE.Mesh(geometry, material);
        halo.position.copy(position);
        halo.lookAt(new THREE.Vector3(0, 0, 0));
        
        const userData = { 
            type: 'Alerte', 
            name: name || 'Inconnu', 
            alert: alert, 
            category: type || 'N/A',
            date: date || 'Date inconnue',
            source: source || 'Source inconnue'
        };
        halo.userData = userData;
        
        this.group.add(halo);
        
        // Faisceau LASER FIN (radius top 0.01, bottom 0.03) et moins haut
        const beamHeight = alertKey === 'Red' ? 1.0 : (alertKey === 'Orange' ? 0.7 : 0.5);
        const beamGeo = new THREE.CylinderGeometry(0.01, 0.03, beamHeight, 6, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ 
            color: colorHex, 
            transparent: true, 
            opacity: 0, 
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
        
        this.activeDisasters.set(id, { 
            mesh: halo, 
            beam: beam, 
            targetOpacity: 0.9,
            currentOpacity: 0, 
            state: 'fadeIn',
            baseSize: size,
            beamHeight: beamHeight
        });
    }

    removeDisaster(id) {
        if (!this.activeDisasters.has(id)) return;
        const disaster = this.activeDisasters.get(id);
        disaster.state = 'fadeOut';
        disaster.targetOpacity = 0;
    }

    update(delta) {
        const fadeSpeed = 0.02;
        
        this.activeDisasters.forEach((disaster, id) => {
            disaster.currentOpacity += (disaster.targetOpacity - disaster.currentOpacity) * fadeSpeed;
            disaster.mesh.material.opacity = disaster.currentOpacity;

            const time = Date.now() * 0.001;
            const pulse = 1 + Math.sin(time) * 0.15;
            disaster.mesh.scale.set(pulse, pulse, pulse);
            
            disaster.beam.material.opacity = disaster.currentOpacity * 0.6; 
            const heightPulse = disaster.beamHeight * (1 + Math.sin(time * 1.5) * 0.05);
            disaster.beam.scale.y = heightPulse / disaster.beamHeight;

            if (disaster.state === 'fadeOut' && disaster.currentOpacity < 0.01) {
                this.group.remove(disaster.mesh);
                this.group.remove(disaster.beam);
                disaster.mesh.geometry.dispose();
                disaster.mesh.material.dispose();
                disaster.beam.geometry.dispose();
                disaster.beam.material.dispose();
                this.activeDisasters.delete(id);
            }
        });
    }
}