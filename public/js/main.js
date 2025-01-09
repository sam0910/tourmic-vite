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
let heartbeatInterval = null;
let lastHeartbeat = null;
let wakeLock = null;
let audioFocusGained = true;
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/service-worker.js')
    .then((reg) => console.log('Service Worker registered', reg))
    .catch((err) => console.error('Service Worker failed', err));
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 35000; // 35 seconds
const RECONNECT_DELAY = 2000; // 2 seconds

async function requestWakeLock() {
  try {
    // Request both screen and system wake locks if available
    const locks = [];
    if ('wakeLock' in navigator) {
      // Request screen wake lock
      try {
        const screenLock = await navigator.wakeLock.request('screen');
        locks.push(screenLock);
        console.log('Screen Wake Lock is active');
      } catch (err) {
        console.log(`Screen Wake Lock error: ${err.message}`);
      }
    }

    wakeLock = locks[0] || null;

    // Add wake lock release listener to reacquire
    if (wakeLock) {
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock was released');
        // Attempt to reacquire the wake lock
        requestWakeLock().catch(console.error);
      });
    }
  } catch (err) {
    console.log(`Wake Lock error: ${err.message}`);
  }
}

async function setupMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Audio Stream',
      artist: 'PWA Workshop',
      artwork: [
        { src: '/images/icons/logo-96.png', sizes: '96x96', type: 'image/png' },
        { src: '/images/icons/logo-128.png', sizes: '128x128', type: 'image/png' },
        { src: '/images/icons/logo-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/images/icons/logo-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      disconnectWebSocket();
    });

    navigator.mediaSession.setActionHandler('play', () => {
      initializeAudio();
    });
  }
}

async function setupBackgroundFetch() {
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.backgroundFetch.register('audio-fetch', {
      title: 'Audio Stream',
      downloadTotal: 0,
      icons: [
        {
          sizes: '192x192',
          src: '/images/icons/logo-192.png',
          type: 'image/png',
        },
      ],
    });
  } catch (err) {
    console.log(`Background Fetch error: ${err.message}`);
  }
}

async function initializeAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Initialize media features
    await setupMediaSession();
    await requestWakeLock();
    await setupBackgroundFetch();
    document.getElementById('initAudio').style.display = 'none';
    document.getElementById('message').textContent = 'Attempting to connect...';
    connectWebSocket();
    return true;
  } catch (err) {
    showError(`Audio initialization error: ${err.message}`);
    return false;
  }
}

function sendHeartbeat() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({ type: 'heartbeat' }));
    lastHeartbeat = Date.now();
  }
}

function checkConnection() {
  if (lastHeartbeat && Date.now() - lastHeartbeat > CONNECTION_TIMEOUT) {
    console.log('Connection lost - No heartbeat received');
    handleDisconnection();
  }
}

function handleDisconnection() {
  if (wsConnection) {
    const currentState = wsConnection.readyState;
    clearInterval(heartbeatInterval);

    // Only close if not already closed
    if (currentState !== WebSocket.CLOSED && currentState !== WebSocket.CLOSING) {
      wsConnection.close();
    }

    document.getElementById('status').className = 'status disconnected';
    document.getElementById('status').textContent = '상태: 연결 끊김';
    document.getElementById('disconnect').style.display = 'none';

    if (!isManualDisconnect) {
      // Reset connection and start reconnection process
      wsConnection = null;
      reconnectWebSocket();
    }
  }
}

function connectWebSocket() {
  try {
    // Clear any existing intervals and timeouts
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    // Handle both Vite and non-Vite environments
    const wsUrl = '192.168.0.122'; // Fallback to default
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
      reconnectAttempts = 0; // Reset attempts on successful connection

      // Start heartbeat after connection is established
      lastHeartbeat = Date.now();
      heartbeatInterval = setInterval(() => {
        sendHeartbeat();
        checkConnection();
      }, HEARTBEAT_INTERVAL);
    };

    wsConnection.onclose = (event) => {
      console.log('WebSocket closed with code:', event.code, 'reason:', event.reason);
      clearInterval(heartbeatInterval);
      document.getElementById('status').className = 'status disconnected';
      document.getElementById('status').textContent = '상태: 연결 끊김';
      document.getElementById('disconnect').style.display = 'none';

      if (!isManualDisconnect) {
        wsConnection = null; // Clear the connection reference
        reconnectWebSocket(); // Attempt to reconnect
      }
    };

    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('연결 에러, 연결을 재시도 합니다...');
      handleDisconnection();
    };

    wsConnection.onmessage = async (event) => {
      if (!audioContext) return;

      try {
        // Handle heartbeat response
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'heartbeat') {
              lastHeartbeat = Date.now();
              return;
            }
          } catch (e) {
            // Not a JSON message, continue with audio processing
          }
        }

        // Process audio data
        const floatArray = new Float32Array(event.data);

        // Check if the audio data is valid
        if (floatArray.length === 0) {
          console.warn('Received empty audio data');
          return;
        }

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
    // If connection fails, trigger reconnect
    wsConnection = null;
    reconnectWebSocket();
  }
}

function disconnectWebSocket() {
  if (wsConnection) {
    isManualDisconnect = true;
    clearInterval(heartbeatInterval);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    wsConnection.close();
    wsConnection = null;

    // Release wake lock when disconnecting
    if (wakeLock) {
      wakeLock
        .release()
        .then(() => console.log('Wake Lock released'))
        .catch((err) => console.log(`Wake Lock release error: ${err.message}`));
      wakeLock = null;
    }

    // Update media session state
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
  document.getElementById('disconnect').style.display = 'none';
  document.getElementById('initAudio').style.display = 'block';
  document.getElementById('message').textContent = '오디오 연결 버튼을 눌러서 연결하세요';
}

function reconnectWebSocket() {
  if (isManualDisconnect) {
    return; // Don't reconnect if manually disconnected
  }

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

  // Clear any existing timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  // Schedule the next reconnection attempt
  reconnectTimeout = setTimeout(() => {
    if (!isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      connectWebSocket();
    }
  }, RECONNECT_DELAY);
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = `Error: ${message}`;
  errorEl.style.display = 'block';
}

// Handle audio focus and visibility changes
document.addEventListener('visibilitychange', async () => {
  if (document.hidden && audioContext) {
    audioFocusGained = false;
    // Don't suspend audio context when hidden
    // This allows audio to continue playing in background

    // Ensure wake lock is active
    if (!wakeLock) {
      await requestWakeLock();
    }
  } else if (!document.hidden && audioContext && !audioFocusGained) {
    audioFocusGained = true;
    await audioContext.resume();
    // Reacquire wake lock if needed
    if (!wakeLock) {
      await requestWakeLock();
    }
  }
});

// Add network status event listeners
window.addEventListener('online', () => {
  console.log('Browser is online');
  if (!wsConnection && !isManualDisconnect) {
    reconnectAttempts = 0; // Reset attempts when network comes back
    connectWebSocket();
  }
});

window.addEventListener('offline', () => {
  console.log('Browser is offline');
  handleDisconnection();
});

// Initialize event listeners when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('initAudio').addEventListener('click', initializeAudio);
  document.getElementById('disconnect').addEventListener('click', disconnectWebSocket);
});
