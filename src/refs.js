// Referenser: sparade profiler (från live-analys eller importerade ljudfiler). Lagras lokalt (Preferences).
import { load, save } from './store.js';
import { ui } from './state.js';

export async function loadRefs() {
  ui.refs = await load('refs', []);
  ui.refId = (await load('refId', '')) || '';
  if (!ui.refs.some((r) => r.id === ui.refId)) ui.refId = '';
}

const persist = () => Promise.all([save('refs', ui.refs), save('refId', ui.refId)]);

export async function addRef(name, profile) {
  const base = String(name || '').trim() || 'Referens';
  let n = base, k = 2;
  while (ui.refs.some((r) => r.name === n)) n = `${base} (${k++})`;
  const ref = { id: `r-${Date.now().toString(36)}`, name: n, profile, created: new Date().toISOString() };
  ui.refs = [...ui.refs, ref];
  ui.refId = ref.id;
  await persist();
  return ref;
}

export async function renameRef(id, name) {
  ui.refs = ui.refs.map((r) => (r.id === id ? { ...r, name: String(name).trim() || r.name } : r));
  await persist();
}

export async function deleteRef(id) {
  ui.refs = ui.refs.filter((r) => r.id !== id);
  if (ui.refId === id) ui.refId = '';
  await persist();
}

export async function selectRef(id) { ui.refId = id; await persist(); }
export const currentRef = () => ui.refs.find((r) => r.id === ui.refId) || null;

export const exportRefs = () => JSON.stringify({ app: 'masterlab', kind: 'referenser', version: 1, refs: ui.refs.map(({ name, profile, created }) => ({ name, profile, created })) }, null, 2);

export async function importRefs(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Filen är inte giltig JSON.'); }
  const list = Array.isArray(data?.refs) ? data.refs : [];
  const ok = list.filter((r) => Array.isArray(r?.profile?.bands) && r.profile.bands.length === 24);
  if (!ok.length) throw new Error('Hittade inga referenser i filen.');
  for (const r of ok) await addRef(r.name, r.profile);
  return ok.length;
}
