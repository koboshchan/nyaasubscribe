export interface Env {
  botToken: string;
  adminId: number;
}

export function loadEnv(): Env {
  const botToken = process.env.BOT_TOKEN;
  const adminIdRaw = process.env.ADMIN_ID;

  if (!botToken) {
    throw new Error("BOT_TOKEN is not set");
  }
  if (!adminIdRaw) {
    throw new Error("ADMIN_ID is not set");
  }

  const adminId = Number(adminIdRaw);
  if (!Number.isInteger(adminId)) {
    throw new Error("ADMIN_ID must be an integer");
  }

  return { botToken, adminId };
}
