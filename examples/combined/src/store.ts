import { randomUUID } from "node:crypto";
import type { UserRecord, UserStore } from "@bootstrap-framework/auth";

interface MemoryUser extends UserRecord {
  passwordHash?: string;
}

export function createMemoryUserStore(): UserStore & { users: Map<string, MemoryUser> } {
  const users = new Map<string, MemoryUser>();

  const store: UserStore & { users: Map<string, MemoryUser> } = {
    users,

    async findById(id) {
      return users.get(String(id)) ?? null;
    },

    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },

    async findByCredentials(identifier) {
      return store.findByEmail?.(identifier) ?? null;
    },

    async create(input) {
      const id = randomUUID();
      const roles = Array.isArray(input.roles) ? input.roles as string[] : ["member"];
      const user: MemoryUser = {
        id,
        email: input.email as string | undefined,
        username: input.username as string | undefined,
        name: input.name as string | undefined,
        roles,
        passwordHash: input.passwordHash as string | undefined,
      };
      users.set(id, user);
      return user;
    },

    async updatePassword(id, passwordHash) {
      const user = users.get(String(id));
      if (user) {
        user.passwordHash = passwordHash;
      }
    },
  };

  return store;
}

export function createDatabaseUserStore(db: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  queryOne: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>;
}): UserStore {
  function mapRow(row: Record<string, unknown> | null): UserRecord | null {
    if (!row) {
      return null;
    }
    const roles = typeof row.roles === "string"
      ? row.roles.split(",").map((role) => role.trim()).filter(Boolean)
      : Array.isArray(row.roles)
        ? row.roles as string[]
        : ["member"];
    return {
      id: row.id as string,
      email: row.email as string | undefined,
      roles,
      passwordHash: row.password_hash as string | undefined,
    };
  }

  return {
    async findById(id) {
      const row = await db.queryOne("SELECT id, email, roles, password_hash FROM users WHERE id = $1", [id]);
      return mapRow(row);
    },

    async findByEmail(email) {
      const row = await db.queryOne("SELECT id, email, roles, password_hash FROM users WHERE email = $1", [email]);
      return mapRow(row);
    },

    async findByCredentials(identifier) {
      const row = await db.queryOne("SELECT id, email, roles, password_hash FROM users WHERE email = $1", [identifier]);
      return mapRow(row);
    },

    async create(input) {
      const id = randomUUID();
      const roles = Array.isArray(input.roles) ? (input.roles as string[]).join(",") : "member";
      const row = await db.queryOne(
        `INSERT INTO users (id, email, password_hash, roles)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, roles, password_hash`,
        [id, input.email, input.passwordHash, roles],
      );
      return mapRow(row) as UserRecord;
    },

    async updatePassword(id, passwordHash) {
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
    },
  };
}

export async function ensureUsersTable(db: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
