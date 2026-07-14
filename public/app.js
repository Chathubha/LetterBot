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
const toastEl = document.getElementById('toast');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isGenerating = false;

function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), duration);
}

const langMap = {
  si: { code: 'SI', color: '#22c55e' },
  ta: { code: 'TA', color: '#f97316' },
  en: { code: 'EN', color: '#6366f1' },
};

function detectLanguage(text) {
  if (!text.trim()) return langMap.en;
  if (/[\u0D80-\u0DFF]/.test(text)) return langMap.si;
  if (/[\u0B80-\u0BFF]/.test(text)) return langMap.ta;
  return langMap.en;
}

function updateLangBadge(text) {
  const lang = detectLanguage(text);
  langBadge.querySelector('.dot').style.background = lang.color;
  langBadge.querySelector('span:last-child').textContent = lang.code;
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
    startBtn.classList.add('recording');
    recordingIndicator.classList.add('active');
  } catch (err) {
    showToast('Microphone access denied');
    console.error(err);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    startBtn.classList.remove('recording');
    recordingIndicator.classList.remove('active');
  }
}

socket.on('transcription', (data) => {
  if (data.text) {
    inputText.value = (inputText.value + ' ' + data.text).trim();
    updateLangBadge(inputText.value);
    showToast('Transcription received');
  }
});

function clearAll() {
  inputText.value = '';
  outputSection.classList.remove('visible');
  letterContent.textContent = '';
  audioChunks = [];
  cursor.style.display = 'none';
  updateLangBadge('');
}

generateBtn.addEventListener('click', generateLetter);

async function generateLetter() {
  const text = inputText.value.trim();
  if (!text) {
    showToast('Please enter or speak some text first');
    return;
  }
  if (isGenerating) return;

  isGenerating = true;
  generateBtn.disabled = true;

  outputSection.classList.add('visible');
  letterContent.textContent = '';
  cursor.style.display = 'inline-block';
  loadingIndicator.classList.add('active');

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
            cursor.style.display = 'none';
            loadingIndicator.classList.remove('active');
            showToast('Letter generated successfully');
          }
          if (data.chunk) {
            letterContent.textContent = data.full || letterContent.textContent + data.chunk;
            updateLangBadge(data.full || text);
          }
        }
      }
    }
  } catch (error) {
    showToast('Error: ' + error.message, 4000);
    cursor.style.display = 'none';
    loadingIndicator.classList.remove('active');
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
  }
}

copyBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Copied!`;
    showToast('Copied to clipboard');
    setTimeout(() => {
      copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
    }, 2000);
  });
});

pdfBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) {
    showToast('No letter content to export');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180);
  doc.setFont('Helvetica', 'normal');
  doc.text(lines, 15, 20);
  doc.save('letter.pdf');
  showToast('PDF downloaded');
});

emailBtn.addEventListener('click', async () => {
  const body = letterContent.textContent;
  const to = emailInput.value.trim();
  if (!body) { showToast('No letter to send'); return; }
  if (!to) { showToast('Please enter an email address'); return; }

  emailBtn.disabled = true;
  emailBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Sending...`;

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: outputTitle.textContent, body }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Email sent successfully');
  } catch (err) {
    showToast('Failed to send: ' + err.message, 4000);
  } finally {
    emailBtn.disabled = false;
    emailBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send Email`;
  }
});
