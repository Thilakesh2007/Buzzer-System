/**
 * buzzin.live - Real-Time Game Show Buzzer Backend
 * Node.js + Express + Socket.io Server
 */

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createBuzzerServer(existingApp, existingServer) {
  const app = existingApp || express();
  const server = existingServer || http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // In-memory Room Storage
  // Room code -> Room Data
  const rooms = new Map();

  // Helper: Generate clean 6-character alphanumeric room code
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars like 0/O, 1/I
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (rooms.has(code)) {
      return generateRoomCode();
    }
    return code;
  }

  // Socket.io Real-Time Event Handlers
  io.on('connection', (socket) => {
    // 1. Host creates a new room
    socket.on('createRoom', (data, callback) => {
      try {
        const roomCode = generateRoomCode();

        const newRoom = {
          code: roomCode,
          hostSocketId: socket.id,
          locked: false,
          autoLock: true, // Default: auto-lock buzzers on first buzz
          players: new Map(), // socketId -> { id, name, joinedAt }
          buzzes: [], // Array of { id, name, timestamp, deltaMs }
          createdAt: Date.now()
        };

        rooms.set(roomCode, newRoom);

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.role = 'host';

        const roomInfo = {
          roomCode,
          locked: newRoom.locked,
          autoLock: newRoom.autoLock,
          players: [],
          buzzes: []
        };

        if (typeof callback === 'function') {
          callback({ success: true, room: roomInfo });
        }

        socket.emit('roomCreated', roomInfo);
      } catch (err) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Failed to create room' });
        }
      }
    });

    // 2. Player joins a room
    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      try {
        const cleanCode = (roomCode || '').trim().toUpperCase();
        const cleanName = (playerName || '').trim() || 'Anonymous Player';

        const room = rooms.get(cleanCode);

        if (!room) {
          const errRes = { success: false, message: 'Room not found. Check the 6-character code.' };
          socket.emit('joinError', errRes);
          if (typeof callback === 'function') callback(errRes);
          return;
        }

        // Add player to room
        const playerObj = {
          id: socket.id,
          name: cleanName,
          joinedAt: Date.now()
        };

        room.players.set(socket.id, playerObj);

        socket.join(cleanCode);
        socket.data.roomCode = cleanCode;
        socket.data.playerName = cleanName;
        socket.data.role = 'player';

        const playerList = Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));

        const joinSuccessData = {
          success: true,
          roomCode: cleanCode,
          playerName: cleanName,
          locked: room.locked,
          autoLock: room.autoLock,
          buzzes: room.buzzes,
          hasBuzzed: room.buzzes.some(b => b.id === socket.id)
        };

        socket.emit('roomJoined', joinSuccessData);
        if (typeof callback === 'function') callback(joinSuccessData);

        // Notify all clients in the room of updated player list
        io.to(cleanCode).emit('updatePlayerList', playerList);
        // Also send current buzz state
        socket.emit('buzzerFeedUpdate', room.buzzes);
      } catch (err) {
        const errRes = { success: false, message: 'Error joining room' };
        socket.emit('joinError', errRes);
        if (typeof callback === 'function') callback(errRes);
      }
    });

    // 3. Player hits buzzer
    socket.on('buzz', ({ roomCode }) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return;

      // Check if locked
      if (room.locked) {
        socket.emit('buzzRejected', { reason: 'Buzzers are currently locked' });
        return;
      }

      // Check if player has already buzzed in current round
      const alreadyBuzzed = room.buzzes.some(b => b.id === socket.id);
      if (alreadyBuzzed) return;

      const player = room.players.get(socket.id);
      const playerName = player ? player.name : (socket.data.playerName || 'Player');

      // Millisecond-precision server-authoritative timestamp
      const now = Date.now();
      let deltaMs = 0;

      if (room.buzzes.length > 0) {
        deltaMs = now - room.buzzes[0].timestamp;
      }

      const buzzRecord = {
        id: socket.id,
        name: playerName,
        timestamp: now,
        deltaMs: deltaMs
      };

      room.buzzes.push(buzzRecord);

      // If auto-lock is enabled and this is the first buzz, lock the room
      const isFirst = room.buzzes.length === 1;
      if (isFirst && room.autoLock) {
        room.locked = true;
      }

      // Broadcast the buzz event
      io.to(code).emit('playerBuzzed', {
        player: buzzRecord,
        isFirst,
        position: room.buzzes.length,
        locked: room.locked
      });

      // Broadcast full updated buzzer feed
      io.to(code).emit('buzzerFeedUpdate', room.buzzes);

      // If room locked due to auto-lock, inform all clients
      if (room.locked) {
        io.to(code).emit('buzzersLocked', { locked: true, reason: 'First player buzzed in' });
      }
    });

    // 4. Host clears buzzers
    socket.on('clearBuzzers', ({ roomCode }) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return;

      room.buzzes = [];
      // Clearing buzzers unlocks them automatically ready for the next question
      room.locked = false;

      io.to(code).emit('buzzersCleared', { locked: false });
      io.to(code).emit('buzzerFeedUpdate', []);
      io.to(code).emit('buzzersLocked', { locked: false });
    });

    // 5. Host toggles lock/unlock buzzers
    socket.on('lockBuzzers', ({ roomCode, locked }) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return;

      room.locked = Boolean(locked);

      io.to(code).emit('buzzersLocked', {
        locked: room.locked,
        reason: room.locked ? 'Host locked the buzzers' : 'Host unlocked the buzzers'
      });
    });

    // 6. Host toggles auto-lock setting
    socket.on('toggleAutoLock', ({ roomCode, autoLock }) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return;

      room.autoLock = Boolean(autoLock);
      io.to(code).emit('autoLockUpdated', { autoLock: room.autoLock });
    });

    // 7. Host kicks a player
    socket.on('kickPlayer', ({ roomCode, playerId }) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) return;

      if (room.players.has(playerId)) {
        room.players.delete(playerId);
        // Remove from buzzes if present
        room.buzzes = room.buzzes.filter(b => b.id !== playerId);

        // Notify specific socket
        io.to(playerId).emit('kicked', { message: 'You have been removed from the room by the host.' });

        // Update others
        const playerList = Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));
        io.to(code).emit('updatePlayerList', playerList);
        io.to(code).emit('buzzerFeedUpdate', room.buzzes);
      }
    });

    // 8. Reconnect / sync room state request
    socket.on('requestRoomState', ({ roomCode }, callback) => {
      const code = (roomCode || socket.data.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        if (typeof callback === 'function') callback({ success: false });
        return;
      }

      const playerList = Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));
      const state = {
        success: true,
        roomCode: code,
        locked: room.locked,
        autoLock: room.autoLock,
        players: playerList,
        buzzes: room.buzzes
      };

      if (typeof callback === 'function') callback(state);
      socket.emit('roomState', state);
    });

    // 9. Handle Disconnections
    socket.on('disconnect', () => {
      const code = socket.data.roomCode;
      if (!code) return;

      const room = rooms.get(code);
      if (!room) return;

      if (socket.data.role === 'player') {
        room.players.delete(socket.id);
        const playerList = Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));
        io.to(code).emit('updatePlayerList', playerList);
      } else if (socket.data.role === 'host') {
        // If host disconnects, give 60s grace period before deleting room
        setTimeout(() => {
          const currentRoom = rooms.get(code);
          if (currentRoom && currentRoom.hostSocketId === socket.id) {
            // Check if host reconnected
            io.to(code).emit('hostDisconnected', { message: 'The host has ended or left the room.' });
            rooms.delete(code);
          }
        }, 60000);
      }
    });
  });

  // Serve static files from 'public' directory
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Convenience routes
  app.get('/host', (req, res) => {
    res.sendFile(path.join(publicDir, 'host.html'));
  });

  app.get('/player', (req, res) => {
    res.sendFile(path.join(publicDir, 'player.html'));
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      timestamp: Date.now()
    });
  });

  return { app, server, io, rooms };
}

// Standalone execution support: node server.js
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const PORT = process.env.PORT || 3000;
  const { server } = createBuzzerServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`buzzin.live server running on http://0.0.0.0:${PORT}`);
  });
}
