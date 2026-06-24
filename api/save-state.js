const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// URL del flujo HTTP de Power Automate que espeja los datos en SharePoint.
// Si no está seteada, la integración simplemente no hace nada (la app sigue igual).
const POWER_AUTOMATE_SYNC_URL = process.env.POWER_AUTOMATE_SYNC_URL;

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

// Busca el perfil del usuario (rol + equipo). Sin fila → "consulta" (solo ver).
async function getProfile(email) {
  if (!email) return { email: '', role: 'consulta', team: '' };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return { email, role: 'consulta', team: '' };
    const rows = await res.json();
    if (rows && rows[0]) {
      return { email, role: rows[0].role || 'consulta', team: rows[0].team || '' };
    }
    return { email, role: 'consulta', team: '' };
  } catch {
    return { email, role: 'consulta', team: '' };
  }
}

// Borra filas SOLO dentro de un equipo (para editores). Nunca toca otros equipos.
async function deleteRemovedScoped(table, team, keepIds) {
  const teamFilter = `team=eq.${encodeURIComponent(team)}`;
  let url;
  if (!keepIds || !keepIds.length) {
    url = `${SUPABASE_URL}/rest/v1/${table}?${teamFilter}`;
  } else {
    const list = keepIds
      .map(id => '"' + String(id).replace(/"/g, '\\"') + '"')
      .join(',');
    url = `${SUPABASE_URL}/rest/v1/${table}?${teamFilter}&id=not.in.(${encodeURIComponent(list)})`;
  }
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders() });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error limpiando ${table} (${res.status}): ${detail}`);
  }
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
    team: o.team ?? '',
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
    team: t.team ?? '',
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

function mapRequest(r) {
  return {
    id: r.id,
    type: r.type ?? '',
    title: r.title ?? '',
    description: r.description ?? '',
    category: r.category ?? '',
    requester: r.requester ?? '',
    requester_email: r.requesterEmail ?? '',
    requester_team: r.requesterTeam ?? '',
    team: r.team ?? r.requesterTeam ?? '',
    status: r.status ?? 'Recibido',
    priority: r.priority ?? 'Media',
    target_date: r.targetDate ?? '',
    sponsor: r.sponsor ?? '',
    audience: r.audience ?? '',
    channel: r.channel ?? '',
    impact: r.impact === '' || r.impact == null ? null : r.impact,
    effort: r.effort === '' || r.effort == null ? null : r.effort,
    urgency: r.urgency === '' || r.urgency == null ? null : r.urgency,
    suggested_priority: r.suggestedPriority ?? '',
    approver: r.approver ?? '',
    decision: r.decision ?? '',
    reviewer_comment: r.evaluationComment ?? r.reviewerComment ?? '',
    created_at: r.createdAt ?? new Date().toISOString()
  };
}

// ── Integración SharePoint (vía Power Automate) ──────────────────────────────
// Construye un índice nombre→email a partir del equipo, para que los flujos de
// notificación puedan avisar al responsable sin tener que adivinar su correo.
function buildEmailIndex(team) {
  const idx = {};
  (team || []).forEach(m => {
    if (!m) return;
    if (m.name) idx[String(m.name).trim().toLowerCase()] = m.email || '';
    if (m.email) idx[String(m.email).trim().toLowerCase()] = m.email || '';
  });
  return idx;
}

// Le agrega owner_email a cada fila (outputs/tasks) resolviendo el nombre del owner.
function attachOwnerEmail(rows, emailIndex) {
  (rows || []).forEach(r => {
    r.owner_email = emailIndex[String(r.owner || '').trim().toLowerCase()] || '';
  });
  return rows;
}

// Empuja el estado guardado al flujo HTTP de Power Automate, que lo espeja en
// las listas de SharePoint. Es "best effort": si el flujo no está configurado,
// falla o tarda, NUNCA rompe el guardado (lo tragamos y respondemos OK igual).
// Usamos await + timeout corto (en serverless, un fetch sin await puede quedar
// cortado cuando la función termina; el timeout evita demorar al usuario).
async function syncToSharePoint(payload) {
  if (!POWER_AUTOMATE_SYNC_URL) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(POWER_AUTOMATE_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (e) {
    // La integración nunca debe tumbar el guardado en Supabase.
    console.error('Sync a SharePoint falló (se ignora):', e && e.message);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    // ── Verificar quién es y qué rol tiene ──
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });
    const me = await getProfile((user.email || '').toLowerCase());

    // Consulta: no puede guardar nada.
    if (me.role === 'consulta') {
      return res.status(403).json({ error: 'Tu usuario es de solo consulta: no podés guardar cambios.' });
    }

    const { outcomes = [], outputs = [], tasks = [], team = [], requests = [], config = {} } = req.body;

    // Índice nombre→email del equipo, para enriquecer outputs/tasks con owner_email.
    const emailIndex = buildEmailIndex(team);

    // ── EDITOR: solo puede tocar outputs y tasks de SU equipo ──
    if (me.role === 'editor') {
      if (!me.team) {
        return res.status(403).json({ error: 'Tu usuario editor no tiene un equipo asignado.' });
      }
      // Tomar solo lo de su equipo y forzar el equipo (no puede reasignar a otro).
      const outputRows = outputs
        .filter(o => o.team === me.team)
        .map(o => { const r = mapOutput(o); r.team = me.team; return r; });
      const taskRows = tasks
        .filter(t => t.team === me.team)
        .map(t => { const r = mapTask(t); r.team = me.team; return r; });
      const requestRows = requests
    .filter(r => (r.team || r.requesterTeam) === me.team)
    .map(r => { const x = mapRequest(r); x.team = me.team; x.requester_team = x.requester_team || me.team; return x; });

      await Promise.all([
        upsert('outputs', outputRows),
        upsert('tasks', taskRows),
        upsert('requests', requestRows)
      ]);
      // Borrar solo lo de su equipo que el editor eliminó (nunca otros equipos).
      await Promise.all([
        deleteRemovedScoped('outputs', me.team, outputRows.map(r => r.id)),
        deleteRemovedScoped('tasks', me.team, taskRows.map(r => r.id)),
        deleteRemovedScoped('requests', me.team, requestRows.map(r => r.id))
      ]);

      // Espejo en SharePoint (solo lo que el editor puede tocar).
      attachOwnerEmail(outputRows, emailIndex);
      attachOwnerEmail(taskRows, emailIndex);
      await syncToSharePoint({
        outputs: outputRows,
        tasks: taskRows,
        requests: requestRows
      });

      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: puede todo (comportamiento completo) ──
    const outcomeRows = outcomes.map(mapOutcome);
    const outputRows = outputs.map(mapOutput);
    const taskRows = tasks.map(mapTask);
    const teamRows = team.map(mapMember);
    const requestRows = requests.map(mapRequest);

    // 1) Primero insertar/actualizar todo (la base NUNCA queda vacía).
    await Promise.all([
      upsert('outcomes', outcomeRows),
      upsert('outputs', outputRows),
      upsert('tasks', taskRows),
      upsert('team', teamRows),
      upsert('requests', requestRows),
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
      deleteRemoved('team', teamRows.map(r => r.id)),
      deleteRemoved('requests', requestRows.map(r => r.id))
    ]);

    // 3) Espejo en SharePoint (best effort, no rompe el guardado).
    attachOwnerEmail(outputRows, emailIndex);
    attachOwnerEmail(taskRows, emailIndex);
    await syncToSharePoint({
      outcomes: outcomeRows,
      outputs: outputRows,
      tasks: taskRows,
      team: teamRows,
      requests: requestRows
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
