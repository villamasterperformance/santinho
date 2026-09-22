module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  res.status(200).json({
    radio_nome: null,
    radio_capa_url: null,
    whatsapp_grupo_url: null,
    whatsapp_grupo_titulo: null,
    colinha_url: 'https://oscarsilva.com.br',
    colinha_titulo: 'Guia rápido do Oscar Silva',
    colinha_texto:
      'Estou no time do Oscar Silva! 💙 Se você também quer um Brasília mais justo, vem comigo: https://oscarsilva.com.br',
    colinha_imagem_url: '/assets/oscar/logo.png',
    colinha_faixa_url: null,
    videos: [],
    propostas: [],
    musicas: [],
    molduras: [{ url: '/assets/oscar/moldura.svg', nome: 'Time do Oscar' }],
  });
};
