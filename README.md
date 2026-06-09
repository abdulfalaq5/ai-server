# server-ai-monitoring

> 🔍 **AI-powered server monitoring** menggunakan MCP (Model Context Protocol)

Stack: **Node.js 22** · **TypeScript** · **Docker** · **MCP SDK** · **OpenAI-compatible API**

---

## Arsitektur

```
MCP Monitoring Server (Node.js + TypeScript)
    │
    ├── /proc (CPU, Memory, Network, Disk) ← host mount :ro
    ├── /sys                               ← host mount :ro
    ├── /var/log                           ← host mount :ro
    ├── docker.sock                        ← host mount :ro
    ├── PostgreSQL (SELECT only)
    ├── RabbitMQ Management API (GET only)
    └── Cloudflare API (GET only)
```

---

## Quick Start

```bash
# 1. Buat network docker (jika belum ada)
docker network create infra_net

# 2. Clone dan setup
git clone <repo-url> server-ai-monitoring
cd server-ai-monitoring
cp .env.example .env
nano .env

# 3. Sesuaikan port di .env jika perlu (default 9003)
# MCP_SERVER_PORT=9003

# 4. Jalankan
docker compose up -d

# 5. Verifikasi
curl http://localhost:9003/health
```

---

## Cara Penggunaan (Integrasi ke ai-spv)

Service ini bertindak sebagai **MCP Server** yang independen. Untuk menggunakannya, tambahkan konfigurasi ini ke dalam MCP client (misalnya **ai-spv** atau **OpenClaw** yang berjalan di server terpisah):

```json
{
  "mcpServers": {
    "server-monitoring": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "url": "http://<IP_SERVER_MONITORING>:9003/mcp"
    }
  }
}
```

*Catatan: Sesuaikan IP dan port dengan lokasi server ini di-_deploy_.*

---

## Monitoring Tools

| Tool | Sumber Data |
|------|------------|
| `get_cpu_usage` | `/proc/stat`, `/proc/loadavg` |
| `get_memory_usage` | `/proc/meminfo` |
| `get_disk_usage` | `/proc/mounts` |
| `get_network_status` | `/proc/net/dev` |
| `get_docker_containers` | Docker API |
| `get_docker_stats` | Docker API |
| `get_postgres_status` | PostgreSQL (read-only) |
| `get_rabbitmq_status` | RabbitMQ Management API |
| `get_nginx_status` | `/proc` + nginx stub_status |
| `get_cloudflared_status` | Cloudflare API |
| `read_recent_logs` | `/var/log` (allowlist protected) |

---

## Security

- ✅ Semua tool **READ-ONLY** — tidak ada yang dapat memodifikasi sistem
- ✅ Container berjalan sebagai **non-root user**
- ✅ Semua host mount bersifat **`:ro`** (read-only)
- ✅ Flag **`no-new-privileges`** aktif
- ✅ Log reader dilindungi **strict allowlist** (anti path traversal)
- ✅ Docker API hanya digunakan untuk **list & stats**

Lihat [docs/security.md](docs/security.md) untuk penjelasan lengkap.

---

## Dokumentasi

- [Setup & Installation](docs/setup.md)
- [Architecture](docs/architecture.md)
- [Security Guide](docs/security.md)

---

## Structure

```
server-ai-monitoring/
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── setup.md
│   └── security.md
└── mcp-monitoring/
    ├── src/
    │   ├── tools/          # 11 monitoring tools
    │   ├── services/       # host-reader
    │   ├── config/         # configuration
    │   ├── types/          # TypeScript interfaces
    │   └── server.ts       # main entry point
    ├── Dockerfile
    ├── package.json
    └── tsconfig.json
```
