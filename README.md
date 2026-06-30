# SMIASB Docker PostgreSQL

Docker Compose ini menyiapkan PostgreSQL lokal untuk migrasi SMIASB.

## Command

```bash
docker compose up -d
docker ps
docker compose down
```

## Konfigurasi Backend Lokal

Gunakan environment berikut saat backend diarahkan ke PostgreSQL lokal:

```env
DB_CLIENT=postgres
PGHOST=localhost
PGPORT=5433
PGDATABASE=smiasb_postgres
PGUSER=postgres
PGPASSWORD=postgres123
```
