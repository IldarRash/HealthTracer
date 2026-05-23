import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/health_tracer");
const rows = await sql`
  SELECT id, intent, validation_status, validation_errors, proposed_changes, status, created_at
  FROM ai_proposals
  ORDER BY created_at DESC
  LIMIT 3
`;
console.log(JSON.stringify(rows, null, 2));
await sql.end();
