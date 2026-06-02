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
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(rows)
  });
  // IMPORTANTE: si falla, lo hacemos explotar para que el frontend muestre "Sin conexión"
  // en vez de creer que guardó bien (ese era el bug original).
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error guardando ${table} (${res.status}): ${detail}`);
  }
}

async function deleteAll(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=neq.null`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error limpiando ${table} (${res.status}): ${detail}`);
  }
}

// ── Mapeo: nombres del frontend (camelCase) → columnas de la base (snake_case) ──
function mapOutcome(o) {
  return {
    id: o.id,
    title: o.title ?? '',
    description: o.desc ?? o.description ?? '',
    kpis: o.kpis ?? ''
  };
}
function mapOutput(o) {
  return {
    id: o.id,
    outcome: o.outcome ?? '',
    title: o.title ?? '',
    description: o.desc ?? '',
    meta: (o.meta === '' || o.meta == null) ? null : o.meta,
    actual: (o.actual === '' || o.actual == null) ? null : o.actual,
    unit: o.unit ?? '',
    direction: o.direction ?? '',
    owner: o.owner ?? '',
    ciclo: o.ciclo ?? '',
    start_date: o.startDate ?? '',
    end_date: o.date ?? '',
    participants: JSON.stringify(o.participants || []),
    dependency: o.dependency ?? '',
    attachments: JSON.stringify(o.attachments || []),
    comments: JSON.stringify(o.comments || []),
    notes: o.notes ?? ''
  };
}
function mapTask(t) {
  return {
    id: t.id,
    output: t.output ?? '',
    title: t.title ?? '',
    description: t.desc ?? '',
    owner: t.owner ?? '',
    priority: t.priority ?? '',
    status: t.status ?? '',
    start_date: t.start ?? '',
    end_date: t.end ?? '',
    notes: t.notes ?? ''
  };
}
function mapMember(m) {
  return {
    id: m.id,
    name: m.name ?? '',
    role: m.role ?? '',
    email: m.email ?? ''
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { outcomes = [], outputs = [], tasks = [], team = [], config = {} } = req.body;

    await Promise.all([
      deleteAll('outcomes'), deleteAll('outputs'),
      deleteAll('tasks'), deleteAll('team')
    ]);

    await Promise.all([
      upsert('outcomes', outcomes.map(mapOutcome)),
      upsert('outputs', outputs.map(mapOutput)),
      upsert('tasks', tasks.map(mapTask)),
      upsert('team', team.map(mapMember)),
      upsert('config', [{
        id: 1,
        cycle_start: config.cycleStart,
        cycle_end: config.cycleEnd,
        progress_mode: config.progressMode
      }])
    ]);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
