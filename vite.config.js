import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'api-middleware',
      configureServer(server) {
        // --- GDACS/NASA 
        server.middlewares.use('/gdacs-api', async (req, res) => {
          try {
            const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50');
            const data = await response.text();
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (error) { res.statusCode = 500; res.end('Erreur'); }
        });

        // --- OPENSKY 
        server.middlewares.use('/opensky-api', async (req, res) => {
          try {
            const response = await fetch('https://opensky-network.org/api/states/all');
            const data = await response.text();
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (error) {
            console.error('[Vite Middleware] Erreur OpenSky:', error);
            res.statusCode = 500;
            res.end('Erreur de proxy OpenSky');
          }
        });
      }
    }
  ]
});