// src/UsgsService.js

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

export async function fetchEarthquakes() {
    try {
        const response = await fetch(USGS_URL);
        if (!response.ok) throw new Error('Erreur réseau USGS');
        
        // Sécurité : on s'assure qu'on reçoit bien du JSON valide
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('[USGS] Réponse non JSON reçue.');
            return [];
        }

        // On mappe les données pour ne garder que l'essentiel
        const earthquakes = (data.features || []).map(f => ({
            id: f.id,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            depth: f.geometry.coordinates[2],
            mag: f.properties.mag,
            time: f.properties.time,
            place: f.properties.place || 'Localisation inconnue'
        })).filter(eq => eq.mag >= 2.5); // On ignore les micro-séismes

        console.log(`%c[USGS] ${earthquakes.length} séismes récupérés.`, 'color: #00FFFF');
        return earthquakes;
    } catch (error) {
        console.error('[USGS] Erreur de fetch:', error);
        return [];
    }
}