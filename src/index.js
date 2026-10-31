// Contexto de la organización — API (Cloudflare Worker + Neon)
// Silver Industrial · ISO 9001 · A.31 FODA, A.29 Riesgos y oportunidades, A.32 Partes interesadas
// Un solo rol: administrador (clave ADMIN_KEY, la misma del P.07 y de A.20). Cada campo se guarda por separado
// y cada cambio queda en ctx_historial (quién cambió qué y cuándo).

import { neon } from '@neondatabase/serverless';

const DEFAULT_ORIGINS = ['https://diegortizdao-collab.github.io'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function secret(binding) {
  if (binding == null) return null;
  if (typeof binding === 'string') return binding;
  if (typeof binding.get === 'function') return await binding.get();
  return null;
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function requireAdmin(req, env) {
  const given = req.headers.get('X-Clave');
  const admin = await secret(env.ADMIN_KEY);
  if (!given || !admin || !(await safeEqual(given, admin))) throw new HttpError(401, 'Clave incorrecta.');
}

function corsHeaders(req, env) {
  const allowed = env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(',').map(s => s.trim()) : DEFAULT_ORIGINS;
  const origin = req.headers.get('Origin');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Clave',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(req, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req, env) },
  });
}

async function readBody(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'El cuerpo no es JSON válido.'); }
}

// ---------- matriz de riesgo (la del A.29, hoja Datos) ----------
const PROB = ['Improbable', 'Remoto', 'Ocasional', 'Probable', 'Muy Probable'];
const IMPA = ['Insignificante', 'Menor', 'Moderado', 'Mayor', 'Catastrófico'];
const NIVELES = ['Bajo', 'Moderado', 'Alto', 'Extremo'];
const MATRIZ = [
  ['Bajo', 'Bajo', 'Moderado', 'Alto', 'Alto'],
  ['Bajo', 'Bajo', 'Moderado', 'Alto', 'Extremo'],
  ['Bajo', 'Moderado', 'Alto', 'Extremo', 'Extremo'],
  ['Moderado', 'Alto', 'Alto', 'Extremo', 'Extremo'],
  ['Alto', 'Alto', 'Extremo', 'Extremo', 'Extremo'],
];
function nivel(p, i) {
  const a = PROB.indexOf(p), b = IMPA.indexOf(i);
  return a < 0 || b < 0 ? null : MATRIZ[a][b];
}

// ---------- definición de los registros ----------
// tipos: t = texto, b = booleano, i = entero, r5 = entero 1..5, r4 = entero 1..4, e:[...] = lista cerrada
const REG = {
  foda: {
    table: 'foda_items', key: ['codigo'], order: 'orden, codigo', label: 'A.31 FODA',
    cols: {
      cuadrante: { e: ['F', 'D', 'O', 'A'] }, orden: 'i', texto: 't', estado_vs_anterior: 't', iso: 't', evidencia: 't', deriva: 't',
      a_validar: 'b', importancia: 'r5', intensidad: 'r5', tendencia: 'r5', valorado: 'b',
    },
    required: ['cuadrante', 'texto'],
  },
  riesgos: {
    table: 'a29_riesgos', key: ['nro'], order: 'nro', label: 'A.29 Riesgos',
    cols: {
      origen: 't', proceso: 't', riesgo: 't', probabilidad: { e: PROB }, impacto: { e: IMPA }, nivel_inicial: { e: NIVELES },
      decision: 't', plan: 't', prob_residual: { e: PROB }, impacto_residual: { e: IMPA }, nivel_residual: { e: NIVELES },
      seguimiento: 't', estado: 't', observaciones: 't', a_validar: 'b',
    },
    required: ['riesgo'],
  },
  oportunidades: {
    table: 'a29_oportunidades', key: ['nro'], order: 'nro', label: 'A.29 Oportunidades',
    cols: {
      origen: 't', proceso: 't', oportunidad: 't', accion: 't', beneficio: 't', factibilidad: 't', prioridad: 't',
      responsable: 't', plazo: 't', indicador: 't', seguimiento: 't', estado: 't', a_validar: 'b',
    },
    required: ['oportunidad'],
  },
  partes: {
    table: 'a32_partes', key: ['nro'], order: 'nro', label: 'A.32 Partes interesadas',
    cols: {
      parte: 't', poder: 'r4', interes: 'r4', nivel: 't', pertinente: { e: ['Sí', 'No'] }, justificacion: 't', cambio: 't', a_validar: 'b',
    },
    required: ['parte'],
  },
  necesidades: {
    table: 'a32_necesidades', key: ['codigo'], order: 'codigo', label: 'A.32 Necesidades',
    cols: {
      parte: 't', necesidad: 't', eval_anterior: 't', eval_propuesta: 't', fuente: 't', evidencia: 't',
      aborda_sgc: { e: ['Sí', 'No'] }, justificacion: 't', deriva: 't', a_validar: 'b',
    },
    required: ['codigo', 'necesidad'],
  },
};
const CUAD_NUM = { F: 1, D: 2, O: 3, A: 4 };

