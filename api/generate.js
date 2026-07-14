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

  const { text, type, template } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text input is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const templateKey = template || 'general';
  const templateInstruction = templatePrompts[templateKey] || templatePrompts.general;

  let letterType;
  let detectedTone = null;

  if (type === 'auto') {
    try {
      const toneResponse = await openai.chat.completions.create({
        model: process.env.BIG_PICKLE_MODEL || 'big-pickle',
        messages: [
          {
            role: 'system',
            content: `Analyze the following text and determine if it should be written as a FORMAL or INFORMAL letter. Consider factors like:
- Vocabulary (casual vs professional)
- Context (work/school vs personal)
- Relationship implied (boss/colleague vs friend/family)
- Sentiment and urgency

Reply with ONLY one word: "formal" or "informal". Nothing else.`,
          },
          { role: 'user', content: text },
        ],
        max_tokens: 10,
        temperature: 0,
      });

      const toneResult = (toneResponse.choices[0]?.delta?.content || toneResponse.choices[0]?.message?.content || 'formal').trim().toLowerCase();
      detectedTone = toneResult === 'informal' ? 'informal' : 'formal';
      letterType = detectedTone;
    } catch {
      letterType = 'formal';
      detectedTone = 'formal';
    }
  } else {
    letterType = type === 'informal' ? 'informal' : 'formal';
    detectedTone = letterType;
  }

  res.write(`data: ${JSON.stringify({ tone_detected: detectedTone })}\n\n`);

  const systemPrompt = `You are a letter writing assistant. Generate a ${letterType} ${templateInstruction} based on the user's input.

IMPORTANT: Auto-detect the language of the user's input and respond in the SAME language (e.g., if user writes in Sinhala, respond in Sinhala; if in Tamil, respond in Tamil; if in English, respond in English). Support Singlish (code-mixed Sinhala-English) as well.

IMPORTANT: Write in a clearly ${letterType} tone. ${letterType === 'formal' ? 'Use professional language, proper grammar, and formal structure.' : 'Use casual, friendly language and a relaxed tone.'}

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
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
};
