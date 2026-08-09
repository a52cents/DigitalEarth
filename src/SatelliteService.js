// src/SatelliteService.js

const SAT_URL = '/api/satellites';

export async function fetchSatellites() {
    try {
        const response = await fetch(SAT_URL);
        if (!response.ok) throw new Error('Erreur réseau Satellites');
        const data = await response.json();
        
        // La fonction serverless renvoie directement le tableau propre
        const satellites = data.satellites || [];

        console.log(`%c[CESTRAK] ${satellites.length} satellites Starlink récupérés.`, 'color: #FFD700');
        return satellites;
    } catch (error) {
        console.error('[CESTRAK] Erreur de fetch:', error);
        return [];
    }
}