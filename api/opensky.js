// Configuration magique de Vercel : transforme la fonction en Edge Function
export const config = {
  runtime: 'edge',
};

let cachedToken = null;
let tokenExpiry = 0;

export default async function handler(req) {
  try {
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    // 1. Gestion du Token OAuth2
    if (!cachedToken || Date.now() >= tokenExpiry - 60000) {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);

      const tokenRes = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'DigitalEarth/1.0 (Vercel Edge)' // Un User-Agent propre aide parfois
        },
        body: params
      });

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ flights: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const tokenData = await tokenRes.json();
      cachedToken = tokenData.access_token;
      tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
    }

    // 2. Récupération des vols
    const statesRes = await fetch('https://opensky-network.org/api/states/all', {
      headers: { 
        'Authorization': `Bearer ${cachedToken}`,
        'User-Agent': 'DigitalEarth/1.0 (Vercel Edge)'
      }
    });

    // Si le token a expiré en cours de route, on force le refresh pour la prochaine fois
    if (statesRes.status === 401) {
      cachedToken = null;
    }

    if (!statesRes.ok) {
      return new Response(JSON.stringify({ flights: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await statesRes.json();

    // 3. Nettoyage et formatage des données
    const flights = (data.states || []).map(state => ({
      callsign: state[1] ? state[1].trim() : 'N/A',
      country: state[2] || 'Inconnu',
      lon: state[5],
      lat: state[6],
      alt: state[7] || 10000,
      velocity: state[9] ? Math.round(state[9] * 3.6) : 0
    })).filter(f => f.lat !== null && f.lon !== null);

    // 4. Renvoi de la réponse avec un Cache-Control
    // Vercel va mettre ce résultat en cache pendant 2 minutes sur ses serveurs edge,
    // ce qui divise par 1000 les requêtes vers OpenSky et évite les bannissements !
    return new Response(JSON.stringify({ flights }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=120, stale-while-revalidate=60'
      }
    });

  } catch (error) {
    console.error('Edge OpenSky error:', error);
    return new Response(JSON.stringify({ flights: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}