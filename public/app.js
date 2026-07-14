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
const historySaveBtn = document.getElementById('historySaveBtn');
const emailBtn = document.getElementById('emailBtn');
const emailInput = document.getElementById('emailInput');
const loadingIndicator = document.getElementById('loadingIndicator');
const recordingIndicator = document.getElementById('recordingIndicator');
const langBadge = document.getElementById('langBadge');
const langCode = document.getElementById('langCode');
const toastAlert = document.getElementById('toastAlert');
const themeToggle = document.getElementById('themeToggle');
const usageCount = document.getElementById('usageCount');
const progressSteps = document.getElementById('progressSteps');
const stepRecord = document.getElementById('stepRecord');
const stepProcess = document.getElementById('stepProcess');
const stepGenerate = document.getElementById('stepGenerate');
const toneBanner = document.getElementById('toneBanner');
const toneText = document.getElementById('toneText');
const polishTools = document.getElementById('polishTools');
const polishLoading = document.getElementById('polishLoading');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isGenerating = false;
let currentLetter = '';
let isPolishing = false;

// ─── TOAST ───
function showToast(msg, type = 'info', duration = 2500) {
  toastAlert.className = 'alert alert-sm text-sm shadow-lg';
  toastAlert.classList.add(`alert-${type}`);
  toastAlert.textContent = msg;
  toastAlert.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastAlert.classList.add('hidden'), duration);
}

// ─── LANGUAGE DETECTION ───
const langMap = {
  si: { code: 'SI', color: 'success' },
  ta: { code: 'TA', color: 'warning' },
  en: { code: 'EN', color: 'primary' },
  singlish: { code: 'SN', color: 'secondary' },
};

function detectLanguage(text) {
  if (!text.trim()) return langMap.en;
  const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
  const hasTamil = /[\u0B80-\u0BFF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasSinhala && hasLatin) return langMap.singlish;
  if (hasSinhala) return langMap.si;
  if (hasTamil) return langMap.ta;
  return langMap.en;
}

function updateLangBadge(text) {
  const lang = detectLanguage(text);
  langBadge.className = `badge badge-${lang.color} gap-1 text-xs`;
  langCode.textContent = lang.code;
}

inputText.addEventListener('input', () => updateLangBadge(inputText.value));

// ─── THEME TOGGLE ───
function getSavedTheme() {
  return localStorage.getItem('letterbot-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('letterbot-theme', theme);
}

applyTheme(getSavedTheme());

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ─── USAGE TRACKER ───
async function fetchUsage() {
  try {
    const res = await fetch('/api/usage');
    const data = await res.json();
    usageCount.textContent = data.count.toLocaleString();
  } catch {
    usageCount.textContent = '0';
  }
}

async function incrementUsage() {
  try {
    const res = await fetch('/api/usage/increment', { method: 'POST' });
    const data = await res.json();
    usageCount.textContent = data.count.toLocaleString();
  } catch { /* silent */ }
}

fetchUsage();

// ─── STEP-BY-STEP FEEDBACK ───
function showProgress(current) {
  progressSteps.classList.remove('hidden');
  stepRecord.className = 'step' + (current === 'record' ? ' step-primary' : current === 'process' || current === 'generate' ? ' step-primary' : '');
  stepProcess.className = 'step' + (current === 'process' ? ' step-primary' : current === 'generate' ? ' step-primary' : '');
  stepGenerate.className = 'step' + (current === 'generate' ? ' step-primary' : '');
}

function hideProgress() {
  progressSteps.classList.add('hidden');
  stepRecord.className = 'step';
  stepProcess.className = 'step';
  stepGenerate.className = 'step';
}

// ─── RECORDING ───
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
      showProgress('process');
      socket.emit('transcribe');
    };

    mediaRecorder.start(1000);
    isRecording = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recordingIndicator.classList.remove('hidden');
    recordingIndicator.classList.add('flex');
    showProgress('record');
  } catch (err) {
    showToast('Microphone access denied', 'error');
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
    recordingIndicator.classList.remove('flex');
  }
}

socket.on('transcription-status', (data) => {
  if (data.status === 'processing') {
    showProgress('process');
  }
});

socket.on('transcription', (data) => {
  if (data.text) {
    inputText.value = (inputText.value + ' ' + data.text).trim();
    updateLangBadge(inputText.value);
    showToast('Transcription received', 'success');
  } else if (data.error) {
    showToast(data.error, 'error');
  }
  hideProgress();
});

function clearAll() {
  inputText.value = '';
  outputSection.classList.add('hidden');
  letterContent.textContent = '';
  audioChunks = [];
  cursor.classList.add('hidden');
  polishTools.classList.add('hidden');
  toneBanner.classList.add('hidden');
  currentLetter = '';
  hideProgress();
  updateLangBadge('');
}

// ─── GENERATE ───
generateBtn.addEventListener('click', generateLetter);

