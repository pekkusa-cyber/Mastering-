# Masterlab

Egen mastringsapp för Android som ska få Suno-låtar att låta färdiga: mjukare kick och toppar, silkeslen röst,
riktig limiter, kompressor, EQ och presets. Två lägen:

1. **Live** – bearbetar ljudet från andra appar (Suno-appen, Suno i Chrome) medan du lyssnar.
2. **Fil** – importerar en färdig låt (MP3/WAV), mastrar den och exporterar WAV (kommer i fas 3).

## Status

| Fas | Innehåll | Läge |
|---|---|---|
| 1 | Prototyp: går det att bearbeta Sunos ljud live? (go/no-go) | **Godkänd** – global session (0) fungerar på Samsung S25 / Android 17 med Suno-appen, Suno i Chrome och YouTube |
| 2 | Hela live-kedjan (EQ, multiband, limiter, presets, Enkelt/Avancerat) | **Klar** – testad på telefonen |
| 3 | Filmastring, plus analys/referenslyssning, jämn volym, ⓘ och ↺ på allt, 17 presets, nytt gränssnitt | **Klar** |
| 4 | Bekräftelse/Wavelet-kontroll, bypass, på/av på allt, konstant utnivå, kurvor, hörlurskorrigering, profil per enhet, volymoberoende kompression; Fil: direktlyssning, versioner, album, mono, de-esser, mjuk topp | **Byggd – väntar på test med örat** |

## Gränssnittet

Samma upplägg i alla vyer: skärmen är delad i två fasta halvor och scrollar aldrig – **grafen överst**, **block** i
flödesordning och en **panel** för valt block. Rubriken har runda av/på-knappar för 🎧 Hörlurar och 🎚️ Masterlab
(gröna = på), ⚙ och ⓘ. Under rubriken: preset, Före/Efter, ↶ Ångra och ⋯ (presetinfo och hantering).

- **Live** – Snabb (genväg) | In → EQ 1 → Kompr. → EQ 2 → Limiter → Ut, i samma ordning som ljudet går. EQ-band är lodräta fadrar,
  allt annat vågräta reglage. M/S på ett band lyssnar på bandets frekvensområde; Kompressorn har Hela låten eller ett band i taget.
- **Analys** – Analysera → Resultat → Referenser, med spektrumet (eller resultatet mot referensen) överst.
- **Fil** – Låt → Klang → Mätare → Exportera, med spelaren (A/B) överst.
- **Mer** – Behörigheter → Felsökning → Appen, med en överblick överst.

## Hörlurskorrigering

