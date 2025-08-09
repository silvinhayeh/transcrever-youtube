import ytdl from "ytdl-core";

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: "URL inválida do YouTube." });
    }

    const info = await ytdl.getInfo(url);

    // Lista todas as tracks de legendas
    const tracks = info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ error: "Nenhuma legenda encontrada para este vídeo." });
    }

    // Pega a primeira track de legenda disponível
    const track = tracks[0];
    const lang = track.languageCode || "desconhecido";

    // Baixa o arquivo de legenda no formato XML
    const response = await fetch(track.baseUrl);
    const xml = await response.text();

    // Extrai e limpa o texto da legenda
    const text = xml
      .replace(/<[^>]+>/g, "") // Remove tags XML
      .replace(/\s+/g, " ") // Remove espaços extras
      .trim();

    res.status(200).json({
      idioma: lang,
      transcricao: text
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar a transcrição." });
  }
}
