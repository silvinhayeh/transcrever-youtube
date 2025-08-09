// api/transcrever.js
export default async function handler(req, res) {
  try {
    const url = req.query.url;
    const lang = (req.query.lang || "pt").slice(0,2); // "pt", "es", "en", etc.

    if (!url) return res.status(400).json({ error: "Parâmetro 'url' obrigatório." });

    // extrai o ID do vídeo
    const idMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!idMatch) return res.status(400).json({ error: "URL do YouTube inválida." });
    const videoId = idMatch[1];

    // 1) tenta obter player_response via get_video_info
    const infoUrl = `https://www.youtube.com/get_video_info?video_id=${videoId}&html5=1&el=embedded`;
    const infoResp = await fetch(infoUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
    const infoText = await infoResp.text();

    let playerResponse = null;

    try {
      const params = new URLSearchParams(infoText);
      const pr = params.get("player_response") || params.get("player_response_raw") || params.get("playerResponse");
      if (pr) playerResponse = JSON.parse(pr);
    } catch (e) {
      // ignora
    }

    // 2) fallback: buscar na página watch se playerResponse não encontrado
    if (!playerResponse) {
      const watchResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { "User-Agent": "Mozilla/5.0" }});
      const watchHtml = await watchResp.text();

      // tenta pegar ytInitialPlayerResponse = {...};
      const m = watchHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s) || watchHtml.match(/window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\})\s*;/s);
      if (m && m[1]) {
        try { playerResponse = JSON.parse(m[1]); } catch(e) { playerResponse = null; }
      }
    }

    if (!playerResponse) {
      return res.status(404).json({ error: "Não foi possível obter dados do player do vídeo." });
    }

    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (!captionTracks || captionTracks.length === 0) {
      return res.status(404).json({ error: "Nenhuma legenda disponível para este vídeo." });
    }

    // tenta achar faixa no idioma pedido, senão pega a primeira
    let track = captionTracks.find(t => (t.languageCode && t.languageCode.startsWith(lang))) || captionTracks[0];
    let trackUrl = track.baseUrl || track.url || track.vssId;
    if (!trackUrl) return res.status(500).json({ error: "Legenda encontrada mas sem URL para download." });

    // garante formato legível (só adiciona fmt se não existir)
    if (!/fmt=/.test(trackUrl)) trackUrl += "&fmt=srv3";

    const trackResp = await fetch(trackUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
    const trackText = await trackResp.text();

    // extrai todos os <text>...</text>
    const texts = [];
    const re = /<text[^>]*>([\s\S]*?)<\/text>/gmi;
    let mm;
    while ((mm = re.exec(trackText)) !== null) {
      let t = mm[1] || "";
      // decode entidades comuns
      t = t.replace(/&amp;/g, "&")
           .replace(/&lt;/g, "<")
           .replace(/&gt;/g, ">")
           .replace(/&#39;/g, "'")
           .replace(/&quot;/g, '"')
           .replace(/&nbsp;/g, " ");

      // decode numeric entities (ex: &#123;)
      t = t.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n,10)));

      // remover espaços extras
      t = t.replace(/\s+/g, " ").trim();
      if (t) texts.push(t);
    }

    if (texts.length === 0) {
      return res.status(404).json({ error: "Não foi possível extrair o texto das legendas." });
    }

    const finalText = texts.join(" ").replace(/\s+/g, " ").trim();

    // Retorna em dois campos para compatibilidade (texto e transcript)
    return res.status(200).json({ texto: finalText, transcript: finalText });
  } catch (err) {
    console.error("Erro /api/transcrever:", err);
    return res.status(500).json({ error: "Erro interno ao processar a transcrição." });
  }
}
