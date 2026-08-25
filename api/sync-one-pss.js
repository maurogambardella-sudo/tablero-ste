const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  }, extra || {});
}

function normalizeElemento(value) {
  const raw = String(value || '').trim();

  const s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

  if (
    s === 'multidisciplinaryteams' ||
    s.includes('equiposmultidisciplinarios') ||
    s.includes('equipomultidisciplinario')
  ) return 'multidisciplinaryteams';

  if (
    s === 'strategyperformance' ||
    s.includes('strategyperformance') ||
    s.includes('strategicperformance')
  ) return 'strategyperformance';

  if (
    s === 'dmsproblemsolving' ||
    s.includes('dmsproblemsolving')
  ) return 'dmsproblemsolving';

  if (
    s === 'knowledgemanagement' ||
    s.includes('knowledgemanagement')
  ) return 'knowledgemanagement';

  if (
    s === 'lwaimprovements' ||
    s.includes('lwaimprovements')
  ) return 'lwaimprovements';

  throw new Error(`Elemento no reconocido: ${raw}`);
}

const normalizedElemento = normalizeElemento(elemento);

const mapped = (rows || []).map(r => ({
  id: r.ID ?? '',
  nombre_iniciativa: r['Nombre Iniciativa'] ?? '',
  detalle: r['Detalle'] ?? '',
  owner: r['Owner'] ?? '',
  co_owner: r['Co Owner'] ?? '',
  fecha_inicio: normalizeDate(r['Fecha inicio']),
  estado: r['Estado'] ?? '',
  dependencia: r['Dependencia'] ?? '',
  deadline_fecha: normalizeDate(r['Deadline (fecha)']),
  stopper: r['Stopper'] ?? '',
  comentarios: r['Comentarios'] ?? '',
  source_file: sourceFile || '',
  elemento: normalizeElemento(elemento || '')
})).filter(r => r.id && r.nombre_iniciativa);

await upsert('one_pss', mapped);
await deleteRemovedByElemento('one_pss', normalizedElemento, mapped.map(r => r.id));
return res.status(200).json({ ok: true, count: mapped.length, elemento: normalizedElemento });



async function upsert(table, rows) {
  if (!rows || !rows.length) return;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    }),
    body: JSON.stringify(rows)
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error guardando ${table} (${res.status}): ${detail}`);
  }
}

async function deleteRemovedByElemento(table, elemento, keepIds) {
  if (!elemento) return;

  let url;
  const elementoFilter = `elemento=eq.${encodeURIComponent(elemento)}`;

  if (!keepIds || !keepIds.length) {
    url = `${SUPABASE_URL}/rest/v1/${table}?${elementoFilter}`;
  } else {
    const list = keepIds
      .map(id => '"' + String(id).replace(/"/g, '\\"') + '"')
      .join(',');
    url = `${SUPABASE_URL}/rest/v1/${table}?${elementoFilter}&id=not.in.(${encodeURIComponent(list)})`;
  }

  const res = await fetch(url, {
    method: 'DELETE',
    headers: sbHeaders()
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error limpiando ${table} (${res.status}): ${detail}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sourceFile = '', elemento = '', rows = [] } = req.body || {};

    const mapped = (rows || []).map(r => ({
      id: r.ID ?? '',
      nombre_iniciativa: r['Nombre Iniciativa'] ?? '',
      detalle: r['Detalle'] ?? '',
      owner: r['Owner'] ?? '',
      co_owner: r['Co Owner'] ?? '',
      fecha_inicio: normalizeDate(r['Fecha inicio']),
      estado: r['Estado'] ?? '',
      dependencia: r['Dependencia'] ?? '',
      deadline_fecha: normalizeDate(r['Deadline (fecha)']),
      stopper: r['Stopper'] ?? '',
      comentarios: r['Comentarios'] ?? '',
      source_file: sourceFile || '',
      elemento: normalizeElemento(elemento || '')
    })).filter(r => r.id && r.nombre_iniciativa);

    await upsert('one_pss', mapped);
    await deleteRemovedByElemento('one_pss', elemento, mapped.map(r => r.id));

    function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return '';
  const utcDays = Math.floor(n - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);

  const yyyy = dateInfo.getUTCFullYear();
  const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDate(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDate(raw);
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
}

    return res.status(200).json({ ok: true, count: mapped.length, elemento });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
