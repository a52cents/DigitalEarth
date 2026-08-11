import * as satellite from 'satellite.js';

export const config = {
  maxDuration: 30, // Laisse le temps de télécharger et calculer les TLE
};

// Mémoire de la dernière bonne donnée reçue (survit tant que l'instance serverless reste chaude)
let lastGoodStarlinkData = [];
let lastGoodIssData = null;

// Détecte les réponses de throttle de Celestrak (texte au lieu de vraies lignes TLE)
function isThrottleResponse(text) {
    return text.includes('has not updated') || text.includes('No GP data');
}

// Fonction utilitaire pour calculer la position d'un satellite à partir de ses lignes TLE
function calculateSatPosition(tleLine1, tleLine2, name) {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const date = new Date();
    const positionAndVelocity = satellite.propagate(satrec, date);
    const positionEci = positionAndVelocity.position;

    if (!positionEci) return null;

    const gmst = satellite.gstime(date);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    return {
        id: satrec.satnum,
        name: name,
        lat: positionGd.latitude * (180 / Math.PI),
        lon: positionGd.longitude * (180 / Math.PI),
        alt: positionGd.height, // Altitude en km
        velocity: positionAndVelocity.velocity ? Math.round(Math.sqrt(positionAndVelocity.velocity.x**2 + positionAndVelocity.velocity.y**2 + positionAndVelocity.velocity.z**2) * 3600) : 0
    };
}

export default async function handler(req, res) {
    try {
        // --- 1. Téléchargement et calcul des Starlink ---
        const starlinkResponse = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle', {
            headers: { 'User-Agent': 'Mozilla/5.0 (DigitalEarth)' }
        });
        
        let sats = [];
        if (starlinkResponse.ok) {
            const tleText = await starlinkResponse.text();

            if (isThrottleResponse(tleText)) {
                // Celestrak nous redonne le même jeu de données : on garde le dernier bon résultat
                sats = lastGoodStarlinkData;
            } else {
                const lines = tleText.trim().split('\n');
                const limit = Math.min(lines.length / 3, 500);
                const freshSats = [];

                for (let i = 0; i < limit * 3; i += 3) {
                    const name = lines[i].trim();
                    const tleLine1 = lines[i + 1];
                    const tleLine2 = lines[i + 2];
                    if (!tleLine1 || !tleLine2) continue;

                    const satData = calculateSatPosition(tleLine1, tleLine2, name);
                    if (satData) freshSats.push(satData);
                }

                if (freshSats.length > 0) {
                    sats = freshSats;
                    lastGoodStarlinkData = freshSats;
                } else {
                    sats = lastGoodStarlinkData;
                }
            }
        } else {
            console.error('Starlink fetch failed:', starlinkResponse.status, starlinkResponse.statusText);
            sats = lastGoodStarlinkData;
        }

        // --- 2. Téléchargement et calcul de l'ISS (NORAD 25544) ---
        let issData = lastGoodIssData;
        const issResponse = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle', {
            headers: { 'User-Agent': 'Mozilla/5.0 (DigitalEarth)' }
        });
        
        if (issResponse.ok) {
            const issTleText = await issResponse.text();

            if (!isThrottleResponse(issTleText)) {
                const issLines = issTleText.trim().split('\n');
                if (issLines.length >= 3) {
                    const issName = issLines[0].trim();
                    const issTle1 = issLines[1];
                    const issTle2 = issLines[2];
                    const freshIss = calculateSatPosition(issTle1, issTle2, issName);
                    if (freshIss) {
                        issData = freshIss;
                        lastGoodIssData = freshIss;
                    }
                }
            }
        }

        // --- 3. Mise en cache et réponse ---
        // Aligné sur le vrai cycle de mise à jour de Celestrak (2h), avec marge de sécurité
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');
        res.status(200).json({ satellites: sats, iss: issData });
        
    } catch (error) {
        console.error('Satellite API error:', error);
        // En cas d'erreur, on renvoie la dernière bonne donnée connue plutôt que de vider l'affichage
        res.status(200).json({ satellites: lastGoodStarlinkData, iss: lastGoodIssData });
    }
}
