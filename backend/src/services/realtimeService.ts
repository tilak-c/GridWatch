import { Server as SocketServer } from 'socket.io';

let io: SocketServer;

export function initSocketIO(socketServer: SocketServer): void {
  io = socketServer;
  console.log('✓ Socket.IO real-time service initialized');
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

/**
 * Emit sensor state change to all operators in the zone.
 */
export function emitSensorStateChange(
  zoneId: number,
  payload: { sensorId: number; sensorExternalId: string; status: string; previousStatus: string }
): void {
  if (!io) return;
  io.to(`zone:${zoneId}`).emit('sensor:stateChange', payload);
}

/**
 * Emit new alert to all operators in the zone.
 */
export function emitNewAlert(zoneId: number, alert: any): void {
  if (!io) return;
  io.to(`zone:${zoneId}`).emit('alert:new', alert);
}

/**
 * Emit alert status update to all operators in the zone.
 */
export function emitAlertUpdated(zoneId: number, alert: any): void {
  if (!io) return;
  io.to(`zone:${zoneId}`).emit('alert:updated', alert);
}

/**
 * Emit alert escalation to all operators in the zone.
 */
export function emitAlertEscalated(zoneId: number, alert: any): void {
  if (!io) return;
  io.to(`zone:${zoneId}`).emit('alert:escalated', alert);
}
