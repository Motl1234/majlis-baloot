interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface D1Meta {
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
}

interface D1Result<T = Record<string, unknown>> {
  error?: string;
  meta: D1Meta;
  results: T[];
  success: boolean;
}

type D1Response<T = Record<string, unknown>> = D1Result<T>;

interface D1PreparedStatement {
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  raw<T extends unknown[] = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[]>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<D1Result<T>>>;
  dump(): Promise<ArrayBuffer>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  prepare(query: string): D1PreparedStatement;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    [key: string]: unknown;
  };
}
