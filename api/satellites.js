import * as satellite from 'satellite.js';

export const config = {
  maxDuration: 30, // Laisse le temps de télécharger et calculer les TLE
};

export default async function handler(req, res) {
    try {
        // 1. Téléchargement des vraies données orbitales (Starlink)
        const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle', {
            headers: { 'User-Agent': 'Mozilla/5.0 (DigitalEarth)' }
        });
        if (!response.ok) throw new Error('Celestrak API error');
        
        const tleText = await response.text();
        const lines = tleText.trim().split('\n');
        const sats = [];
        
        // On limite à 500 satellites pour ne pas surcharger le navigateur
        const limit = Math.min(lines.length / 3, 500); 

        // 2. Calcul de la position pour chaque satellite
        for (let i = 0; i < limit * 3; i += 3) {
            const name = lines[i].trim();
            const tleLine1 = lines[i + 1];
            const tleLine2 = lines[i + 2];

            if (!tleLine1 || !tleLine2) continue;

            const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
            const date = new Date();
            const positionAndVelocity = satellite.propagate(satrec, date);
            const positionEci = positionAndVelocity.position;

            // Si le calcul ne renvoie pas de position, on passe au suivant
            if (!positionEci) continue;

            // 3. Conversion en Latitude / Longitude / Altitude
            const gmst = satellite.gstime(date);
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);

            sats.push({
                id: satrec.satnum,
                name: name,
                lat: positionGd.latitude * (180 / Math.PI),
                lon: positionGd.longitude * (180 / Math.PI),
                alt: positionGd.height, // Altitude en km
                velocity: positionAndVelocity.velocity ? Math.round(Math.sqrt(positionAndVelocity.velocity.x**2 + positionAndVelocity.velocity.y**2 + positionAndVelocity.velocity.z**2) * 3600) : 0
            });
        }

        // 4. Mise en cache du résultat pendant 1 minute sur Vercel (pour protégger Celestrak)
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
        res.status(200).json({ satellites: sats });
    } catch (error) {
        console.error('Satellite API error:', error);
        res.status(200).json({ satellites: [] });
    }
}