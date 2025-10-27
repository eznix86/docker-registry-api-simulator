# Docker Registry API v2 Simulator

A Docker Registry HTTP API v2 simulator built with Bun, ElysiaJS, and lowdb. Implements the read-only subset of the Docker Registry spec for testing and development.

## What it does ?

- Docker Registry API v2 spec-compliant
- Multi-configuration support via environment variable
- Repository catalog with pagination (RFC5988 Link headers)
- Tag listing with pagination
- Manifest retrieval:
  - Single-arch: OCI + Docker v2 manifests
  - Multi-arch: OCI image index + Docker manifest list
- ETag and If-None-Match support (304 responses)
- Blob retrieval (config blobs only)
- Basic authentication support
- Swagger UI documentation
- Test simulation using Hurl

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Hurl](https://hurl.dev) (for tests)
- Docker/Podman (optional)

## Installation

```bash
bun install
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up -d
```

Three instances will start:
- registry-full (port 5001) - 4 repositories (data/db-full.json)
- registry-minimal (port 5002) - 1 repository (data/db-minimal.json)
- registry-custom (port 5003) - customizable (data/db-custom.json)

## Usage

Start the server:

```bash
bun dev                         # uses db.json
DB_FILE=db.json bun dev         # to use a custom dataset
PORT=3000 bun dev               # custom port
```

Server runs on http://localhost:5001 by default.

Endpoints:
- Health: http://localhost:5001/v2/
- Swagger: http://localhost:5001/swagger

Run tests:

```bash
hurl --test tests/*.hurl
```

## API Endpoints

```
GET  /v2/                          # Health check
GET  /v2/_catalog                  # List repositories (supports ?n=10&last=alpine)
GET  /v2/:name/tags/list           # List tags (supports ?n=5&last=v1.0)
GET  /v2/:name/manifests/:ref      # Get manifest (supports Accept header, If-None-Match)
HEAD /v2/:name/manifests/:ref      # Manifest headers
GET  /v2/:name/blobs/:digest       # Get blob (config only)
HEAD /v2/:name/blobs/:digest       # Blob headers
```

## Configuration

The simulator uses JSON files for data. Switch between configurations using the `DB_FILE` environment variable.

Available datasets:
- `db.json` - 4 repositories (alpine, nginx, redis, postgres) with auth enabled
- `db-minimal.json` - 1 repository (alpine) with auth disabled
- `db-custom.json` - Examples of:
  - Untagged repository (`untagged-repo`)
  - Single-arch manifest (`single-arch`)
  - Multi-arch manifest (`multi-arch` with amd64 and arm64)
  - Auth disabled

Create custom datasets by copying and modifying these files.

### Authentication

Basic authentication is supported. Add users to the `auth` array in your JSON configuration:

```json
{
  "auth": [
    { "username": "admin", "password": "admin123" },
    { "username": "user", "password": "user123" }
  ]
}
```

If `auth` is an empty array `[]`, authentication is disabled. The `/v2/` health endpoint is always accessible without authentication.

## Examples

```bash
# Health check (no auth required)
curl http://localhost:5001/v2/

# List repositories (with auth)
curl -u admin:admin123 http://localhost:5001/v2/_catalog

# List tags (with auth)
curl -u admin:admin123 http://localhost:5001/v2/alpine/tags/list

# Get manifest with auth (Docker v2)
curl -u admin:admin123 \
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  http://localhost:5001/v2/alpine/manifests/latest

# Get manifest with auth (OCI)
curl -u admin:admin123 \
  -H "Accept: application/vnd.oci.image.manifest.v1+json" \
  http://localhost:5001/v2/alpine/manifests/latest

# Test ETag with auth (returns 304)
ETAG=$(curl -u admin:admin123 -sI http://localhost:5001/v2/alpine/manifests/latest | grep -i etag | cut -d' ' -f2)
curl -u admin:admin123 -H "If-None-Match: $ETAG" http://localhost:5001/v2/alpine/manifests/latest

# Without auth (returns 401 if auth is enabled)
curl http://localhost:5001/v2/_catalog

# Multi-arch manifest list (Docker)
curl -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
  http://localhost:5001/v2/multi-arch/manifests/latest

# Multi-arch OCI index
curl -H "Accept: application/vnd.oci.image.index.v1+json" \
  http://localhost:5001/v2/multi-arch/manifests/latest
```

## Tech Stack

- Bun - JavaScript runtime
- ElysiaJS - Web framework
- lowdb - JSON database
- Hurl - HTTP testing

## License

MIT - See [LICENSE](LICENSE) file for details.
