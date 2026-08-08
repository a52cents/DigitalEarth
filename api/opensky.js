export default async function handler(req, res) {
    try {
        const response = await fetch('https://opensky-network.org/api/states/all');
        if (!response.ok) {
            // Si OpenSky limite le débit (429), on renvoie un JSON vide propre
            return res.status(200).json({ states: [] });
        }
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(200).json({ states: [] });
    }
}