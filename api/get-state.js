const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function query(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.json();
}

export default async function handler(req, res) {
  const [outcomes, outputs, tasks, team, configRows] = await Promise.all([
    query('outcomes'), query('outputs'),
    query('tasks'), query('team'), query('config')
  ]);
  const config = configRows[0] || {
    cycle_start: '2026-04-01',
    cycle_end: '2026-12-31',
    progress_mode: 'hybrid'
  };
  res.status(200).json({ outcomes, outputs, tasks, team, config });
}
