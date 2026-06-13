/* global process, console */

/**
 * Seed script: inserts ~30 days of synthetic vitals data (sleep + recovery + heart rate)
 * for a target user. Idempotent via dedupeKey.
 *
 * Usage:
 *   node ./scripts/seed-vitals-demo.mjs --user <email>
 *   SEED_USER_EMAIL=user@example.com node ./scripts/seed-vitals-demo.mjs
 */

import "dotenv/config";
import postgres from "postgres";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const userEmail = (() => {
  const idx = process.argv.indexOf("--user");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return process.env.SEED_USER_EMAIL ?? null;
})();

if (!userEmail) {
  console.error("ERROR: Provide a target user email via --user <email> or SEED_USER_EMAIL env.");
  process.exit(1);
}

const sql = postgres(databaseUrl);

// ---------------------------------------------------------------------------
// Heart-rate zone helpers (inline — avoids import complications in .mjs)
// ---------------------------------------------------------------------------

function deriveMaxHeartRate(birthDate) {
  if (!birthDate) return 190;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return 190;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const hasHadBirthday =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  if (!hasHadBirthday) age -= 1;
  if (age < 5 || age > 120) return 190;
  return Math.max(100, 220 - age);
}

function computeHeartRateZones(samples, maxHr) {
  const zoneSec = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  if (samples.length === 0 || maxHr <= 0) {
    return { z1Min: 0, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 };
  }
  const sorted = [...samples].sort((a, b) => a.offsetSec - b.offsetSec);
  for (let i = 0; i < sorted.length; i++) {
    const sample = sorted[i];
    const next = sorted[i + 1];
    const durationSec = next ? Math.min(60, Math.max(0, next.offsetSec - sample.offsetSec)) : 1;
    const pct = sample.bpm / maxHr;
    if (pct < 0.6) zoneSec.z1 += durationSec;
    else if (pct < 0.7) zoneSec.z2 += durationSec;
    else if (pct < 0.8) zoneSec.z3 += durationSec;
    else if (pct < 0.9) zoneSec.z4 += durationSec;
    else zoneSec.z5 += durationSec;
  }
  return {
    z1Min: Math.round(zoneSec.z1 / 60),
    z2Min: Math.round(zoneSec.z2 / 60),
    z3Min: Math.round(zoneSec.z3 / 60),
    z4Min: Math.round(zoneSec.z4 / 60),
    z5Min: Math.round(zoneSec.z5 / 60),
  };
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random (avoids crypto dep)
// ---------------------------------------------------------------------------

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toIso(date) {
  return date.toISOString();
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  // 1. Resolve user
  const [userRow] = await sql`SELECT id FROM users WHERE email = ${userEmail} LIMIT 1`;
  if (!userRow) {
    console.error(
      `ERROR: No user found with email "${userEmail}". Log in once to create the user row.`,
    );
    process.exit(1);
  }
  const userId = userRow.id;
  console.log(`Seeding vitals for user ${userId} (${userEmail})`);

  // 2. Resolve birth date for max HR (best-effort)
  const [profileRow] =
    await sql`SELECT birth_date FROM user_profiles WHERE user_id = ${userId} LIMIT 1`;
  const birthDate = profileRow?.birth_date ?? null;
  const maxHr = deriveMaxHeartRate(birthDate);
  console.log(`  Max HR: ${maxHr} (birth_date: ${birthDate ?? "unknown"})`);

  // 3. Upsert a wearable deviceConsent (idempotent).
  // device_consents has a non-unique (user_id, provider) index, so ON CONFLICT cannot
  // be used — we SELECT first and only INSERT when no active consent exists.
  let consentId;
  const [existingConsent] =
    await sql`SELECT id FROM device_consents WHERE user_id = ${userId} AND provider = 'wearable' AND revoked_at IS NULL LIMIT 1`;
  if (existingConsent) {
    consentId = existingConsent.id;
    console.log(`  Re-using existing deviceConsent ${consentId}`);
  } else {
    const [newConsent] = await sql`
      INSERT INTO device_consents (user_id, provider, granted_scopes, allow_ai_context, consent_version)
      VALUES (
        ${userId},
        'wearable',
        ${JSON.stringify(["sleep", "recovery_inputs", "heart_rate"])}::jsonb,
        true,
        'v1'
      )
      RETURNING id
    `;
    consentId = newConsent.id;
    console.log(`  Created deviceConsent ${consentId}`);
  }

  // 4. Upsert a deviceConnection (idempotent via unique index on user_id + provider)
  const [connection] = await sql`
    INSERT INTO device_connections (user_id, consent_id, provider, platform, status, granted_scopes, connected_at)
    VALUES (
      ${userId},
      ${consentId},
      'wearable',
      'web',
      'connected',
      ${JSON.stringify(["sleep", "recovery_inputs", "heart_rate"])}::jsonb,
      NOW()
    )
    ON CONFLICT (user_id, provider) DO UPDATE
      SET status = 'connected', connected_at = NOW()
    RETURNING id
  `;
  const connectionId = connection.id;
  console.log(`  deviceConnection ${connectionId}`);

  // 5. Generate 30 days of data
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const DAYS = 30;
  const rand = seededRand(userId.charCodeAt(0) * 31337);

  let sleepInserted = 0;
  let sleepSkipped = 0;
  let recoveryInserted = 0;
  let recoverySkipped = 0;
  let hrInserted = 0;
  let hrSkipped = 0;

  // Workout days (6 evenly spread through the 30 days)
  const workoutDayOffsets = [2, 6, 11, 16, 21, 27];
  const workoutActivities = ["running", "cycling", "rowing", "strength", "hiit", "swimming"];

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dateStr = toDateStr(date);

    // --- Sleep snapshot ---
    const sleepHours = 6 + rand() * 2.5; // 6–8.5h
    const sleepDurationMinutes = Math.round(sleepHours * 60);
    const sleepEnd = new Date(date);
    sleepEnd.setUTCHours(7, Math.round(rand() * 30), 0, 0);
    const sleepStart = new Date(sleepEnd.getTime() - sleepDurationMinutes * 60 * 1000);

    const awake = Math.round(sleepDurationMinutes * 0.05);
    const rem = Math.round(sleepDurationMinutes * (0.2 + rand() * 0.05));
    const deep = Math.round(sleepDurationMinutes * (0.15 + rand() * 0.1));
    const light = sleepDurationMinutes - awake - rem - deep;

    const sleepPayload = {
      durationMinutes: sleepDurationMinutes,
      intervalStart: toIso(sleepStart),
      intervalEnd: toIso(sleepEnd),
      stageSummary: {
        awakeMinutes: awake,
        remMinutes: rem,
        lightMinutes: Math.max(0, light),
        deepMinutes: deep,
      },
    };

    const sleepDedupeKey = `wearable:seed:sleep:${userId}:${dateStr}`;

    const [sleepSnap] = await sql`
      INSERT INTO health_metric_snapshots
        (user_id, consent_id, device_connection_id, metric_type, provider, dedupe_key,
         observed_at, observed_end_at, unit, normalized_payload)
      VALUES (
        ${userId}, ${consentId}, ${connectionId}, 'sleep', 'wearable',
        ${sleepDedupeKey}, ${toIso(sleepStart)}, ${toIso(sleepEnd)},
        'minutes', ${JSON.stringify(sleepPayload)}::jsonb
      )
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id
    `;
    if (sleepSnap) sleepInserted++;
    else sleepSkipped++;
    // Sleep aggregate seeding intentionally omitted: VitalsReadService recomputes
    // the 7-day average from snapshots directly, and recovery-signal-collector
    // falls back to snapshots when no aggregate is present. No reader consumes
    // seeded sleep aggregate rows.

    // --- Resting HR snapshot ---
    const restingHr = Math.round(52 + rand() * 18); // 52–70 bpm
    const rhrPayload = { inputType: "resting_heart_rate", value: restingHr, unit: "bpm" };
    const rhrAt = new Date(date);
    rhrAt.setUTCHours(8, 0, 0, 0);
    const rhrDedupeKey = `wearable:seed:rhr:${userId}:${dateStr}`;

    const [rhrSnap] = await sql`
      INSERT INTO health_metric_snapshots
        (user_id, consent_id, device_connection_id, metric_type, provider, dedupe_key,
         observed_at, unit, normalized_payload)
      VALUES (
        ${userId}, ${consentId}, ${connectionId}, 'recovery_input', 'wearable',
        ${rhrDedupeKey}, ${toIso(rhrAt)}, 'bpm', ${JSON.stringify(rhrPayload)}::jsonb
      )
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id
    `;
    if (rhrSnap) recoveryInserted++;
    else recoverySkipped++;

    // --- HRV snapshot ---
    const hrv = Math.round(45 + rand() * 35); // 45–80 ms
    const hrvPayload = { inputType: "hrv_summary", value: hrv, unit: "ms" };
    const hrvAt = new Date(rhrAt);
    const hrvDedupeKey = `wearable:seed:hrv:${userId}:${dateStr}`;

    const [hrvSnap] = await sql`
      INSERT INTO health_metric_snapshots
        (user_id, consent_id, device_connection_id, metric_type, provider, dedupe_key,
         observed_at, unit, normalized_payload)
      VALUES (
        ${userId}, ${consentId}, ${connectionId}, 'recovery_input', 'wearable',
        ${hrvDedupeKey}, ${toIso(hrvAt)}, 'ms', ${JSON.stringify(hrvPayload)}::jsonb
      )
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id
    `;
    if (hrvSnap) recoveryInserted++;
    else recoverySkipped++;

    // --- Readiness score (every 3rd day) ---
    if (i % 3 === 0) {
      const readiness = Math.round(60 + rand() * 35); // 60–95
      const readinessPayload = { inputType: "readiness_score", value: readiness, unit: "score" };
      const readinessDedupeKey = `wearable:seed:readiness:${userId}:${dateStr}`;

      const [readinessSnap] = await sql`
        INSERT INTO health_metric_snapshots
          (user_id, consent_id, device_connection_id, metric_type, provider, dedupe_key,
           observed_at, unit, normalized_payload)
        VALUES (
          ${userId}, ${consentId}, ${connectionId}, 'recovery_input', 'wearable',
          ${readinessDedupeKey}, ${toIso(rhrAt)}, 'score', ${JSON.stringify(readinessPayload)}::jsonb
        )
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING id
      `;
      if (readinessSnap) recoveryInserted++;
      else recoverySkipped++;
    }

    // --- Heart rate workout snapshot (6 specific days) ---
    const workoutDayOffset = DAYS - 1 - i;
    if (workoutDayOffsets.includes(workoutDayOffset)) {
      const workoutIdx = workoutDayOffsets.indexOf(workoutDayOffset);
      const activity = workoutActivities[workoutIdx % workoutActivities.length];
      const durationSec = 1800 + Math.round(rand() * 1800); // 30–60 min
      const avgBpm = Math.round(130 + rand() * 30);
      const maxBpm = Math.round(avgBpm + 15 + rand() * 20);
      const minBpm = Math.round(avgBpm - 20 - rand() * 15);

      // Generate samples every 30 seconds (downsampled)
      const samples = [];
      for (let s = 0; s <= durationSec; s += 30) {
        const phase = s / durationSec;
        // Warm-up ramp, peak in middle, cool-down
        let bpm;
        if (phase < 0.15) {
          bpm = minBpm + Math.round((avgBpm - minBpm) * (phase / 0.15));
        } else if (phase < 0.85) {
          bpm = avgBpm - 10 + Math.round(rand() * 20);
        } else {
          bpm = avgBpm - Math.round((avgBpm - minBpm) * ((phase - 0.85) / 0.15));
        }
        bpm = Math.max(minBpm, Math.min(maxBpm, bpm));
        samples.push({ offsetSec: s, bpm });
      }

      const zoneSummary = computeHeartRateZones(samples, maxHr);

      const workoutStart = new Date(date);
      workoutStart.setUTCHours(10, 0, 0, 0);
      const workoutEnd = new Date(workoutStart.getTime() + durationSec * 1000);

      const hrPayload = {
        context: "workout",
        avgBpm,
        maxBpm,
        minBpm,
        activityType: activity,
        samples,
        zoneSummary,
      };

      const hrDedupeKey = `wearable:seed:hr:${userId}:${dateStr}:${activity}`;

      const [hrSnap] = await sql`
        INSERT INTO health_metric_snapshots
          (user_id, consent_id, device_connection_id, metric_type, provider, dedupe_key,
           observed_at, observed_end_at, unit, normalized_payload)
        VALUES (
          ${userId}, ${consentId}, ${connectionId}, 'heart_rate', 'wearable',
          ${hrDedupeKey}, ${toIso(workoutStart)}, ${toIso(workoutEnd)},
          'bpm', ${JSON.stringify(hrPayload)}::jsonb
        )
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING id
      `;
      if (hrSnap) hrInserted++;
      else hrSkipped++;
    }
  }

  console.log(`\nDone.`);
  console.log(
    `  Sleep snapshots:    ${sleepInserted} inserted, ${sleepSkipped} skipped (already existed)`,
  );
  console.log(
    `  Recovery snapshots: ${recoveryInserted} inserted, ${recoverySkipped} skipped`,
  );
  console.log(
    `  Heart rate workouts: ${hrInserted} inserted, ${hrSkipped} skipped`,
  );
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
