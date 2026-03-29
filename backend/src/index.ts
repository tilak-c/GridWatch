import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

import { pool, testConnection } from './config/database';
import { initSocketIO } from './services/realtimeService';
import { authMiddleware } from './middleware/auth';
import { startAnomalyWorker } from './workers/anomalyWorker';
import { startAbsenceWorker } from './workers/absenceWorker';
import { startEscalationWorker } from './workers/escalationWorker';

import authRoutes from './routes/auth';
import ingestRoutes from './routes/ingest';
import alertRoutes from './routes/alerts';
import sensorRoutes from './routes/sensors';
import suppressionRoutes from './routes/suppressions';
import { AuthUser } from './types';

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS for frontend
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Large batches up to 1000 readings

// Health check (unauthenticated)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gridwatch-backend', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ingest', authMiddleware, ingestRoutes);
app.use('/api/alerts', authMiddleware, alertRoutes);
app.use('/api/sensors', authMiddleware, sensorRoutes);
app.use('/api/suppressions', authMiddleware, suppressionRoutes);

// Socket.IO authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) { next(new Error('Authentication required')); return; }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'gridwatch-jwt-secret-change-in-production'
    ) as AuthUser;
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Socket.IO connection — join zone rooms for real-time events
io.on('connection', async (socket) => {
  const user: AuthUser = socket.data.user;
  console.log(`✓ Socket connected: ${user.username} (${user.role})`);

  if (user.role === 'supervisor') {
    // Supervisors join ALL zone rooms
    const result = await pool.query('SELECT id FROM zones');
    for (const zone of result.rows) {
      socket.join(`zone:${zone.id}`);
    }
  } else {
    // Operators join only their assigned zones
    for (const zoneId of user.zoneIds) {
      socket.join(`zone:${zoneId}`);
    }
  }

  socket.on('disconnect', () => {
    console.log(`✗ Socket disconnected: ${user.username}`);
  });
});

// Initialize Socket.IO service
initSocketIO(io);

// Start the server
async function start() {
  try {
    await testConnection();

    // Start background workers
    startAnomalyWorker();
    startAbsenceWorker();
    startEscalationWorker();

    const PORT = parseInt(process.env.PORT || '5000');
    server.listen(PORT, () => {
      console.log(`\n🔌 GridWatch backend running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready for real-time connections`);
      console.log(`📋 API endpoints:`);
      console.log(`   POST /api/auth/login`);
      console.log(`   POST /api/ingest`);
      console.log(`   GET  /api/sensors`);
      console.log(`   GET  /api/sensors/:id`);
      console.log(`   GET  /api/sensors/:id/history`);
      console.log(`   GET  /api/alerts`);
      console.log(`   PATCH /api/alerts/:id/transition`);
      console.log(`   POST /api/suppressions`);
      console.log(`   GET  /api/suppressions\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
