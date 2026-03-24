import { Pool } from "pg";

const connectionString = process.env.POSTGRES_URL || "postgresql://contextra:contextra@localhost:5432/contextra";

export const postgresPool = new Pool({
  connectionString,
});

export async function initPostgres() {
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      date_of_birth TEXT,
      profile_image_url TEXT,
      settings JSONB NOT NULL DEFAULT '{"language":"en-US","timeZone":"UTC","securityMode":"standard"}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await postgresPool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS date_of_birth TEXT;`);
  await postgresPool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;`);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      genre TEXT NOT NULL,
      mode TEXT NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL,
      document JSONB NOT NULL
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      friend_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (user_id, friend_id)
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_friend_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_direct_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      file_name TEXT,
      file_url TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_project_presence (
      project_id TEXT NOT NULL REFERENCES app_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      chapter_id TEXT,
      last_seen TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS app_project_chat (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES app_projects(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      file_name TEXT,
      file_url TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
}
