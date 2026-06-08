const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Cerradura: verifica que quien llama tenga una sesión válida ──
// Lee el token "Bearer" que manda el frontend y le pregunta a Supabase
// "¿este usuario inició sesión de verdad?". Si no, devuelve null.
async function getUserFromRequest(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  }, extra || {});
}

// Inserta o actualiza por id (no borra nada).
async function upsert(table, rows) {
  if (!rows || !rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(rows)
  });
  // Si falla, lo hacemos explotar para que el frontend muestre "Sin conexión"
  // en vez de creer que guardó bien (ese era el bug original).
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error guardando ${table} (${res.status}): ${detail}`);
  }
}

// Borra SOLO las filas cuyo id ya no está en keepIds.
// Si keepIds está vacío (se borró todo en la app), limpia la tabla entera.
async function deleteRemoved(table, keepIds) {
  let url;
  if (!keepIds || !keepIds.length) {
    url = `${SUPABASE_URL}/rest/v1/${table}?id=neq.null`;
  } else {
    const list = keepIds
      .map(id => '"' + String(id).replace(/"/g, '\\"') + '"')
      .join(',');
    url = `${SUPABASE_URL}/rest/v1/${table}?id=not.in.(${encodeURIComponent(list)})`;
  }
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders() });
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

    const outcomeRows = outcomes.map(mapOutcome);
    const outputRows = outputs.map(mapOutput);
    const taskRows = tasks.map(mapTask);
    const teamRows = team.map(mapMember);

    // 1) Primero insertar/actualizar todo (la base NUNCA queda vacía).
    await Promise.all([
      upsert('outcomes', outcomeRows),
      upsert('outputs', outputRows),
      upsert('tasks', taskRows),
      upsert('team', teamRows),
      upsert('config', [{
        id: 1,
        cycle_start: config.cycleStart,
        cycle_end: config.cycleEnd,
        progress_mode: config.progressMode
      }])
    ]);

    // 2) Luego borrar SOLO lo que el usuario eliminó en la app.
    await Promise.all([
      deleteRemoved('outcomes', outcomeRows.map(r => r.id)),
      deleteRemoved('outputs', outputRows.map(r => r.id)),
      deleteRemoved('tasks', taskRows.map(r => r.id)),
      deleteRemoved('team', teamRows.map(r => r.id))
    ]);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
