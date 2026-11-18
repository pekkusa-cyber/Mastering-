# Masterlab

Egen mastringsapp för Android som ska få Suno-låtar att låta färdiga: mjukare kick och toppar, silkeslen röst,
riktig limiter, kompressor, EQ och presets. Två lägen:

1. **Live** – bearbetar ljudet från andra appar (Suno-appen, Suno i Chrome) medan du lyssnar.
2. **Fil** – importerar en färdig låt (MP3/WAV), mastrar den och exporterar WAV (kommer i fas 3).

## Status

| Fas | Innehåll | Läge |
|---|---|---|
| 1 | Prototyp: går det att bearbeta Sunos ljud live? (go/no-go) | **Byggd – väntar på test på telefonen** |
| 2 | Hela live-kedjan (EQ, multiband, limiter, presets, Enkelt/Avancerat) | Ej påbörjad |
| 3 | Filmastring i Web Audio (LUFS, true peak, export) | Ej påbörjad |

## Installera

Varje push bygger en APK i GitHub Actions och lägger den under **Releases**. Ladda ner `masterlab.apk` på
telefonen och öppna den. Saknas signeringsnyckeln i repo-secrets blir det ett debug-bygge (förhandsversion);
det måste avinstalleras innan en signerad version kan installeras.

Repo-secrets för signerade byggen: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` (samma nyckel som familjekalendern går bra).

## Bevilja sessionsdetektering (en gång, från en dator)

Android låter inte en app se vilka ljud-sessioner andra appar spelar på. Masterlab läser därför
`dumpsys audio`, vilket kräver behörigheten `DUMP`. Den kan bara ges via ADB – samma sak som Wavelet ber om
för "enhanced session detection". Behörigheten ligger kvar tills appen avinstalleras.

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
6. Öppna Masterlab, stoppa och starta live-motorn. Kortet *Sessionsdetektering* ska visa ✓.

Utan dator går det att använda *Trådlös felsökning* (Android 11+) tillsammans med en ADB-app på telefonen,
men datorvägen är enklast.

## Testa fas 1

1. Stäng av Wavelet (de två apparna slåss annars om samma ljud).
2. Starta live-motorn i Masterlab. En notis visas.
3. Spela en låt i Suno. Slå **testläget** på/av – med den stora knappen eller med *Slå på/Slå av* i notisen.
   Testläget = +6 dB in och limiter med tak −20 dB, så det ska höras direkt.
4. Upprepa med Suno i Chrome och med YouTube. Prova även *global session (0)*.
5. Tryck **Kopiera felsökningsrapport** och klistra in den i chatten.

## Utveckling

```
npm install
npm run dev                       # webbgränssnittet, lägg till ?sim=1 för simulerad live-motor
npm test                          # Playwright-tester
npx cap sync android && (cd android && ./gradlew testDebugUnitTest assembleDebug)
```

Regler för kodändringar finns i `CLAUDE.md`.
