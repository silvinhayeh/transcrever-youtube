export default async function handler(req, res) {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "URL do vídeo não fornecida" });
    }

    try {
        // API gratuita de transcrição
        const apiURL = `https://tactiq.io/api/transcript?url=${encodeURIComponent(videoUrl)}`;
        const resposta = await fetch(apiURL);
        const dados = await resposta.json();

        if (!dados || !dados.transcript) {
            return res.status(500).json({ error: "Não foi possível obter a transcrição." });
        }

        // Junta o texto limpo
        const textoFinal = dados.transcript.map(t => t.text).join(" ");
        res.status(200).json({ texto: textoFinal });
    } catch (erro) {
        res.status(500).json({ error: "Erro ao processar a transcrição." });
    }
}
