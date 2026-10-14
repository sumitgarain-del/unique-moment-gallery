class SocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.rooms = new Set();
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev with Vite, fallback or connect to port 5000 or current host
    const host = window.location.port === '3000' ? `${window.location.hostname}:5000` : window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.emit('connection_change', { connected: true });

        // Rejoin rooms
        this.rooms.forEach((roomId) => {
          this.send({ type: 'JOIN_ROOM', roomId });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type) {
            this.emit(data.type, data);
          }
          this.emit('message', data);
        } catch (err) {
          console.error('[WS Client] Message parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('connection_change', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WS Client] Connection error:', err);
      };
    } catch (err) {
      console.warn('[WS Client] Socket init error:', err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }

  joinRoom(roomId) {
    if (!roomId) return;
    this.rooms.add(roomId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'JOIN_ROOM', roomId });
    }
  }

  leaveRoom(roomId) {
    if (!roomId) return;
    this.rooms.delete(roomId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'LEAVE_ROOM', roomId });
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[WS Client] Callback error for ${event}:`, err);
        }
      });
    }
  }
}

export const socket = new SocketClient();
