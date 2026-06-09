// =============================================================================
// Config - Central configuration with validation
// =============================================================================

export const config = {
  server: {
    port: parseInt(process.env['MCP_SERVER_PORT'] ?? '9000', 10),
    logLevel: process.env['MCP_LOG_LEVEL'] ?? 'info',
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
  },

  postgres: {
    host: process.env['POSTGRES_MONITOR_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_MONITOR_PORT'] ?? '5432', 10),
    database: process.env['POSTGRES_MONITOR_DB'] ?? 'postgres',
    user: process.env['POSTGRES_MONITOR_USER'] ?? '',
    password: process.env['POSTGRES_MONITOR_PASSWORD'] ?? '',
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
  },

  rabbitmq: {
    host: process.env['RABBITMQ_MONITOR_HOST'] ?? 'localhost',
    port: parseInt(process.env['RABBITMQ_MONITOR_PORT'] ?? '15672', 10),
    user: process.env['RABBITMQ_MONITOR_USER'] ?? 'guest',
    password: process.env['RABBITMQ_MONITOR_PASSWORD'] ?? 'guest',
  },

  cloudflare: {
    apiToken: process.env['CLOUDFLARE_API_TOKEN'] ?? '',
    zoneId: process.env['CLOUDFLARE_ZONE_ID'] ?? '',
    baseUrl: 'https://api.cloudflare.com/client/v4',
  },

  qdrant: {
    url: process.env['QDRANT_URL'] ?? 'http://localhost:6333',
  },

  host: {
    // Paths mounted read-only from host into container
    proc: '/host_proc',
    sys: '/host_sys',
    logs: '/host_logs',
    dockerSock: '/var/run/docker.sock',
  },
} as const;

export type Config = typeof config;
