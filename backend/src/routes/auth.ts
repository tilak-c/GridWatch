import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database';
import { generateToken } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token with zone information.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    // Find user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Get user's zone assignments
    const zonesResult = await pool.query(
      `SELECT uz.zone_id, z.name as zone_name
       FROM user_zones uz
       JOIN zones z ON z.id = uz.zone_id
       WHERE uz.user_id = $1`,
      [user.id]
    );

    const zoneIds = zonesResult.rows.map((r: any) => r.zone_id);
    const zones = zonesResult.rows;

    // Generate token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      zoneIds,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        zones,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
