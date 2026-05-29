const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function upsert(table, rows) {
  if (!rows || !rows.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
}

async function deleteAll(table) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=neq.null`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { outcomes, outputs, tasks, team, config } = req.body;
    await Promise.all([
      deleteAll('outcomes'), deleteAll('outputs'),
      deleteAll('tasks'), deleteAll('team')
    ]);
    await Promise.all([
      upsert('outcomes', outcomes),
      upsert('outputs', outputs.map(o => ({
        ...o,
        participants: JSON.stringify(o.participants || []),
        attachments: JSON.stringify(o.attachments || []),
        comments: JSON.stringify(o.comments || [])
      }))),
      upsert('tasks', tasks),
      upsert('team', team),
      upsert('config', [{ id: 1, cycle_start: config.cycleStart, cycle_end: config.cycleEnd, progress_mode: config.progressMode }])
    ]);
    res.status(200).json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
