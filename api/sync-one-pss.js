const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  }, extra || {});
}

function normalizeElemento(v) {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (s.includes('knowledge')) return 'knowledge_management';
  if (s.includes('dms')) return 'dms_problem_solving';
  if (s.includes('strategy') || s.includes('strat')) return 'strategy_performance';
  if (s.includes('lwa')) return 'lwa_improvements';
  if (s.includes('multidisciplin')) return 'multidisciplinary_teams';
  return 'general';
}

async function upsertRows(rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/one_pss`, {
    method: 'POST',
    headers: sbHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    }),
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(await res.text());
}

async function deleteRemovedByElemento(elemento, keepIds) {
  let url;
  if (!keepIds.length) {
    url = `${SUPABASE_URL}/rest/v1/one_pss?elemento=eq.${encodeURIComponent(elemento)}`;
  } else {
    const list = keepIds.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    url = `${SUPABASE_URL}/rest/v1/one_pss?elemento=eq.${encodeURIComponent(elemento)}&id=not.in.(${encodeURIComponent(list)})`;
  }
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders() });
  if (!res.ok) throw new Error(await res.text());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const elemento = normalizeElemento(body.elemento);
    const sourceFile = body.sourceFile || '';
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const normalizedRows = rows.map((r, i) => ({
      id: r.id || `${elemento}|${i + 1}`,
      elemento,
      nombre_iniciativa: r.nombreIniciativa || '',
      detalle: r.detalle || '',
      owner: r.owner || '',
      co_owner: r.coOwner || '',
      fecha_inicio: r.fechaInicio || null,
      estado: r.estado || '',
      dependencia: r.dependencia || '',
      deadline_fecha: r.deadlineFecha || null,
      stopper: r.stopper || '',
      comentarios: r.comentarios || '',
      source_file: sourceFile
    }));

    await upsertRows(normalizedRows);
    await deleteRemovedByElemento(elemento, normalizedRows.map(r => r.id));

    res.status(200).json({ ok: true, elemento, total: normalizedRows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
