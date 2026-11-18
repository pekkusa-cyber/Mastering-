// Lokal lagring (Capacitor Preferences – i webbläsaren localStorage). Ingen server.
import { Preferences } from '@capacitor/preferences';

export async function load(key, fallback) {
  try {
    const { value } = await Preferences.get({ key });
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function save(key, value) {
  try { await Preferences.set({ key, value: JSON.stringify(value) }); } catch { /* lagringen är inte kritisk */ }
}
