require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const OpenAI = require('openai');
const generateRoute = require('./routes/generate');
const emailRoute = require('./routes/email');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
});
const BIG_PICKLE_MODEL = process.env.BIG_PICKLE_MODEL || 'big-pickle';

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', generateRoute);
app.use('/api', emailRoute);

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

    try {
      const audioBuffer = Buffer.concat(audioChunks.map(c => Buffer.from(c)));
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      const file = new File([blob], 'audio.webm', { type: 'audio/webm' });

      const transcript = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: 'en',
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
  console.log('BASE_URL:', process.env.ZEN_BASE_URL);
  console.log('MODEL:', process.env.BIG_PICKLE_MODEL);
  console.log('KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
});
