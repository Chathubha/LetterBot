const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    const file = new File([blob], 'audio.webm', { type: 'audio/webm' });

    const transcript = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      prompt: 'Sinhala, English, Singlish, Tamil speech including code-mixed conversations.',
    });

    res.json({ text: transcript.text });
  } catch (err) {
    console.error('Whisper error:', err);
    res.status(500).json({ error: 'Transcription failed' });
  }
};
