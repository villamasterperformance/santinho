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
    colinha_titulo: 'Minha Colinha',
    colinha_texto:
      'Essa é a minha colinha pra votar no Oscar Silva! 💙 Baixa, compartilha e cola no zap: https://oscarsilva.com.br',
    colinha_imagem_url: '/assets/oscar/colinha.svg',
    colinha_faixa_url: null,
    videos: [],
    propostas: [],
    musicas: [],
    molduras: [{ url: '/assets/oscar/moldura.svg', nome: 'Time do Oscar' }],
  });
};
