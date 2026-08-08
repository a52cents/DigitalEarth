import { fetch as undiciFetch, Agent } from 'undici';

// On force le serveur Vercel à utiliser IPv4 et un timeout long
const agent = new Agent({
  connect: {
    family: 4, // Force IPv4
    timeout: 20000
  }
});

// On augmente le temps maximum d'exécution à 60 secondes
export const config = {
  maxDuration: 60,
};

let cachedToken = null;
let tokenExpiry = 0;

async function getOpenSkyToken() {
    if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await undiciFetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: params,
        dispatcher: agent // Utilisation de l'agent qui force l'IPv4
    });

    if (!response.ok) throw new Error('Token fetch failed');
    
    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    return cachedToken;
}

function generateFallbackFlights() {
    const flights = [];
    const hubs = [
        [40.71, -74.0], [51.51, -0.13], [48.85, 2.35], [35.68, 139.69],
        [1.35, 103.82], [25.20, 55.27], [-33.87, 151.21], [-23.55, -46.63]
    ];

    for (let i = 0; i < 3000; i++) {
        const start = hubs[Math.floor(Math.random() * hubs.length)];
        const end = hubs[Math.floor(Math.random() * hubs.length)];
        if (start === end) continue;

        const progress = Math.random();
        const lat = start[0] + (end[0] - start[0]) * progress + (Math.random() - 0.5) * 15;
        const lon = start[1] + (end[1] - start[1]) * progress + (Math.random() - 0.5) * 15;
        
        const dLon = (end[1] - lon) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(end[0] * Math.PI / 180);
        const x = Math.cos(lat * Math.PI / 180) * Math.sin(end[0] * Math.PI / 180) -
                  Math.sin(lat * Math.PI / 180) * Math.cos(end[0] * Math.PI / 180) * Math.cos(dLon);
        let heading = Math.atan2(y, x) * 180 / Math.PI;
        heading = (heading + 360) % 360;
        
        flights.push({
            callsign: `FLR${100 + i}`,
            country: 'N/A',
            lon: lon,
            lat: lat,
            alt: 9000 + Math.random() * 4000,
            velocity: 700 + Math.random() * 200,
            heading: heading
        });
    }
    return flights;
}

export default async function handler(req, res) {
    try {
        const token = await getOpenSkyToken();
        
        const response = await undiciFetch('https://opensky-network.org/api/states/all', {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            dispatcher: agent
        });

        if (response.status === 401) {
            cachedToken = null; 
        }
        if (!response.ok) throw new Error(`OpenSky API error: ${response.status}`);
        
        const data = await response.json();
        
        const flights = (data.states || []).map(state => ({
            callsign: state[1] ? state[1].trim() : 'N/A',
            country: state[2] || 'Inconnu',
            lon: state[5],
            lat: state[6],
            alt: state[7] || 10000,
            heading: state[10] || 0,
            velocity: state[9] ? Math.round(state[9] * 3.6) : 0
        })).filter(f => f.lat !== null && f.lon !== null);

        res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
        res.status(200).json({ flights });
        
    } catch (error) {
        console.error('OpenSky API inaccessible:', error.message);
        
        const fallbackFlights = generateFallbackFlights();
        res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
        res.status(200).json({ flights: fallbackFlights });
    }
}