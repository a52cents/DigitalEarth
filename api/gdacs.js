export default async function handler(req, res) {
    try {
        // On passe la limite à 500 au lieu de 50
        const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500');
        if (!response.ok) throw new Error('EONET API error');
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(200).json({ events: [] });
    }
}