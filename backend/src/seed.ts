import bcrypt from 'bcryptjs';
import { pool } from './config/database';

/**
 * Seed script for GridWatch.
 * Creates: 3 zones, 3 users (2 operators + 1 supervisor),
 * 1000 sensors with rules, and 48 hours of sample readings.
 *
 * Usage: npm run seed
 */
async function seed() {
  console.log('Seeding GridWatch database...\n');
  const start = Date.now();

  try {
    // ============================================================
    // 1. ZONES
    // ============================================================
    console.log('Creating zones...');
    await pool.query(`
      INSERT INTO zones (name, description) VALUES
        ('North Substation Grid', 'Northern region substations covering industrial and residential areas'),
        ('South Distribution Hub', 'Southern distribution network with high-density commercial zones'),
        ('East Power Corridor', 'Eastern transmission corridor connecting remote generating stations')
      ON CONFLICT (name) DO NOTHING
    `);
    const zonesResult = await pool.query('SELECT id, name FROM zones ORDER BY id');
    const zones = zonesResult.rows;
    console.log(`  ✓ ${zones.length} zones created`);

    // ============================================================
    // 2. USERS
    // ============================================================
    console.log('Creating users...');
    const passwordHash = await bcrypt.hash('password123', 10);

    await pool.query(`
      INSERT INTO users (username, password_hash, role, email) VALUES
        ('alice', $1, 'operator', 'alice@gridwatch.io'),
        ('bob', $1, 'operator', 'bob@gridwatch.io'),
        ('charlie', $1, 'supervisor', 'charlie@gridwatch.io')
      ON CONFLICT (username) DO NOTHING
    `, [passwordHash]);

    const usersResult = await pool.query('SELECT id, username, role FROM users ORDER BY id');
    const users = usersResult.rows;

    // Assign zones: alice → North, bob → South, charlie → all
    const alice = users.find((u: any) => u.username === 'alice');
    const bob = users.find((u: any) => u.username === 'bob');
    const charlie = users.find((u: any) => u.username === 'charlie');

    if (alice && bob && charlie) {
      await pool.query(`
        INSERT INTO user_zones (user_id, zone_id) VALUES
          ($1, $4), ($2, $5), ($3, $4), ($3, $5), ($3, $6)
        ON CONFLICT DO NOTHING
      `, [alice.id, bob.id, charlie.id, zones[0].id, zones[1].id, zones[2].id]);
    }
    console.log('  ✓ 3 users created (alice: North, bob: South, charlie: supervisor)');

    // ============================================================
    // 3. SENSORS (1000 total, ~334 per zone)
    // ============================================================
    console.log('Creating 1000 sensors...');
    const sensorValues: string[] = [];
    const sensorParams: any[] = [];
    let paramIdx = 1;

    for (let i = 1; i <= 1000; i++) {
      const zoneIdx = (i - 1) % 3;
      const zone = zones[zoneIdx];
      const sensorId = `SENSOR-${String(i).padStart(4, '0')}`;
      const name = `Substation ${zone.name.split(' ')[0]} Unit ${Math.ceil(i / 3)}`;
      const lat = 28.5 + (Math.random() * 2 - 1); // Around Delhi
      const lng = 77.0 + (Math.random() * 2 - 1);

      sensorValues.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
      sensorParams.push(sensorId, name, zone.id, lat.toFixed(7), lng.toFixed(7));
      paramIdx += 5;
    }

    // Batch insert in chunks of 200
    for (let i = 0; i < sensorValues.length; i += 200) {
      const chunk = sensorValues.slice(i, i + 200);
      const chunkParams: any[] = [];
      for (let j = i; j < Math.min(i + 200, sensorValues.length); j++) {
        const base = j * 5;
        chunkParams.push(...sensorParams.slice(base, base + 5));
      }

      // Re-index placeholders for this chunk
      const reindexed = chunk.map((_, idx) => {
        const b = idx * 5 + 1;
        return `($${b}, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
      });

      await pool.query(
        `INSERT INTO sensors (sensor_id, name, zone_id, latitude, longitude)
         VALUES ${reindexed.join(', ')}
         ON CONFLICT (sensor_id) DO NOTHING`,
        chunkParams
      );
    }

    console.log('  ✓ 1000 sensors created');

    // ============================================================
    // 4. SENSOR RULES
    // ============================================================
    console.log('Creating sensor rules...');
    const sensorsResult = await pool.query('SELECT id FROM sensors ORDER BY id');
    const sensorIds = sensorsResult.rows.map((r: any) => r.id);

    // Batch insert rules: each sensor gets threshold_breach + rate_of_change + pattern_absence
    for (let i = 0; i < sensorIds.length; i += 100) {
      const batch = sensorIds.slice(i, i + 100);
      const ruleValues: string[] = [];
      const ruleParams: any[] = [];
      let rIdx = 1;

      for (const sid of batch) {
        // Rule A: threshold breach
        const isHighRisk = Math.random() < 0.2;
        ruleValues.push(`($${rIdx}, 'threshold_breach', $${rIdx + 1}, $${rIdx + 2})`);
        ruleParams.push(
          sid,
          JSON.stringify({
            min_voltage: 210 + Math.floor(Math.random() * 10),
            max_voltage: 245 + Math.floor(Math.random() * 10),
            min_temp: -10,
            max_temp: 80 + Math.floor(Math.random() * 10),
          }),
          isHighRisk ? 'critical' : 'warning'
        );
        rIdx += 3;

        // Rule B: rate of change
        ruleValues.push(`($${rIdx}, 'rate_of_change', $${rIdx + 1}, $${rIdx + 2})`);
        ruleParams.push(
          sid,
          JSON.stringify({ change_percent: 10 + Math.floor(Math.random() * 15) }),
          isHighRisk ? 'critical' : 'warning'
        );
        rIdx += 3;

        // Rule C: pattern absence
        ruleValues.push(`($${rIdx}, 'pattern_absence', $${rIdx + 1}, $${rIdx + 2})`);
        ruleParams.push(
          sid,
          JSON.stringify({ silence_seconds: 120 }),
          'warning'
        );
        rIdx += 3;
      }

      await pool.query(
        `INSERT INTO sensor_rules (sensor_id, rule_type, config, severity)
         VALUES ${ruleValues.join(', ')}
         ON CONFLICT (sensor_id, rule_type) DO NOTHING`,
        ruleParams
      );
    }
    console.log('  ✓ 3000 sensor rules created');

    // ============================================================
    // 5. READINGS (48 hours of data, every 2 min = 1440 readings per sensor)
    // ============================================================
    console.log('Generating readings (this may take a minute)...');
    const now = new Date();
    const startTime = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    let totalReadings = 0;
    const BATCH_SIZE = 5000;

    // Process sensors in groups of 50 for memory efficiency
    for (let sensorGroup = 0; sensorGroup < sensorIds.length; sensorGroup += 50) {
      const groupIds = sensorIds.slice(sensorGroup, sensorGroup + 50);
      let readingValues: string[] = [];
      let readingParams: any[] = [];
      let pIdx = 1;

      for (const sid of groupIds) {
        // Generate readings every 5 minutes (576 per sensor for 48h) to keep seed manageable
        const intervalMs = 5 * 60 * 1000;
        const numReadings = Math.floor(48 * 60 / 5);

        for (let r = 0; r < numReadings; r++) {
          const ts = new Date(startTime.getTime() + r * intervalMs);

          // Normal values with occasional anomalies
          let voltage = 220 + Math.random() * 20; // 220-240 normal
          let temperature = 25 + Math.random() * 30; // 25-55 normal
          const current = 10 + Math.random() * 40;
          const statusCode = Math.random() < 0.99 ? 0 : 1;

          // ~2% chance of anomalous reading
          if (Math.random() < 0.02) {
            voltage = Math.random() < 0.5 ? 180 + Math.random() * 20 : 260 + Math.random() * 20;
          }
          if (Math.random() < 0.02) {
            temperature = Math.random() < 0.5 ? -15 + Math.random() * 5 : 90 + Math.random() * 20;
          }

          readingValues.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5})`);
          readingParams.push(sid, ts.toISOString(), voltage.toFixed(4), current.toFixed(4), temperature.toFixed(4), statusCode);
          pIdx += 6;

          // Flush batch
          if (readingValues.length >= BATCH_SIZE) {
            await pool.query(
              `INSERT INTO readings (sensor_id, "timestamp", voltage, current, temperature, status_code)
               VALUES ${readingValues.join(', ')}`,
              readingParams
            );
            totalReadings += readingValues.length;
            readingValues = [];
            readingParams = [];
            pIdx = 1;
          }
        }
      }

      // Flush remaining
      if (readingValues.length > 0) {
        await pool.query(
          `INSERT INTO readings (sensor_id, "timestamp", voltage, current, temperature, status_code)
           VALUES ${readingValues.join(', ')}`,
          readingParams
        );
        totalReadings += readingValues.length;
      }

      if ((sensorGroup + 50) % 200 === 0 || sensorGroup + 50 >= sensorIds.length) {
        console.log(`  ... ${Math.min(sensorGroup + 50, sensorIds.length)}/${sensorIds.length} sensors seeded (${totalReadings} readings)`);
      }
    }

    // Update last_reading_at for all sensors
    await pool.query(`
      UPDATE sensors s
      SET last_reading_at = sub.max_ts
      FROM (
        SELECT sensor_id, MAX("timestamp") as max_ts
        FROM readings
        GROUP BY sensor_id
      ) sub
      WHERE s.id = sub.sensor_id
    `);

    console.log(`  ✓ ${totalReadings} readings created`);

    // ============================================================
    // DONE
    // ============================================================
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✓ Seed completed in ${elapsed}s`);
    console.log('\nSeed accounts:');
    console.log('  alice    / password123  (operator — North Substation Grid)');
    console.log('  bob      / password123  (operator — South Distribution Hub)');
    console.log('  charlie  / password123  (supervisor — all zones)\n');

  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
