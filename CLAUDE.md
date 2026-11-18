# Masterlab – regler för Claude Code

Mastringsapp för Android (Vite + Capacitor 8, samma upplägg som familjekalendern). Språk i appen: svenska.
Kravspecen och fasindelningen finns i README.md. Rapportera efter varje fas och vänta på besked innan nästa.

## Struktur
- `src/` – webbgränssnittet. `src/livedsp.js` är bryggan till Kotlin-pluginen och innehåller simulatorn (`?sim=1`) som UI-testerna använder.
- `android/app/src/main/java/se/foric/masterlab/live/` – live-motorn i Kotlin: `LiveDspPlugin` (Capacitor), `LiveDspService` (förgrundstjänst + sessionssökning), `LiveDspEngine` (DynamicsProcessing per session), `SessionParser` (tolkar dumpsys, ren Kotlin).

## Hjälptexter (ⓘ)
Varje vy har en förklaring i `src/help.js` (ⓘ i rubriken). Varje ändring av en funktion ska samtidigt uppdatera texten för den vyn så att den alltid stämmer.

## Tester
- `npm test` kör Playwright-testerna i `tests/` (UI mot simulatorn).
- `cd android && ./gradlew testDebugUnitTest` kör JVM-testerna i `android/app/src/test` (t.ex. dumpsys-tolkningen).
- GitHub Actions kör båda före varje APK – misslyckas de publiceras inget. Nya funktioner och rättade fel får ett test.
- När den egna DSP:n (fas 3) kommer: enhetstester i Node med syntetiska signaler (tak, bypass, klick, LUFS mot EBU).

## Native-nivå
Filen `native-level` är mittensiffran i versionen. Höj den när Kotlin-koden eller manifestet ändras.
