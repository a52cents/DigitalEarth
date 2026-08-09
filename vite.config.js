import { defineConfig, loadEnv } from 'vite'
import * as satellite from 'satellite.js';

export default defineConfig(({ mode }) => {
  // Charge les variables du fichier .env local
  const env = loadEnv(mode, process.cwd(), '');
  
  // Cache local pour le token OpenSky
  let localCachedToken = null;
  let localTokenExpiry = 0;

  // Cache local pour les satellites (pour éviter le ban IP de Celestrak)
  let cachedSats = null;
  let satsCacheTime = 0;

  async function getLocalOpenSkyToken() {
    if (localCachedToken && Date.now() < localTokenExpiry - 60000) return localCachedToken;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', env.OPENSKY_CLIENT_ID);
    params.append('client_secret', env.OPENSKY_CLIENT_SECRET);

    const response = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });
    
    const data = await response.json();
    localCachedToken = data.access_token;
    localTokenExpiry = Date.now() + (data.expires_in * 1000);
    return localCachedToken;
  }

  return {
    plugins: [
      {
        name: 'local-api-middleware',
        configureServer(server) {
          
          // Proxy local pour GDACS / NASA EONET (Limité à 500)
          server.middlewares.use('/api/gdacs', async (req, res) => {
            try {
              const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500');
              const data = await response.text();
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (error) {
              res.statusCode = 200;
              res.end(JSON.stringify({ events: [] }));
            }
          });

          // Proxy local pour OpenSky
          server.middlewares.use('/api/opensky', async (req, res) => {
            try {
              const token = await getLocalOpenSkyToken();
              const response = await fetch('https://opensky-network.org/api/states/all', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (response.status === 401) {
                  localCachedToken = null;
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ flights: [] }));
              }
              
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
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ flights }));
            } catch (error) {
              console.error(error);
              res.statusCode = 200;
              res.end(JSON.stringify({ flights: [] }));
            }
          });

          // Proxy local pour les Satellites (Celestrak)
          server.middlewares.use('/api/satellites', async (req, res) => {
            try {
              // Si on a des données en cache de moins de 5 minutes, on les renvoie direct
              if (cachedSats && Date.now() - satsCacheTime < 300000) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ satellites: cachedSats }));
              }

              const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle', {
                headers: { 
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/plain'
                }
              });
              
              if (!response.ok) {
                console.error(`[Vite Proxy] Celestrak a renvoyé l'erreur: ${response.status} ${response.statusText}`);
                if (cachedSats) {
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ satellites: cachedSats }));
                }
                throw new Error('Celestrak error');
              }
              
              const tleText = await response.text();
              const lines = tleText.trim().split('\n');
              const sats = [];
              const limit = Math.min(lines.length / 3, 500); 

              for (let i = 0; i < limit * 3; i += 3) {
                const name = lines[i].trim();
                const tleLine1 = lines[i + 1];
                const tleLine2 = lines[i + 2];

                if (!tleLine1 || !tleLine2) continue;

                const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
                const date = new Date();
                const positionAndVelocity = satellite.propagate(satrec, date);
                const positionEci = positionAndVelocity.position;

                if (!positionEci) continue;

                const gmst = satellite.gstime(date);
                const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                sats.push({
                    id: satrec.satnum,
                    name: name,
                    lat: positionGd.latitude * (180 / Math.PI),
                    lon: positionGd.longitude * (180 / Math.PI),
                    alt: positionGd.height,
                    velocity: positionAndVelocity.velocity ? Math.round(Math.sqrt(positionAndVelocity.velocity.x**2 + positionAndVelocity.velocity.y**2 + positionAndVelocity.velocity.z**2) * 3600) : 0
                });
              }

              // On met en cache les données récupérées
              cachedSats = sats;
              satsCacheTime = Date.now();

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ satellites: sats }));
            } catch (error) {
              console.error('[Vite Proxy] Satellites error:', error.message);
              res.statusCode = 200;
              res.end(JSON.stringify({ satellites: cachedSats || [] }));
            }
          });

        }
      }
    ]
  }
});