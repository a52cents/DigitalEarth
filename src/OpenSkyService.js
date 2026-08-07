// src/OpenSkyService.js

const OPENSKY_URL = '/opensky-api';

export async function fetchAirTraffic() {
    try {
        const response = await fetch(OPENSKY_URL);
        if (!response.ok) throw new Error('Erreur réseau OpenSky');
        const data = await response.json();
        
        // L'API OpenSky renvoie un tableau "states" où chaque item est un avion.
        // Index OpenSky : 1 = Callsign, 2 = Pays, 5 = Lon, 6 = Lat, 7 = Alt, 9 = Vitesse
        const flights = (data.states || []).map(state => ({
            callsign: state[1] ? state[1].trim() : 'N/A', // Nettoie les espaces, ou 'N/A' si vide
            country: state[2] || 'Inconnu',
            lon: state[5],
            lat: state[6],
            alt: state[7] || 10000, // Altitude par défaut si manquante
            velocity: state[9] ? Math.round(state[9] * 3.6) : 0 // Converti les m/s en km/h
        })).filter(f => f.lat !== null && f.lon !== null);

        console.log(`%c[OPENSKY] ${flights.length} avions en vol récupérés.`, 'color: #00FF00');
        return flights;
    } catch (error) {
        console.error('[OPENSKY] Erreur de fetch:', error);
        return [];
    }
}