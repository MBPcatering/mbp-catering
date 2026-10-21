import "server-only";
import { createClient } from "@supabase/supabase-js";

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new SupabaseConfigurationError(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

export function createSupabaseServerClient() {
  const url = requiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironmentVariable(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
