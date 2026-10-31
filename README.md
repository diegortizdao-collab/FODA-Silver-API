# Contexto de la organización · API (Cloudflare Worker + Neon)

Backend de la app `FODA-Silver`. Usa la base de Neon del proyecto **Silver No Conformidades**.
Desarrollado por Mgter. Diego Ortiz — Líder de Mejora Continua | Consultor ISO

Registros ISO 9001 cubiertos (cláusulas 4.1, 4.2 y 6.1): **A.31 FODA**, **A.29 Riesgos y oportunidades**, **A.32 Partes interesadas**.

## Tablas (ya creadas y cargadas con 2026)
`foda_items`, `a29_riesgos`, `a29_oportunidades`, `a32_partes`, `a32_necesidades` y `ctx_historial` (cada cambio: quién, qué, antes y después).
Esquema en `db/schema.sql`; datos 2026 en `db/seed_2026.sql` (ya aplicados; no volver a correr salvo base nueva).

## Despliegue
Igual que `A20-Auditorias-Silver-API`: usa los secrets `ADMIN_KEY` y `DATABASE_URL` del Secrets Store (declarados en `wrangler.toml`).
Conectar este repo en Cloudflare › Workers & Pages › Create › Import a repository. Al desplegar, probar
`https://foda-silver-api.<subdominio>.workers.dev/api/health` → `{"ok":true}`.

## Endpoints (todos con cabecera `X-Clave` = ADMIN_KEY, salvo /api/health)
- `GET /api/anios` · `GET /api/contexto?anio=2026` (los 5 registros del año) · `GET /api/evolucion` · `GET /api/historial?anio=2026`
- `POST /api/anios` {anio, desde} — año nuevo copiando el anterior (los puntos quedan «sin valorar» y «A validar»)
- `POST /api/foda|riesgos|oportunidades|partes|necesidades` {anio, ...campos} — alta (el código o número se asigna solo)
- `PATCH /api/<registro>/<anio>/<clave>` {campo: valor} — cambia campos sueltos; en riesgos el nivel se recalcula con la matriz 5×5
- `DELETE /api/<registro>/<anio>/<clave>`