function clean(reg, col, v) {
  const t = reg.cols[col];
  if (v === '' || v === undefined) v = null;
  if (t === 't') return v == null ? null : String(v).trim().slice(0, 4000) || null;
  if (t === 'b') return v === true || v === 'true' || v === 1;
  if (t === 'i') { const n = Number(v); if (!Number.isInteger(n)) throw new HttpError(400, `${col} inválido.`); return n; }
  if (t === 'r5' || t === 'r4') {
    const max = t === 'r5' ? 5 : 4, n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new HttpError(400, `${col} debe ir de 1 a ${max}.`);
    return n;
  }
  if (t && t.e) {
    if (v == null) return null;
    if (!t.e.includes(v)) throw new HttpError(400, `${col}: valor no permitido (${t.e.join(', ')}).`);
    return v;
  }
  throw new HttpError(400, `Campo no editable: ${col}.`);
}

function keyWhere(reg, anio, keyVals, start = 1) {
  const conds = ['anio=$' + start];
  const vals = [anio];
  reg.key.forEach((k, i) => { conds.push(`${k}=$${start + 1 + i}`); vals.push(reg.key[i] === 'nro' ? Number(keyVals[i]) : keyVals[i]); });
  return { where: conds.join(' and '), vals };
}

async function logChanges(sql, anio, registro, clave, antes, despues, campos) {
  const filas = campos.filter(c => String(antes[c] ?? '') !== String(despues[c] ?? ''));
  for (const c of filas) {
    await sql.query('insert into ctx_historial (anio, registro, clave, campo, antes, despues) values ($1,$2,$3,$4,$5,$6)',
      [anio, registro, String(clave), c, antes[c] == null ? null : String(antes[c]), despues[c] == null ? null : String(despues[c])]);
  }
}

function aplicarNiveles(reg, row, patch) {
  // los niveles se calculan siempre con la matriz: así no vuelve a haber diferencias entre matriz y registro
  if (reg.table !== 'a29_riesgos') return;
  const r = { ...row, ...patch };
  if ('probabilidad' in patch || 'impacto' in patch) patch.nivel_inicial = nivel(r.probabilidad, r.impacto);
  if ('prob_residual' in patch || 'impacto_residual' in patch) patch.nivel_residual = nivel(r.prob_residual, r.impacto_residual);
}

