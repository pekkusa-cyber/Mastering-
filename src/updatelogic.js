// Beslutet om uppdatering – ren logik utan Capacitor, så att den kan testas i Node (tests/unit).

/**
 * m = latest.json från releasen "live": { version, native }.
 * now = { bundle: webbpaketet som körs, native: APK:ns nativenivå, bad: version som inte startade förra gången }.
 * Svarar 'apk' (ny app behövs – Kotlin-koden har ändrats), 'bundle' (ny webbdel att ladda ner) eller null.
 */
export function decide(m, now) {
  if (!m || !Number.isInteger(m.version) || !Number.isInteger(m.native)) return null;
  if (m.native > now.native) return 'apk';
  if (m.native !== now.native) return null; // paketet är byggt för en annan (äldre) app
  if (m.version <= now.bundle) return null;
  if (String(m.version) === String(now.bad ?? '')) return null;
  return 'bundle';
}

/** Mittensiffran i versionName "0.<nativenivå>.<bygge>". */
export function nativeFromVersionName(v) {
  const parts = String(v || '').split('.');
  return parts.length >= 3 ? Number(parts[1]) || 0 : 0;
}

/** "0.3.12 · webb 15 · byggd 19 nov 00:41" */
export function versionText(appVersion, bundle, built) {
  const d = built ? new Date(built) : null;
  const when = d && !isNaN(d)
    ? ` · byggd ${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  return `${appVersion || 'webb'}${bundle ? ` · webb ${bundle}` : ''}${when}`;
}
