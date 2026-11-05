# Docker en local (Caddy + backend + Postgres 18)

Requiere Docker Desktop. Antes de levantar nada, copiar `.env.example` →
`.env` en la raíz del repo y reemplazar los `CAMBIAR_ESTE_VALOR`. El `.env`
real nunca se comitea (ya está en `.gitignore`).

## Levantar

```
docker compose up --build
```

La app queda en `http://localhost` (Caddy sirve el frontend y hace proxy
de `/api` al backend). Al arrancar, el backend corre `prisma migrate
deploy` automáticamente antes de levantar el proceso.

## Ver logs

```
docker compose logs -f            # todos los servicios
docker compose logs -f backend    # solo uno
```

## Ver estado / recursos

```
docker compose ps
docker stats
```

## Parar (conserva los datos)

```
docker compose down
```

## Borrar todo, incluyendo los datos de Postgres

```
docker compose down -v
```

## Recrear solo un servicio (ej. backend, tras un cambio de imagen)

```
docker compose up -d --build --force-recreate backend
```
