// src/GdacsService.js

// En production, on appelle notre route /api/gdacs
const EONET_URL = '/api/gdacs';

export async function fetchDisasters() {
    try {
        const response = await fetch(EONET_URL);
        if (!response.ok) throw new Error('Erreur réseau NASA EONET');
        const data = await response.json();
        
        const rawDisasters = (data.events || []).map(event => {
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

        // --- ALGORITHME DE CLUSTERING ---
        // On regroupe les événements situés à moins de ~1.5 degrés (~150km) les uns des autres
        const clusteredDisasters = [];
        const usedIds = new Set();

        for (let i = 0; i < rawDisasters.length; i++) {
            if (usedIds.has(rawDisasters[i].id)) continue;
            
            let current = { ...rawDisasters[i] };
            usedIds.add(current.id);
            
            for (let j = i + 1; j < rawDisasters.length; j++) {
                if (usedIds.has(rawDisasters[j].id)) continue;
                
                const dist = Math.sqrt(
                    Math.pow(current.lat - rawDisasters[j].lat, 2) + 
                    Math.pow(current.lon - rawDisasters[j].lon, 2)
                );
                
                // Si ils sont proches et du même type, on fusionne
                if (dist < 1.5 && current.type === rawDisasters[j].type) {
                    usedIds.add(rawDisasters[j].id);
                    current.name += ` / ${rawDisasters[j].name}`;
                    // On augmente virtuellement l'alerte vers le rouge si il y a un gros regroupement
                    if (current.alert === 'Green') current.alert = 'Orange';
                }
            }
            clusteredDisasters.push(current);
        }

        console.log(`%c[NASA EONET] ${clusteredDisasters.length} catastrophes uniques récupérées (sur ${rawDisasters.length} brutes).`, 'color: #FF8C00');
        return clusteredDisasters;
    } catch (error) {
        console.error('[NASA EONET] Erreur de fetch:', error);
        return [];
    }
}