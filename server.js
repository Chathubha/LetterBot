require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const OpenAI = require('openai');
const generateRoute = require('./routes/generate');
const emailRoute = require('./routes/email');
const polishRoute = require('./routes/polish');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
});

const PORT = process.env.PORT || 3000;

let usageCount = 0;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', generateRoute);
app.use('/api', emailRoute);
app.use('/api', polishRoute);

app.get('/api/usage', (req, res) => {
  res.json({ count: usageCount });
});

app.post('/api/usage/increment', (req, res) => {
  usageCount++;
  res.json({ count: usageCount });
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let audioChunks = [];

  socket.on('audio-chunk', (data) => {
    audioChunks.push(data);
  });

  socket.on('transcribe', async () => {
    if (audioChunks.length === 0) {
      socket.emit('transcription', { text: '' });
      return;
    }

    socket.emit('transcription-status', { status: 'processing' });

    try {
      const audioBuffer = Buffer.concat(audioChunks.map(c => Buffer.from(c)));
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      const file = new File([blob], 'audio.webm', { type: 'audio/webm' });

      const transcript = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        response_format: 'verbose_json',
        prompt: 'Sinhala, English, Singlish, Tamil speech including code-mixed conversations.',
      });

      socket.emit('transcription', { text: transcript.text });
    } catch (err) {
      console.error('Whisper error:', err);
      socket.emit('transcription', { text: '', error: 'Transcription failed' });
    } finally {
      audioChunks = [];
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    audioChunks = [];
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
