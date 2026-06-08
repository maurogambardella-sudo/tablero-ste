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

async function query(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Error leyendo ${table} (${res.status})`);
  return res.json();
}

// ── Mapeo: columnas de la base (snake_case) → nombres del frontend (camelCase) ──
function mapOutcome(o) {
  return { id: o.id, title: o.title, desc: o.description, kpis: o.kpis };
}
function mapOutput(o) {
  return {
    id: o.id,
    outcome: o.outcome,
    title: o.title,
    desc: o.description,
    meta: o.meta,
    actual: o.actual,
    unit: o.unit,
    direction: o.direction,
    owner: o.owner,
    ciclo: o.ciclo,
    startDate: o.start_date,
    date: o.end_date,
    participants: o.participants, // el frontend hace safeJSON()
    dependency: o.dependency,
    attachments: o.attachments,   // el frontend hace safeJSON()
    comments: o.comments,         // el frontend hace safeJSON()
    notes: o.notes
  };
}
function mapTask(t) {
  return {
    id: t.id,
    output: t.output,
    title: t.title,
    desc: t.description,
    owner: t.owner,
    priority: t.priority,
    status: t.status,
    start: t.start_date,
    end: t.end_date,
    notes: t.notes
  };
}
// team: los nombres coinciden (id, name, role, email) → no necesita mapeo

module.exports = async function handler(req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });

    const [outcomes, outputs, tasks, team, configRows] = await Promise.all([
      query('outcomes'), query('outputs'),
      query('tasks'), query('team'), query('config')
    ]);
    const config = (configRows && configRows[0]) || {
      cycle_start: '2026-04-01',
      cycle_end: '2026-12-31',
      progress_mode: 'hybrid'
    };
    res.status(200).json({
      outcomes: (outcomes || []).map(mapOutcome),
      outputs: (outputs || []).map(mapOutput),
      tasks: (tasks || []).map(mapTask),
      team: team || [],
      config
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
