const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  }, extra || {});
}

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
      fecha_inicio: r['Fecha inicio'] ?? '',
      estado: r['Estado'] ?? '',
      dependencia: r['Dependencia'] ?? '',
      deadline_fecha: r['Deadline (fecha)'] ?? '',
      stopper: r['Stopper'] ?? '',
      comentarios: r['Comentarios'] ?? '',
      source_file: sourceFile || '',
      elemento: elemento || ''
    })).filter(r => r.id && r.nombre_iniciativa);

    await upsert('one_pss', mapped);
    await deleteRemovedByElemento('one_pss', elemento, mapped.map(r => r.id));

    return res.status(200).json({ ok: true, count: mapped.length, elemento });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
