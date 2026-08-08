// src/GdacsService.js

// En production, on appelle notre route /api/gdacs
const EONET_URL = '/api/gdacs';

export async function fetchDisasters() {
    try {
        const response = await fetch(EONET_URL);
        if (!response.ok) throw new Error('Erreur réseau NASA EONET');
        const data = await response.json();
        
        const disasters = (data.events || []).map(event => {
            const geometry = event.geometry[0];
            let lat = null, lon = null;
            
            if (geometry.type === 'Point') {
                lon = geometry.coordinates[0];
                lat = geometry.coordinates[1];
            } else if (geometry.type === 'Polygon') {
                lon = geometry.coordinates[0][0][0];
                lat = geometry.coordinates[0][0][1];
            }

            const categoryId = event.categories[0].id;
            let alertLevel = 'Green';
            if (categoryId === 'severeStorms' || categoryId === 'seaLakeIce') {
                alertLevel = 'Red';
            } else if (categoryId === 'volcanoes' || categoryId === 'wildfires') {
                alertLevel = 'Orange';
            }

            const date = geometry.date || 'Date inconnue';
            const source = (event.sources && event.sources.length > 0) 
                ? event.sources[0].id 
                : 'Source inconnue';

            return {
                id: event.id,
                lat: lat,
                lon: lon,
                alert: alertLevel,
                type: categoryId,
                name: event.title,
                date: date,
                source: source
            };
        }).filter(d => d.lat !== null && d.lon !== null);

        console.log(`%c[NASA EONET] ${disasters.length} catastrophes actives récupérées.`, 'color: #FF8C00');
        return disasters;
    } catch (error) {
        console.error('[NASA EONET] Erreur de fetch:', error);
        return [];
    }
}