async function generateLetter() {
  const text = inputText.value.trim();
  if (!text) {
    showToast('Please enter or speak some text first', 'warning');
    return;
  }
  if (isGenerating) return;

  isGenerating = true;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Generating...';

  outputSection.classList.remove('hidden');
  letterContent.textContent = '';
  cursor.classList.remove('hidden');
  loadingIndicator.classList.remove('hidden');
  loadingIndicator.classList.add('flex');
  polishTools.classList.add('hidden');
  toneBanner.classList.add('hidden');
  showProgress('generate');

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

          if (data.tone_detected && typeSelect.value === 'auto') {
            const tone = data.tone_detected.charAt(0).toUpperCase() + data.tone_detected.slice(1);
            toneText.innerHTML = `Tone detected: <strong>${tone}</strong>`;
            toneBanner.classList.remove('hidden');
          }

          if (data.done) {
            cursor.classList.add('hidden');
            loadingIndicator.classList.add('hidden');
            loadingIndicator.classList.remove('flex');
            polishTools.classList.remove('hidden');
            currentLetter = data.full || currentLetter;
            showToast('Letter generated successfully', 'success');
            incrementUsage();
            hideProgress();
          }

          if (data.chunk) {
            letterContent.textContent = data.full || letterContent.textContent + data.chunk;
            updateLangBadge(data.full || text);
          }
        }
      }
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'error', 4000);
    cursor.classList.add('hidden');
    loadingIndicator.classList.add('hidden');
    loadingIndicator.classList.remove('flex');
    hideProgress();
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Letter';
  }
}

// ─── POLISH TOOLS ───
document.querySelectorAll('.polish-btn').forEach(btn => {
  btn.addEventListener('click', () => polishLetter(btn.dataset.action));
});

async function polishLetter(action) {
  if (isPolishing) return;
  const text = currentLetter || letterContent.textContent;
  if (!text) {
    showToast('No letter to polish', 'warning');
    return;
  }

  isPolishing = true;
  polishLoading.classList.remove('hidden');
  polishLoading.classList.add('flex');
  document.querySelectorAll('.polish-btn').forEach(b => b.disabled = true);

  cursor.classList.remove('hidden');
  letterContent.textContent = '';
  outputTitle.textContent = `Polished (${action})`;

  try {
    const response = await fetch('/api/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, action }),
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
            currentLetter = data.full || currentLetter;
            showToast(`Letter ${action}d successfully`, 'success');
          }
          if (data.chunk) {
            letterContent.textContent = data.full || letterContent.textContent + data.chunk;
          }
        }
      }
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'error', 4000);
    cursor.classList.add('hidden');
    letterContent.textContent = text;
  } finally {
    isPolishing = false;
    polishLoading.classList.add('hidden');
    polishLoading.classList.remove('flex');
    document.querySelectorAll('.polish-btn').forEach(b => b.disabled = false);
  }
}

// ─── COPY ───
copyBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'success');
    copyBtn.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy';
    }, 2000);
  });
});

// ─── PDF ───
pdfBtn.addEventListener('click', () => {
  const text = letterContent.textContent;
  if (!text) {
    showToast('No letter content to export', 'warning');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180);
  doc.setFont('Helvetica', 'normal');
  doc.text(lines, 15, 20);
  doc.save('letter.pdf');
  showToast('PDF downloaded', 'success');
});

// ─── EMAIL ───
emailBtn.addEventListener('click', async () => {
  const body = letterContent.textContent;
  const to = emailInput.value.trim();
  if (!body) { showToast('No letter to send', 'warning'); return; }
  if (!to) { showToast('Please enter an email address', 'warning'); return; }

  emailBtn.disabled = true;
  emailBtn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Sending...';

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: outputTitle.textContent, body }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Email sent successfully', 'success');
  } catch (err) {
    showToast('Failed to send: ' + err.message, 'error', 4000);
  } finally {
    emailBtn.disabled = false;
    emailBtn.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send';
  }
});

// ─── LOCAL HISTORY ───
const HISTORY_KEY = 'letterbot-history';
const MAX_HISTORY = 20;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function renderHistory() {
  const items = getHistory();
  historyList.innerHTML = '';

  if (items.length === 0) {
    historyEmpty.classList.remove('hidden');
    return;
  }

  historyEmpty.classList.add('hidden');

  items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'history-item card bg-base-200/30 border border-base-300/50 p-3 cursor-pointer hover:bg-base-200/60 transition-colors';
    el.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-xs badge-outline">${item.template}</span>
            <span class="badge badge-xs badge-${item.tone === 'formal' ? 'primary' : 'secondary'}">${item.tone}</span>
            <span class="text-[10px] text-base-content/40">${item.date}</span>
          </div>
          <p class="text-xs text-base-content/60 line-clamp-2">${item.text.substring(0, 120)}${item.text.length > 120 ? '...' : ''}</p>
        </div>
        <button class="history-delete btn btn-ghost btn-xs text-error" data-idx="${idx}" title="Delete">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete')) return;
      inputText.value = item.text;
      templateSelect.value = item.template;
      typeSelect.value = item.tone;
      updateLangBadge(item.text);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Loaded from history', 'info');
    });

    historyList.appendChild(el);
  });

  document.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const items = getHistory();
      items.splice(idx, 1);
      saveHistory(items);
      renderHistory();
      showToast('Deleted from history', 'info');
    });
  });
}

historySaveBtn.addEventListener('click', () => {
  const text = currentLetter || letterContent.textContent;
  if (!text) {
    showToast('No letter to save', 'warning');
    return;
  }

  const items = getHistory();
  items.unshift({
    text,
    template: templateSelect.value,
    tone: typeSelect.value === 'auto' ? 'auto' : typeSelect.value,
    date: new Date().toLocaleDateString(),
    timestamp: Date.now(),
  });

  if (items.length > MAX_HISTORY) items.length = MAX_HISTORY;
  saveHistory(items);
  renderHistory();
  showToast('Saved to history', 'success');
});

clearHistoryBtn.addEventListener('click', () => {
  saveHistory([]);
  renderHistory();
  showToast('History cleared', 'info');
});

renderHistory();
