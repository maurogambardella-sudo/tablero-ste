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

// Busca el perfil del usuario (rol + equipo). Si no tiene fila, queda como
// "consulta" (solo ver) por seguridad.
async function getProfile(email) {
  if (!email) return { email: '', role: 'consulta', team: '', comms: false };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return { email, role: 'consulta', team: '', comms: false };
    const rows = await res.json();
    if (rows && rows[0]) {
      return { email, role: rows[0].role || 'consulta', team: rows[0].team || '', comms: !!rows[0].comms };
    }
    return { email, role: 'consulta', team: '', comms: false };
  } catch {
    return { email, role: 'consulta', team: '', comms: false };
  }
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
    team: o.team,
    ciclo: o.ciclo,
    startDate: o.start_date,
    date: o.end_date,
    participants: o.participants, // el frontend hace safeJSON()
    dependency: o.dependency,
    attachments: o.attachments,   // el frontend hace safeJSON()
    comments: o.comments,         // el frontend hace safeJSON()
    benefit: o.benefit,
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
    team: t.team,
    priority: t.priority,
    status: t.status,
    start: t.start_date,
    end: t.end_date,
    notes: t.notes
  };
}

function mapRequest(r) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    category: r.category,
    requester: r.requester,
    requesterEmail: r.requester_email,
    requesterTeam: r.requester_team,
    team: r.team,
    status: r.status,
    priority: r.priority,
    targetDate: r.target_date,
    sponsor: r.sponsor,
    audience: r.audience,
    channel: r.channel,
    medium: r.medium,
    broadcastDate: r.broadcast_date,
    impact: r.impact,
    effort: r.effort,
    urgency: r.urgency,
    suggestedPriority: r.suggested_priority,
    approver: r.approver,
    decision: r.decision,
    evaluationComment: r.reviewer_comment,
    reviewerComment: r.reviewer_comment,
    createdAt: r.created_at
  };
}

function mapRecognition(r) {
  return {
    id: r.id,
    fromEmail: r.from_email,
    fromTeam: r.from_team,
    toEmail: r.to_email,
    toTeam: r.to_team,
    dso: r.dso,
    vacc: r.vacc,
    reason: r.reason,
    createdAt: r.created_at
  };
}

// team: los nombres coinciden (id, name, role, email) → no necesita mapeo

module.exports = async function handler(req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });

    const me = await getProfile((user.email || '').toLowerCase());

  const [outcomes, outputs, tasks, team, requests, recognitions, configRows] = await Promise.all([
  query('outcomes'),
  query('outputs'),
  query('tasks'),
  query('team'),
  query('requests'),
  query('recognitions'),
  query('config')
]);
    const config = (configRows && configRows[0]) || {
      cycle_start: '2026-04-01',
      cycle_end: '2026-12-31',
      progress_mode: 'hybrid'
    };
    res.status(200).json({
      me,
      outcomes: (outcomes || []).map(mapOutcome),
      outputs: (outputs || []).map(mapOutput),
      tasks: (tasks || []).map(mapTask),
      team: team || [],
      requests: (requests || []).map(mapRequest),
      recognitions: (recognitions || []).map(mapRecognition),
      config
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
