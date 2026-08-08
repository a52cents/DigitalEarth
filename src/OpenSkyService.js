// src/OpenSkyService.js

const OPENSKY_URL = '/api/opensky';

export async function fetchAirTraffic() {
    try {
        const response = await fetch(OPENSKY_URL);
        if (!response.ok) throw new Error('Erreur réseau OpenSky');
        const data = await response.json();
        
        // La fonction serverless renvoie directement le tableau propre
        const flights = data.flights || [];

        console.log(`%c[OPENSKY] ${flights.length} avions en vol récupérés.`, 'color: #00FF00');
        return flights;
    } catch (error) {
        console.error('[OPENSKY] Erreur de fetch:', error);
        return [];
    }
}