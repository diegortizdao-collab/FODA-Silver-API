-- Contexto de la organización · Silver Industrial (A.31 FODA, A.29 Riesgos y oportunidades, A.32 Partes interesadas)
-- Se aplica en Neon (proyecto Silver No Conformidades). Idempotente.
create table if not exists foda_items (
  anio int not null, codigo text not null, cuadrante text not null check (cuadrante in ('F','D','O','A')),
  orden int not null, texto text not null, estado_vs_anterior text, iso text, evidencia text, deriva text,
  a_validar boolean not null default false,
  importancia int not null default 3 check (importancia between 1 and 5),
  intensidad int not null default 3 check (intensidad between 1 and 5),
  tendencia int not null default 3 check (tendencia between 1 and 5),
  valorado boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (anio, codigo));
create table if not exists a29_riesgos (
  anio int not null, nro int not null, origen text, proceso text, riesgo text not null,
  probabilidad text, impacto text, nivel_inicial text, decision text, plan text,
  prob_residual text, impacto_residual text, nivel_residual text, seguimiento text, estado text, observaciones text,
  a_validar boolean not null default false, actualizado_en timestamptz not null default now(),
  primary key (anio, nro));
create table if not exists a29_oportunidades (
  anio int not null, nro int not null, origen text, proceso text, oportunidad text not null, accion text,
  beneficio text, factibilidad text, prioridad text, responsable text, plazo text, indicador text,
  seguimiento text, estado text, a_validar boolean not null default false, actualizado_en timestamptz not null default now(),
  primary key (anio, nro));
create table if not exists a32_partes (
  anio int not null, nro int not null, parte text not null, poder int check (poder between 1 and 4),
  interes int check (interes between 1 and 4), nivel text, pertinente text, justificacion text, cambio text,
  a_validar boolean not null default false, actualizado_en timestamptz not null default now(),
  primary key (anio, nro));
create table if not exists a32_necesidades (
  anio int not null, codigo text not null, parte text, necesidad text not null, eval_anterior text, eval_propuesta text,
  fuente text, evidencia text, aborda_sgc text, justificacion text, deriva text,
  a_validar boolean not null default false, actualizado_en timestamptz not null default now(),
  primary key (anio, codigo));
create table if not exists ctx_historial (
  id bigserial primary key, anio int not null, registro text not null, clave text not null, campo text not null,
  antes text, despues text, en timestamptz not null default now());
create index if not exists ctx_historial_idx on ctx_historial (anio, registro, clave);
