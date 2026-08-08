import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Charge les variables du fichier .env local
  const env = loadEnv(mode, process.cwd(), '');
  
  // Cache local pour le token
  let localCachedToken = null;
  let localTokenExpiry = 0;

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
          
          server.middlewares.use('/api/gdacs', async (req, res) => {
            try {
              const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50');
              const data = await response.text();
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (error) {
              res.statusCode = 200;
              res.end(JSON.stringify({ events: [] }));
            }
          });

          server.middlewares.use('/api/opensky', async (req, res) => {
            try {
              const token = await getLocalOpenSkyToken();
              const response = await fetch('https://opensky-network.org/api/states/all', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (response.status === 401) {
                  localCachedToken = null;
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ states: [] }));
              }
              
              const data = await response.text();
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (error) {
              console.error(error);
              res.statusCode = 200;
              res.end(JSON.stringify({ states: [] }));
            }
          });
        }
      }
    ]
  }
});