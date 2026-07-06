const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role (llave de administrador)

// ── Verifica que quien llama tenga sesión válida ──
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

// Busca el perfil (rol + equipo) de un email. Sin fila → "consulta".
async function getProfile(email) {
  if (!email) return { email: '', role: 'consulta', team: '', comms: false };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return { email, role: 'consulta', team: '', comms: false };
    const rows = await res.json();
    if (rows && rows[0]) return { email, role: rows[0].role || 'consulta', team: rows[0].team || '', comms: !!rows[0].comms };
    return { email, role: 'consulta', team: '', comms: false };
  } catch {
    return { email, role: 'consulta', team: '', comms: false };
  }
}

// Busca el usuario de login (Auth) por email para poder editarlo/borrarlo.
async function findAuthUserByEmail(email) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: sbHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data.users || data || [];
    return list.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  } catch {
    return null;
  }
}

async function upsertProfile(email, role, team, comms) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify([{ email: email.toLowerCase(), role, team: team || '', comms: !!comms }])
  });
  if (!res.ok) {
    const d = await res.text();
    throw new Error(`No se pudo guardar el perfil (${res.status}): ${d}`);
  }
}

module.exports = async function handler(req, res) {
  try {
    // 1) Solo un Admin logueado puede usar este endpoint.
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });
    const me = await getProfile((user.email || '').toLowerCase());
    if (me.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede gestionar usuarios.' });
    }

    // 2) Listar usuarios (perfiles).
    if (req.method === 'GET') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=email.asc`, { headers: sbHeaders() });
      const rows = r.ok ? await r.json() : [];
      return res.status(200).json({ users: rows });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const body = req.body || {};
    const action = body.action;
    const email = (body.email || '').trim().toLowerCase();
    const role = body.role || 'consulta';
    const team = role === 'editor' ? (body.team || '') : '';
    const comms = !!body.comms;

    if (!email) return res.status(400).json({ error: 'Falta el email.' });

    // ── CREAR usuario nuevo (login + perfil) ──
    if (action === 'create') {
      const password = body.password || '';
      if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      if (role === 'editor' && !team) return res.status(400).json({ error: 'Un editor necesita un equipo asignado.' });

      const cr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, password, email_confirm: true })
      });
      if (!cr.ok) {
        const d = await cr.text();
        // 422 suele ser "ya existe"
        return res.status(400).json({ error: 'No se pudo crear el usuario de login: ' + d });
      }
      await upsertProfile(email, role, team, body.comms);
      return res.status(200).json({ ok: true });
    }

    // ── EDITAR rol/equipo de un usuario existente ──
    if (action === 'update') {
      if (role === 'editor' && !team) return res.status(400).json({ error: 'Un editor necesita un equipo asignado.' });
      await upsertProfile(email, role, team, body.comms);
      return res.status(200).json({ ok: true });
    }

    // ── RESETEAR contraseña ──
    if (action === 'password') {
      const password = body.password || '';
      if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      const u = await findAuthUserByEmail(email);
      if (!u) return res.status(404).json({ error: 'No se encontró el usuario de login.' });
      const pr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
        method: 'PUT',
        headers: sbHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ password })
      });
      if (!pr.ok) { const d = await pr.text(); return res.status(400).json({ error: 'No se pudo cambiar la contraseña: ' + d }); }
      return res.status(200).json({ ok: true });
    }

    // ── ELIMINAR usuario (login + perfil) ──
    if (action === 'delete') {
      if (email === (me.email || '').toLowerCase()) {
        return res.status(400).json({ error: 'No podés eliminarte a vos mismo.' });
      }
      const u = await findAuthUserByEmail(email);
      if (u) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sbHeaders() });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
        method: 'DELETE', headers: sbHeaders()
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
