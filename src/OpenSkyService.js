// src/OpenSkyService.js

// En production (Vercel), on appelle notre propre route /api/opensky
const OPENSKY_URL = '/api/opensky';

export async function fetchAirTraffic() {
    try {
        const response = await fetch(OPENSKY_URL);
        if (!response.ok) throw new Error('Erreur réseau OpenSky');
        
        // Sécurité : on vérifie qu'on reçoit bien du JSON
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('[OPENSKY] Réponse non JSON reçue (probablement limite atteinte).');
            return [];
        }

        const flights = (data.states || []).map(state => ({
            callsign: state[1] ? state[1].trim() : 'N/A',
            country: state[2] || 'Inconnu',
            lon: state[5],
            lat: state[6],
            alt: state[7] || 10000,
            velocity: state[9] ? Math.round(state[9] * 3.6) : 0
        })).filter(f => f.lat !== null && f.lon !== null);

        console.log(`%c[OPENSKY] ${flights.length} avions en vol récupérés.`, 'color: #00FF00');
        return flights;
    } catch (error) {
        console.error('[OPENSKY] Erreur de fetch:', error);
        return [];
    }
}