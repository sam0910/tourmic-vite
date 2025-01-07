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
let isManualDisconnect = false;

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
    // Handle both Vite and non-Vite environments
    const wsUrl = '192.168.0.66'; // Fallback to default
    console.log(`Connecting to WebSocket server: ${wsUrl}`);
    wsConnection = new WebSocket(`ws://${wsUrl}:8080`);
    wsConnection.binaryType = 'arraybuffer';
    isManualDisconnect = false;

    wsConnection.onopen = () => {
      document.getElementById('status').className = 'status connected';
      document.getElementById('status').textContent = '상태: 연결 완료';
      document.getElementById('message').textContent = '오디오를 재생중 입니다....';
      document.getElementById('error').style.display = 'none';
      document.getElementById('disconnect').style.display = 'block';
      reconnectAttempts = 0;
    };

    wsConnection.onclose = () => {
      document.getElementById('status').className = 'status disconnected';
      document.getElementById('status').textContent = '상태: 연결 끊김';
      document.getElementById('disconnect').style.display = 'none';
      if (!isManualDisconnect) {
        reconnectWebSocket();
      }
    };

    wsConnection.onerror = (error) => {
      showError('연결 에러, 연결을 재시도 합니다...');
    };

    wsConnection.onmessage = async (event) => {
      if (!audioContext) return;

      try {
        const floatArray = new Float32Array(event.data);
        const buffer = audioContext.createBuffer(1, floatArray.length, 22050);
        buffer.copyToChannel(floatArray, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (error) {
        showError(`오디오 프로세싱 에러: ${error.message}`);
      }
    };
  } catch (error) {
    showError(`연결 에러 : ${error.message}`);
  }
}

function disconnectWebSocket() {
  if (wsConnection) {
    isManualDisconnect = true;
    wsConnection.close();
    wsConnection = null;
  }
  document.getElementById('disconnect').style.display = 'none';
  document.getElementById('initAudio').style.display = 'block';
  document.getElementById('message').textContent = '오디오 연결 버튼을 눌러서 연결하세요';
}

function reconnectWebSocket() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showError('재연결 시도 회수 초과. 3초 후 페이지를 새로고침 합니다....');
    setTimeout(() => {
      window.location.reload();
    }, 3000);
    return;
  }

  reconnectAttempts++;
  console.log(`재연결중... 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
  showError(`재연결중... 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

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
  document.getElementById('disconnect').addEventListener('click', disconnectWebSocket);
});
