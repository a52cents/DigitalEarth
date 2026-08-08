let cachedToken = null;
let tokenExpiry = 0;

async function getOpenSkyToken() {
    // Si on a un token en mémoire et qu'il est encore valide (avec 1 min de marge), on le réutilise
    if (cachedToken && Date.now() < tokenExpiry - 60000) {
        return cachedToken;
    }

    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Identifiants OpenSky manquants");
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    if (!response.ok) throw new Error('Impossible de récupérer le token OpenSky');
    
    const data = await response.json();
    cachedToken = data.access_token;
    // Les tokens expirent en 30 min (1800 secondes)
    tokenExpiry = Date.now() + (data.expires_in * 1000); 
    
    return cachedToken;
}

export default async function handler(req, res) {
    try {
        const token = await getOpenSkyToken();
        
        const response = await fetch('https://opensky-network.org/api/states/all', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Si le token a expiré plus vite que prévu (erreur 401)
        if (response.status === 401) {
            cachedToken = null; // On force le renouvellement pour la prochaine fois
            return res.status(200).json({ states: [] });
        }

        if (!response.ok) {
            console.error('OpenSky API error:', response.status);
            return res.status(200).json({ states: [] });
        }
        
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Serverless OpenSky error:', error);
        res.status(200).json({ states: [] });
    }
}