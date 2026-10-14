import { WebSocketServer, WebSocket } from 'ws';

class SocketHub {
  constructor() {
    this.wss = null;
    this.rooms = new Map(); // roomId -> Set<WebSocket>
  }

  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.currentRooms = new Set();

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (messageRaw) => {
        try {
          const data = JSON.parse(messageRaw.toString());
          this.handleMessage(ws, data);
        } catch (err) {
          console.error('[WS] Parse error:', err.message);
        }
      });

      ws.on('close', () => {
        this.leaveAllRooms(ws);
      });

      // Send initial welcome
      ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() }));
    });

    // Heartbeat to clean dead sockets
    setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          this.leaveAllRooms(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('[WS] WebSocket server initialized on /ws');
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case 'JOIN_ROOM': {
        const { roomId, clientId, userName } = data;
        if (!roomId) return;
        this.joinRoom(ws, roomId, { clientId, userName });
        break;
      }

      case 'LEAVE_ROOM': {
        const { roomId } = data;
        if (roomId) this.leaveRoom(ws, roomId);
        break;
      }

      case 'CLIENT_ACTION': {
        // Broadcast client-side actions to other viewers in room
        const { roomId, payload } = data;
        if (roomId) {
          this.broadcastToRoom(roomId, {
            type: 'PEER_ACTION',
            sender: ws.userInfo || 'Someone',
            payload,
          }, ws); // exclude sender
        }
        break;
      }

      default:
        break;
    }
  }

  joinRoom(ws, roomId, userInfo = {}) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    const room = this.rooms.get(roomId);
    room.add(ws);
    ws.currentRooms.add(roomId);
    ws.userInfo = userInfo;

    // Notify room of viewer count
    this.broadcastToRoom(roomId, {
      type: 'ROOM_STATE',
      roomId,
      activeViewers: room.size,
    });
  }

  leaveRoom(ws, roomId) {
    if (this.rooms.has(roomId)) {
      const room = this.rooms.get(roomId);
      room.delete(ws);
      ws.currentRooms.delete(roomId);

      if (room.size === 0) {
        this.rooms.delete(roomId);
      } else {
        this.broadcastToRoom(roomId, {
          type: 'ROOM_STATE',
          roomId,
          activeViewers: room.size,
        });
      }
    }
  }

  leaveAllRooms(ws) {
    if (!ws.currentRooms) return;
    ws.currentRooms.forEach((roomId) => {
      this.leaveRoom(ws, roomId);
    });
    ws.currentRooms.clear();
  }

  broadcastToRoom(roomId, messageObj, excludeWs = null) {
    if (!this.rooms.has(roomId)) return;
    const room = this.rooms.get(roomId);
    const msgStr = JSON.stringify(messageObj);

    room.forEach((client) => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }

  broadcastAll(messageObj) {
    if (!this.wss) return;
    const msgStr = JSON.stringify(messageObj);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }
}

export const socketHub = new SocketHub();
