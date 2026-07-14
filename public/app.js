const socket = io();

const startBtn = document.getElementById('startRecordBtn');
const stopBtn = document.getElementById('stopRecordBtn');
const clearBtn = document.getElementById('clearBtn');
const inputText = document.getElementById('inputText');
const templateSelect = document.getElementById('templateSelect');
const typeSelect = document.getElementById('typeSelect');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const outputTitle = document.getElementById('outputTitle');
const letterContent = document.getElementById('letterContent');
const cursor = document.getElementById('cursor');
const copyBtn = document.getElementById('copyBtn');
const pdfBtn = document.getElementById('pdfBtn');
const emailBtn = document.getElementById('emailBtn');
const emailInput = document.getElementById('emailInput');
const loadingIndicator = document.getElementById('loadingIndicator');
const recordingIndicator = document.getElementById('recordingIndicator');
const langBadge = document.getElementById('langBadge');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isGenerating = false;

const langMap = {
  si: { code: 'SI', label: 'සිංහල', color: 'bg-green-100 text-green-700' },
  ta: { code: 'TA', label: 'தமிழ்', color: 'bg-orange-100 text-orange-700' },
  en: { code: 'EN', label: 'English', color: 'bg-blue-100 text-blue-700' },
};

function detectLanguage(text) {
  if (!text.trim()) return langMap.en;
  const sinhalaPattern = /[\u0D80-\u0DFF]/;
  const tamilPattern = /[\u0B80-\u0BFF]/;
  if (sinhalaPattern.test(text)) return langMap.si;
  if (tamilPattern.test(text)) return langMap.ta;
  return langMap.en;
}

function updateLangBadge(text) {
  const lang = detectLanguage(text);
  langBadge.className = `flex items-center gap-2 px-3 py-1.5 ${lang.color} text-sm rounded-full`;
  langBadge.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:currentColor"></span><span>${lang.code}</span>`;
}

inputText.addEventListener('input', () => updateLangBadge(inputText.value));

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
clearBtn.addEventListener('click', clearAll);

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        event.data.arrayBuffer().then(buf => {
          socket.emit('audio-chunk', buf);
        });
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      socket.emit('transcribe');
    };

    mediaRecorder.start(1000);
    isRecording = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recordingIndicator.classList.remove('hidden');
  } catch (err) {
    alert('Microphone access denied. Please allow microphone permissions.');
    console.error(err);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    recordingIndicator.classList.add('hidden');
    recordingIndicator.classList.add('hidden');
  }
}

socket.on('transcription', (data) => {
  if (data.text) {
    inputText.value = (inputText.value + ' ' + data.text).trim();
    updateLangBadge(inputText.value);
  }
});

function clearAll() {
  inputText.value = '';
  outputSection.classList.add('hidden');
  letterContent.textContent = '';
  audioChunks = [];
  updateLangBadge('');
}

generateBtn.addEventListener('click', generateLetter);

async function generateLetter() {
  const text = inputText.value.trim();
  if (!text) {
    alert('Please enter or speak some text first!');
    return;
  }
  if (isGenerating) return;

  isGenerating = true;
  generateBtn.disabled = true;

  outputSection.classList.remove('hidden');
  letterContent.textContent = '';
  cursor.classList.remove('hidden');
  loadingIndicator.classList.remove('hidden');

  const templateLabel = templateSelect.options[templateSelect.selectedIndex].text;
  outputTitle.textContent = templateLabel;

  try {
    const response = await fetch('/api/generate-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        type: typeSelect.value,
        template: templateSelect.value,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(data.error);
          if (data.done) {
            cursor.classList.add('hidden');
            loadingIndicator.classList.add('hidden');
          }
          if (data.chunk) {
            letterContent.textContent = data.full || letterContent.textContent + data.chunk;
            updateLangBadge(data.full || text);
          }
        }
      }
    }
  } catch (error) {
    alert('Error: ' + error.message);
    cursor.classList.add('hidden');
    loadingIndicator.classList.add('hidden');
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
  }
}

copyBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.innerHTML = `Copied!`;
    setTimeout(() => {
      copyBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
    }, 2000);
  });
});

pdfBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) {
    alert('No letter content to export!');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180);
  doc.setFont('Helvetica', 'normal');
  doc.text(lines, 15, 20);
  doc.save('letter.pdf');
});

emailBtn.addEventListener('click', async () => {
  const body = letterContent.textContent;
  const to = emailInput.value.trim();
  if (!body) { alert('No letter to send!'); return; }
  if (!to) { alert('Please enter an email address!'); return; }

  emailBtn.disabled = true;
  emailBtn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: outputTitle.textContent,
        body,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    alert('Email sent successfully!');
  } catch (err) {
    alert('Failed to send email: ' + err.message);
  } finally {
    emailBtn.disabled = false;
    emailBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send Email`;
  }
});
