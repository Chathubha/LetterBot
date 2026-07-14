const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
});

const polishPrompts = {
  expand: 'Expand this letter with more detail, depth, and elaboration while maintaining the same tone and language. Add relevant supporting points and make it more comprehensive.',
  summarize: 'Summarize this letter into a concise, brief version that keeps all the key points but removes unnecessary detail. Keep the same tone and language.',
  rephrase: 'Rephrase this letter completely with different wording and sentence structure while keeping the exact same meaning, tone, language, and intent.',
};

router.post('/polish', async (req, res) => {
  const { text, action } = req.body;
  if (!text || !action) {
    return res.status(400).json({ error: 'Text and action are required' });
  }

  const prompt = polishPrompts[action];
  if (!prompt) {
    return res.status(400).json({ error: 'Invalid action. Use: expand, summarize, or rephrase' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await openai.chat.completions.create({
      model: process.env.BIG_PICKLE_MODEL || 'big-pickle',
      messages: [
        {
          role: 'system',
          content: `You are a letter polishing assistant. ${prompt}

IMPORTANT: Match the language of the input exactly. If the letter is in Sinhala, respond in Sinhala. If in English, respond in English. If in Singlish (code-mixed), keep it in Singlish. If in Tamil, respond in Tamil.

Return ONLY the polished letter content. No explanations, no extra text.`,
        },
        { role: 'user', content: text },
      ],
      max_tokens: 4096,
      stream: true,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ chunk: content, full: fullContent })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, full: fullContent })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Polish API error:', error.message);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
