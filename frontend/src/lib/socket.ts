import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('✓ Socket.IO connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('✗ Socket.IO disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket.IO error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
