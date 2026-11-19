# Masterlab – regler för Claude Code

Mastringsapp för Android (Vite + Capacitor 8, samma upplägg som familjekalendern). Språk i appen: svenska.
Kravspecen och fasindelningen finns i README.md. Rapportera efter varje fas och vänta på besked innan nästa.

## Struktur
- Vyer i `src/views/`: `live.js`, `analys.js`, `fil.js`, `mer.js`. `src/main.js` sköter navigering och händelser; `src/state.js` är det delade tillståndet; `src/ui.js` har reglaget med ⓘ och ↺ (`slider`) – använd det för alla nya reglage.
- `src/info.js` – förklaringen (ⓘ) för varje reglage och sektion. Nytt reglage = ny text där.
- `src/dsp/` – filmastringens DSP (ren JS, körs i Web Worker `worker.js` och i Node-testerna): biquad, Linkwitz-Riley-crossover, kompressor/transient/clipper, true-peak-limiter, LUFS/LRA-mätare, WAV. `src/master.js` – filparametrar och mål.
- `src/analysis.js` – spektrumprofil, jämförelse mot referens, match-EQ. Bandindelningen är densamma som `AnalyzerMath.kt` – ändra båda samtidigt.
- `src/chain.js` – live-kedjans parametrar, presets, enkla reglage, export/import (ren JS, testas i `tests/unit`). Samma modell och gränser som `LiveParams.kt` – ändra båda samtidigt.
- `src/` – webbgränssnittet. `src/livedsp.js` är bryggan till Kotlin-pluginen och innehåller simulatorn (`?sim=1`) som UI-testerna använder.
- `android/app/src/main/java/se/foric/masterlab/live/` – live-motorn i Kotlin: `LiveDspPlugin` (Capacitor), `LiveDspService` (förgrundstjänst + sessionssökning), `LiveDspEngine` (DynamicsProcessing per session, global session 0 förvald), `LiveParams` (parametrar, ren Kotlin), `SessionParser` (tolkar dumpsys, ren Kotlin), `ShizukuHelper` (DUMP via Shizuku), `LevelMatcher` (auto-nivåmatchning), `LiveAnalyzer` (Visualizer på session 0: spektrum och nivå, plus `LiveAnalysis` för analys av en hel låt), `AgcController` (Jämn volym), `AnalyzerMath` (ren matematik: FFT, band, reglering – testas på JVM).

## Hjälptexter (ⓘ)
Varje vy har en förklaring i `src/help.js` (ⓘ i rubriken), och varje reglage/sektion i `src/info.js`. Varje ändring av en funktion ska samtidigt uppdatera texten för den vyn så att den alltid stämmer.

## Tester
- `npm test` kör enhetstesterna i `tests/unit` (Node) och Playwright-testerna i `tests/` (UI mot simulatorn).
- `cd android && ./gradlew testDebugUnitTest` kör JVM-testerna i `android/app/src/test` (t.ex. dumpsys-tolkningen).
- GitHub Actions kör båda före varje APK – misslyckas de publiceras inget. Nya funktioner och rättade fel får ett test.
- DSP-testerna (`tests/unit/dsp.test.js`) kontrollerar med syntetiska signaler: limitern över taket inkl. true peak, bit-transparent bypass, inga klick, LUFS/LRA mot EBU Tech 3341/3342. De får aldrig mjukas upp för att bli gröna.

## Native-nivå och live-uppdateringar
Filen `native-level` är mittensiffran i versionen. **Höj den när Kotlin-koden, manifestet eller Capacitor-plugins ändras** –
annars försöker appen köra en webbdel som kräver inbyggd kod den inte har. Webbändringar (src/) når telefonen
automatiskt via releasen "live" (`src/updater.js`, `AppUpdatePlugin.kt`); ny nativenivå erbjuds som ny APK.
