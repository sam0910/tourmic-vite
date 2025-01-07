// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/service-worker.js')
    .then((reg) => console.log('Service Worker registered', reg))
    .catch((err) => console.error('Service Worker failed', err));
}

let audioContext = null;
let wsConnection = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;
let reconnectTimeout = null;

async function initializeAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    document.getElementById('initAudio').style.display = 'none';
    document.getElementById('message').textContent = 'Attempting to connect...';
    connectWebSocket();
    return true;
  } catch (err) {
    showError(`Audio initialization error: ${err.message}`);
    return false;
  }
}

function connectWebSocket() {
  try {
    wsConnection = new WebSocket(`ws://192.168.0.66:8080`);
    wsConnection.binaryType = 'arraybuffer';

    wsConnection.onopen = () => {
      document.getElementById('status').className = 'status connected';
      document.getElementById('status').textContent = 'Status: Connected';
      document.getElementById('message').textContent = 'Listening for audio stream...';
      document.getElementById('error').style.display = 'none';
      reconnectAttempts = 0;
    };

    wsConnection.onclose = () => {
      document.getElementById('status').className = 'status disconnected';
      document.getElementById('status').textContent = 'Status: Disconnected';
      reconnectWebSocket();
    };

    wsConnection.onerror = (error) => {
      showError('WebSocket connection error. Attempting to reconnect...');
    };

    wsConnection.onmessage = async (event) => {
      if (!audioContext) return;

      try {
        const floatArray = new Float32Array(event.data);
        const buffer = audioContext.createBuffer(1, floatArray.length, 44100);
        buffer.copyToChannel(floatArray, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (error) {
        showError(`Audio processing error: ${error.message}`);
      }
    };
  } catch (error) {
    showError('Failed to connect to WebSocket server');
  }
}

function reconnectWebSocket() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showError('Maximum reconnection attempts reached. Please refresh the page.');
    return;
  }

  reconnectAttempts++;
  console.log(`Reconnecting... Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(connectWebSocket, 2000);
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = `Error: ${message}`;
  errorEl.style.display = 'block';
}

// Initialize event listeners when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('initAudio').addEventListener('click', initializeAudio);
});
