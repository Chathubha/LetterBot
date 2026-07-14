const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
});

const templatePrompts = {
  general: 'Write a general letter',
  leave: 'Write a leave letter',
  complaint: 'Write a complaint letter',
  resignation: 'Write a resignation letter',
  application: 'Write a job application letter',
  recommendation: 'Write a recommendation letter',
  apology: 'Write an apology letter',
  thank_you: 'Write a thank you letter',
};

router.post('/generate-letter', async (req, res) => {
  const { text, type, template } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text input is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const letterType = type === 'formal' ? 'formal' : 'informal';
  const templateKey = template || 'general';
  const templateInstruction = templatePrompts[templateKey] || templatePrompts.general;

  const systemPrompt = `You are a letter writing assistant. Generate a ${letterType} ${templateInstruction} based on the user's input.

IMPORTANT: Auto-detect the language of the user's input and respond in the SAME language (e.g., if user writes in Sinhala, respond in Sinhala; if in Tamil, respond in Tamil; if in English, respond in English).

Return the letter chunk by chunk as you write it. Do NOT include any extra text, only the letter content.`;

  try {
    const stream = await openai.chat.completions.create({
      model: process.env.BIG_PICKLE_MODEL || 'big-pickle',
      messages: [
        { role: 'system', content: systemPrompt },
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
    console.error('OpenAI API error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
