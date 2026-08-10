// src/SatelliteService.js

const SAT_URL = '/api/satellites';

export async function fetchSatellites() {
    try {
        const response = await fetch(SAT_URL);
        if (!response.ok) throw new Error('Erreur réseau Satellites');
        const data = await response.json();
        
        // On renvoie l'objet complet contenant { satellites: [...], iss: {...} }
        if (!data.satellites) data.satellites = [];
        if (!data.iss) data.iss = null;

        console.log(`%c[CESTRAK] ${data.satellites.length} satellites Starlink récupérés.`, 'color: #FFD700');
        return data;
    } catch (error) {
        console.error('[CESTRAK] Erreur de fetch:', error);
        // En cas d'erreur, on renvoie bien la structure attendue par main.js
        return { satellites: [], iss: null };
    }
}