Inbyggd: **Soundcore Liberty 4 Pro** – korrektion från [AutoEq](https://github.com/jaakkopasanen/AutoEq)
(MIT-licens, © Jaakko Pasanen), mätning av DHRME, mål Harman in-ear. Ställ Soundcore-appens EQ på platt/av.
Fler hörlurar: kopiera AutoEq:s `ParametricEQ.txt` och klistra in i appen.

## Designförslag

`design/` innehåller förslagen som HTML och bilder. **`s2-floede` (B, flödet som block) är valt** och infört i hela
appen. Äldre förslag: A Studio, B En ratt, C Kurva först, `l1`–`l3` och `s1-delad`.
Tre enklare layouter utan scroll (spektrum alltid synligt): `l1-flikar` (fasta flikar EQ/Kompr./Limiter), `l2-kurva`
(dra punkter direkt i spektrumet, rattar för frekvens/gain/Q) och `l3-mixer` (lodräta fadrar med M/S).

## Filmastringens kedja (fas 3)

Trim → Pre-EQ → Match-EQ → Multiband (Linkwitz-Riley 4 band, transient shaper på kickbandet) → Post-EQ → Parametrisk EQ →
De-esser → Mjuk topp → Stereobredd → Lim (buss-kompressor) → Drive (automatiskt mot mål-LUFS) → Soft clipper → True-peak-limiter
(lookahead, 4x översampling) → Utgång. Egen DSP i ren JavaScript (`src/dsp/`) som körs i en Web Worker – snabbare än
realtid och samma kod som testerna kör. Avkodning och omsampling görs med `OfflineAudioContext`.

Live (Androids DSP) och fil (egen DSP) låter inte exakt lika – det står även i appens hjälptext.

## Installera

Varje push bygger en APK i GitHub Actions och lägger den under **Releases**. Ladda ner `masterlab.apk` på
telefonen och öppna den. Saknas signeringsnyckeln i repo-secrets blir det ett debug-bygge (förhandsversion),
signerat med en fast debug-nyckel i repot så att varje nytt bygge installeras ovanpå det förra.
Byte från debug-bygge till signerat bygge kräver att appen avinstalleras en gång.

Repo-secrets för signerade byggen: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` (samma nyckel som familjekalendern går bra).

## Uppdateringar

Varje bygge publicerar `latest.json`, `bundle.zip` (webbdelen) och `masterlab.apk` i releasen **live**.
Appen söker när den öppnas:

- **Webbdelen** (gränssnitt, presets, hjälptexter) byts automatiskt – ingen installation.
- **Inbyggd kod** (Kotlin/manifest – då höjs `native-level`): appen visar en banner och installerar ny APK med ett tryck.
- Startar inte en ny webbdel inom 20 s backar appen till den förra och hoppar över den versionen.

Kräver att repot är **publikt** (telefonen hämtar utan inloggning).

## Behörigheter

Allt finns under fliken **Behörigheter** i appen, med en knapp per behörighet:

| Behörighet | Behövs till | Krävs? |
|---|---|---|
| Global session (0) | Effekten på allt ljud | Ja (förvald, fungerar på Armins telefon) |
| Notiser | Notisen med PÅ/AV | Rekommenderas |
| Undantag från batterioptimering | Att Android inte stänger motorn | Rekommenderas (Samsung: lägg även till under *Appar som aldrig försätts i viloläge*) |
| Mikrofon | Jämn volym, spektrum, analys, auto-nivåmatcha (Visualizer) – inget spelas in | Rekommenderas |
| Installera okända appar | Ny APK med ett tryck | Rekommenderas |
| DUMP (sessionsdetektering) | Reserv om global session slutar fungera | Valfritt |

## Bevilja sessionsdetektering (DUMP)

Android låter inte en app se vilka ljud-sessioner andra appar spelar på. Masterlab läser därför
`dumpsys audio`, vilket kräver behörigheten `DUMP`. Den kan bara ges med ADB-rättigheter – samma sak som Wavelet
ber om för "enhanced session detection". Behörigheten ligger kvar tills appen avinstalleras.
Det behövs bara om global session slutar fungera.

### Bara telefonen (Shizuku)

1. Slå på utvecklaralternativ: Inställningar → Om telefonen → Programvaruinformation → tryck 7 gånger på *Build-nummer*.
2. Installera **Shizuku** från Play Butik (knappen *Installera Shizuku* i appen).
3. Öppna Shizuku → *Starta via trådlös felsökning* → följ guiden: Utvecklaralternativ → Trådlös felsökning →
   *Para ihop enhet med parningskod*, skriv koden i Shizukus notis, tryck *Starta*. Kräver wifi.
4. I Masterlab: Behörigheter → **Bevilja med Shizuku** → tillåt Masterlab i frågan.

### Med dator

1. **Utvecklaralternativ:** Inställningar → Om telefonen → tryck 7 gånger på *Build-nummer*
   (på Samsung: Om telefonen → Programvaruinformation → Build-nummer).
2. **USB-felsökning:** Inställningar → System → Utvecklaralternativ → slå på *USB-felsökning*.
3. **ADB på datorn:** ladda ner *Android SDK Platform-Tools* från developer.android.com och packa upp.
4. Anslut telefonen med USB och godkänn frågan "Tillåt USB-felsökning?" på telefonen.
5. Kör i en terminal i mappen `platform-tools`:

   ```
   adb shell pm grant se.foric.masterlab android.permission.DUMP
   ```

   (Windows: `adb.exe shell pm grant se.foric.masterlab android.permission.DUMP`.)
   Inget svar betyder att det gick bra.
6. Öppna Masterlab → Behörigheter. *Sessionsdetektering (DUMP)* ska visa ✓.


## Live-kedjan (fas 2)

Ingång → pre-EQ (8 band) → multiband-kompressor (4 band: 0–120 Hz kick, 120 Hz–2 kHz, 2–8 kHz, 8 kHz+) → post-EQ
(8 band) → parametrisk EQ (5 band med frekvens, gain och Q, läggs i post-EQ:ns 31 tersband) → limiter (attack, release, ratio, tak, efterförstärkning) → utgångsnivå. Allt i Androids `DynamicsProcessing`.

- **PÅ/AV** (stora knappen och i notisen) växlar mellan mastrat och original.
- **Utgångsnivå** för att nivåmatcha själv, eller **Auto-nivåmatcha** (mäter med Visualizer, kräver mikrofonbehörighet).
- **Presets (30):** Orörd (ingen bearbetning), Mjuk kick, Suno-fix, Radio ljus, Silkeslen röst, Varm lim, genrer och lyssningsmiljöer (bil, telefon, hörlurar) m.fl. Spara, döp om, ta bort,
  exportera/importera som JSON.
- **Block:** Snabb (sex enkla reglage), EQ (fem band med frekvens, höj/sänk och bredd, plus 8 band), Kompr. (fyra band),
  Limiter och Ut – alla med lodräta fadrar, M (mute) och S (solo).
- **Solo (S) och mute (på/av)** på varje sektion, band och enkelt reglage – hör bara en del, resten neutralt.
- **Byt bara en del:** EQ, kompressor eller limiter från en annan preset; resten ligger kvar.
- **Skydd mot misstag:** reglagen ändras bara vid drag i sidled (svep upp/ner scrollar), **↶ Ångra** upp till 20 steg.

Parametermodellen finns i `src/chain.js` (webben) och `LiveParams.kt` (Kotlin) med samma gränser.

## Utveckling

```
npm install
npm run dev                       # webbgränssnittet, lägg till ?sim=1 för simulerad live-motor
npm test                          # enhetstester (Node) + Playwright-tester
npx cap sync android && (cd android && ./gradlew testDebugUnitTest assembleDebug)
```

Regler för kodändringar finns i `CLAUDE.md`.