async function handle(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/health') return json(req, env, { ok: true });

  await requireAdmin(req, env);
  const sql = neon(await secret(env.DATABASE_URL));
  const m = req.method;

  // --- años disponibles ---
  if (m === 'GET' && p === '/api/anios') {
    const r = await sql.query(`select distinct anio from (select anio from foda_items union select anio from a29_riesgos
      union select anio from a32_partes) t order by anio desc`);
    return json(req, env, r.map(x => x.anio));
  }

  // --- todo el contexto de un año ---
  if (m === 'GET' && p === '/api/contexto') {
    const anio = Number(url.searchParams.get('anio'));
    if (!Number.isInteger(anio)) throw new HttpError(400, 'Falta el año.');
    const out = {};
    for (const [k, reg] of Object.entries(REG)) {
      out[k] = await sql.query(`select * from ${reg.table} where anio=$1 order by ${reg.order}`, [anio]);
    }
    return json(req, env, out);
  }

  // --- evolución entre años (para el informe anual y el tablero histórico) ---
  if (m === 'GET' && p === '/api/evolucion') {
    const [foda, riesgos, validar] = await Promise.all([
      sql.query(`select anio, cuadrante, count(*)::int factores, sum(importancia*intensidad*tendencia)::int puntaje
        from foda_items group by anio, cuadrante order by anio, cuadrante`),
      sql.query(`select anio, nivel_inicial, nivel_residual, count(*)::int n from a29_riesgos group by anio, nivel_inicial, nivel_residual order by anio`),
      sql.query(`select anio, (select count(*) from foda_items f where f.anio=a.anio and a_validar)::int foda,
        (select count(*) from a29_riesgos f where f.anio=a.anio and a_validar)::int riesgos,
        (select count(*) from a32_partes f where f.anio=a.anio and a_validar)::int partes
        from (select distinct anio from foda_items) a order by anio`),
    ]);
    return json(req, env, { foda, riesgos, validar });
  }

  // --- historial de cambios ---
  if (m === 'GET' && p === '/api/historial') {
    const anio = Number(url.searchParams.get('anio'));
    const lim = Math.min(Number(url.searchParams.get('limite')) || 200, 1000);
    const r = Number.isInteger(anio)
      ? await sql.query('select * from ctx_historial where anio=$1 order by id desc limit $2', [anio, lim])
      : await sql.query('select * from ctx_historial order by id desc limit $1', [lim]);
    return json(req, env, r);
  }

  // --- año nuevo: copia el anterior para actualizarlo (los puntos pasan a "sin valorar") ---
  if (m === 'POST' && p === '/api/anios') {
    const b = await readBody(req);
    const anio = Number(b.anio), desde = Number(b.desde);
    if (!Number.isInteger(anio) || !Number.isInteger(desde) || anio <= desde) throw new HttpError(400, 'Año o año base inválido.');
    const ya = await sql.query('select 1 from foda_items where anio=$1 limit 1', [anio]);
    if (ya.length) throw new HttpError(409, `Ya existe el registro ${anio}.`);
    const base = await sql.query('select 1 from foda_items where anio=$1 limit 1', [desde]);
    if (!base.length) throw new HttpError(404, `No existe el registro ${desde}.`);
    await sql.query(`insert into foda_items (anio,codigo,cuadrante,orden,texto,estado_vs_anterior,iso,evidencia,deriva,a_validar,importancia,intensidad,tendencia,valorado)
      select $1::int,codigo,cuadrante,orden,texto,'Se mantiene',iso,evidencia,deriva,true,importancia,intensidad,tendencia,false from foda_items where anio=$2`, [anio, desde]);
    await sql.query(`insert into a29_riesgos (anio,nro,origen,proceso,riesgo,probabilidad,impacto,nivel_inicial,decision,plan,prob_residual,impacto_residual,nivel_residual,seguimiento,estado,observaciones,a_validar)
      select $1::int,nro,origen,proceso,riesgo,probabilidad,impacto,nivel_inicial,decision,plan,prob_residual,impacto_residual,nivel_residual,seguimiento,'Heredado de '||anio::text,null,true from a29_riesgos where anio=$2`, [anio, desde]);
    await sql.query(`insert into a29_oportunidades (anio,nro,origen,proceso,oportunidad,accion,beneficio,factibilidad,prioridad,responsable,plazo,indicador,seguimiento,estado,a_validar)
      select $1::int,nro,origen,proceso,oportunidad,accion,beneficio,factibilidad,prioridad,responsable,plazo,indicador,seguimiento,'Heredada de '||anio::text,true from a29_oportunidades where anio=$2`, [anio, desde]);
    await sql.query(`insert into a32_partes (anio,nro,parte,poder,interes,nivel,pertinente,justificacion,cambio,a_validar)
      select $1::int,nro,parte,poder,interes,nivel,pertinente,justificacion,'Se mantiene',true from a32_partes where anio=$2`, [anio, desde]);
    await sql.query(`insert into a32_necesidades (anio,codigo,parte,necesidad,eval_anterior,eval_propuesta,fuente,evidencia,aborda_sgc,justificacion,deriva,a_validar)
      select $1::int,codigo,parte,necesidad,eval_propuesta,null,fuente,null,aborda_sgc,justificacion,deriva,true from a32_necesidades where anio=$2`, [anio, desde]);
    await sql.query('insert into ctx_historial (anio, registro, clave, campo, antes, despues) values ($1,$2,$3,$4,$5,$6)',
      [anio, 'anio', String(anio), 'creado', null, `copiado de ${desde}`]);
    return json(req, env, { ok: true, anio }, 201);
  }

  // --- altas, cambios y bajas de cada registro: /api/<registro>[/<anio>/<clave>] ---
  const mm = p.match(/^\/api\/(foda|riesgos|oportunidades|partes|necesidades)(?:\/(\d{4})\/([^/]+))?$/);
  if (mm) {
    const reg = REG[mm[1]];
    const anioRuta = mm[2] ? Number(mm[2]) : null;
    const clave = mm[3] ? decodeURIComponent(mm[3]) : null;

    if (m === 'POST' && !clave) {
      const b = await readBody(req);
      const anio = Number(b.anio);
      if (!Number.isInteger(anio)) throw new HttpError(400, 'Falta el año.');
      for (const c of reg.required) if (b[c] == null || String(b[c]).trim() === '') throw new HttpError(400, `Falta ${c}.`);
      const vals = {};
      for (const c of Object.keys(reg.cols)) if (c in b) vals[c] = clean(reg, c, b[c]);
      let keyVal;
      if (reg.table === 'foda_items') {
        const n = CUAD_NUM[vals.cuadrante];
        const r = await sql.query(`select coalesce(max(split_part(codigo,'.',2)::int),0)+1 sig, coalesce(max(orden),0)+1 ord
          from foda_items where anio=$1 and cuadrante=$2`, [anio, vals.cuadrante]);
        const o = await sql.query('select coalesce(max(orden),0)+1 ord from foda_items where anio=$1', [anio]);
        keyVal = `${n}.${r[0].sig}`; vals.codigo = keyVal; vals.orden = o[0].ord;
        vals.estado_vs_anterior = vals.estado_vs_anterior || `Nuevo ${anio}`;
      } else if (reg.key[0] === 'nro') {
        const r = await sql.query(`select coalesce(max(nro),0)+1 sig from ${reg.table} where anio=$1`, [anio]);
        keyVal = r[0].sig; vals.nro = keyVal;
      } else {
        keyVal = String(b.codigo).trim(); vals.codigo = keyVal;
      }
      aplicarNiveles(reg, {}, vals);
      const cols = ['anio', ...Object.keys(vals)];
      const params = [anio, ...Object.values(vals)];
      const ph = cols.map((_, i) => '$' + (i + 1)).join(',');
      const r = await sql.query(`insert into ${reg.table} (${cols.join(',')}) values (${ph}) returning *`, params);
      await sql.query('insert into ctx_historial (anio, registro, clave, campo, antes, despues) values ($1,$2,$3,$4,$5,$6)',
        [anio, mm[1], String(keyVal), 'alta', null, 'creado']);
      return json(req, env, r[0], 201);
    }

    if (clave && (m === 'PATCH' || m === 'PUT')) {
      const b = await readBody(req);
      const kv = keyWhere(reg, anioRuta, [clave]);
      const old = await sql.query(`select * from ${reg.table} where ${kv.where}`, kv.vals);
      if (!old.length) throw new HttpError(404, 'Registro inexistente.');
      const patch = {};
      for (const c of Object.keys(reg.cols)) if (c in b) patch[c] = clean(reg, c, b[c]);
      if (!Object.keys(patch).length) throw new HttpError(400, 'No hay campos para cambiar.');
      if (reg.table === 'foda_items' && ['importancia', 'intensidad', 'tendencia'].some(c => c in patch) && !('valorado' in patch)) patch.valorado = true;
      aplicarNiveles(reg, old[0], patch);
      const cols = Object.keys(patch);
      const sets = cols.map((c, i) => `${c}=$${i + 1}`);
      sets.push('actualizado_en=now()');
      const k2 = keyWhere(reg, anioRuta, [clave], cols.length + 1);
      const r = await sql.query(`update ${reg.table} set ${sets.join(',')} where ${k2.where} returning *`, [...cols.map(c => patch[c]), ...k2.vals]);
      await logChanges(sql, anioRuta, mm[1], clave, old[0], r[0], cols);
      return json(req, env, r[0]);
    }

    if (clave && m === 'DELETE') {
      const kv = keyWhere(reg, anioRuta, [clave]);
      const r = await sql.query(`delete from ${reg.table} where ${kv.where} returning *`, kv.vals);
      if (!r.length) throw new HttpError(404, 'Registro inexistente.');
      await sql.query('insert into ctx_historial (anio, registro, clave, campo, antes, despues) values ($1,$2,$3,$4,$5,$6)',
        [anioRuta, mm[1], String(clave), 'baja', JSON.stringify(r[0]).slice(0, 2000), null]);
      return json(req, env, { ok: true });
    }
  }

  throw new HttpError(404, 'Ruta inexistente.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    try {
      return await handle(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json(req, env, { error: e.message }, e.status);
      console.error('FODA error:', e && e.stack || e);
      return json(req, env, { error: 'Error interno. Reintentá en unos segundos.' }, 500);
    }
  },
};
