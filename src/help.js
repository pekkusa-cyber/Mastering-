// Hjälptexter (ⓘ i rubriken) per vy. Förklaringar för enskilda reglage och sektioner finns i info.js.
// Uppdatera texten för vyn samtidigt som funktionen ändras (se CLAUDE.md).
export const HELP = {
  live: {
    title: 'Live',
    html: `
      <p>Live lägger Androids ljudeffekt <b>DynamicsProcessing</b> på allt ljud telefonen spelar – Suno-appen, Suno i
      Chrome, YouTube – medan du lyssnar.</p>
      <h3>Två huvudbrytare</h3>
      <ul>
        <li><b>🎧 Hörlurar</b> – bara hörlurskorrigeringen (neutrala lurar). Fungerar helt för sig.</li>
        <li><b>Masterlab</b> – allt annat: mastring, jämn volym, konstant nivå.</li>
      </ul>
      <p>Hörlurar på + Masterlab av = vanlig musik, bara neutral. Båda av = helt originalljud. Knapparna finns också i notisen.</p>
      <h3>Original / Mastrad</h3>
      <p>Med Masterlab på jämför växeln originalet med det mastrade ljudet (nivåmatchat med Jämn volym).</p>
      <h3>Bekräftelse</h3>
      <p>När du ändrar något visas en rad längst ner: <b>✓ Ändringen ligger på ljudet</b>, eller en varning om motorn är
      av eller om en annan app (t.ex. Wavelet) har tagit kontrollen – tryck då <b>Ta tillbaka</b>.</p>
      <h3>Hörlurskorrigering</h3>
      <p>Gör dina hörlurar neutrala (AutoEq). Soundcore Liberty 4 Pro finns inbyggd; fler kan importeras under 🎧-knappen.
      Ställ Soundcore-appens EQ på platt. Korrigeringen ligger efter mastringen, precis före slutlimitern (Androids effekt har alltid limitern sist), och sänker totalt så att den aldrig skapar nya toppar.</p>
      <h3>Smart (chipen)</h3>
      <p>Tryck på ett chip för att slå på/av. Där sparar du också en profil för enheten.</p>
      <ul>
        <li><b>Jämn volym</b> – samma nivå mellan appar och låtar (YouTube → Suno utan att röra volymen), och mellan PÅ och AV.
        Kräver mikrofonbehörighet (inget spelas in).</li>
        <li><b>Konstant utnivå</b> – varje ändring kompenseras direkt så att PÅ låter lika högt som originalet. Då hör du om
        ändringen gör det bättre, inte bara högre. Siffran visar hur mycket som kompenseras just nu.</li>
        <li><b>Volymoberoende kompression</b> – låter likadant vid låg och hög volym.</li>
        <li><b>Profil för enheten</b> – spara nuvarande inställning för hörlurarna/högtalaren/bilen. När enheten ansluts
        byter appen själv.</li>
      </ul>
      <h3>Presets</h3>
      <p>30 startpunkter som kort du sveper mellan (eller väljer i listan) – <b>Orörd</b> (ingen bearbetning alls, en ren grund
      att bygga från), Mjuk kick, Suno-fix, Radio ljus, Silkeslen röst, R&amp;B silke, Trap 808, Schlager, Bilstereo, Telefonhögtalare m.fl.
      Raden <b>Påverkar</b> visar exakt vad presetten gör, t.ex. att Mjuk kick bara arbetar med kompression av kickbandet och
      limitern – inte med EQ. Spara din egen under <b>⋯ Hantera</b> (spara, döp om, ta bort, exportera, importera).</p>
      <h3>Enkelt och Avancerat</h3>
      <p><b>Enkelt</b>: sex reglage i grupperna Ton, Vokal, Bas och Dynamik, ovanpå presetten. Under varje reglage står vad det påverkar,
      och gruppens knapp slår av/på hela gruppen (mitten = presetten som den är). <b>Avancerat</b>: hela kedjan –
      Ingång → Pre-EQ → Multiband → Post-EQ → Limiter → Utgång.</p>
      <ul>
        <li><b>På/av</b> på varje reglage, sektion och band: slå bara på det du vill ha (t.ex. bara mjukare kick).
        Av = neutralt, inställningen ligger kvar. <b>Slå på allt</b> tar tillbaka allt.</li>
        <li><b>− / +</b> för små steg.</li>
        <li><b>Kurvor</b>: klangkurvan visar hur EQ:n ändrar klangen; kompressionskurvorna visar hur varje band trycks ihop
        (och ungefär hur mycket). De ritas om medan du drar.</li>
        <li><b>ⓘ</b> vid varje reglage och sektion förklarar vad den gör.</li>
        <li><b>↺</b> nollställer just det reglaget (till presetens värde; enkla reglage till mitten).</li>
        <li><b>Återställ alla</b> tar tillbaka hela presetten. <b>Platt</b> gör allt neutralt.</li>
      </ul>
      <p>Använd inte Wavelet samtidigt – apparna slåss om samma ljud.</p>`,
  },
  analys: {
    title: 'Analys – referenslyssning',
    html: `
      <p>Här ser du vad som spelas och jämför din låt med låtar du vill låta som – utan att behöva ladda upp testversioner.</p>
      <h3>Spektrum</h3>
      <p>Staplarna visar energin per frekvensområde just nu. Linjen är vald referens. Kurvorna jämförs på formen,
      inte på volymen. Tryck på ett band för att se värdena.</p>
      <h3>Så gör du</h3>
      <ol>
        <li><b>Spara en referens:</b> tryck <b>Starta analys</b>, spela en låt du gillar (t.ex. på YouTube) från början
        till slut, kom tillbaka och tryck <b>Stoppa</b> → <b>Spara som referens</b>. Du kan också importera en ljudfil.</li>
        <li><b>Kolla din låt:</b> välj referensen, analysera din låt i Suno på samma sätt. Du får ett omdöme per
        område (bas, närvaro, luft …) och om toppar/kick sticker ut.</li>
        <li><b>Rätta:</b> <b>Matcha EQ live</b> gör en preset som drar klangen mot referensen. I <b>Fil</b> kan samma
        referens användas för att matcha och mastra låten för släpp.</li>
      </ol>
      <h3>Bra att veta</h3>
      <ul>
        <li>Analysen visar ljudet som det spelas – slå AV i Live för att analysera originalet.</li>
        <li>Live-analysen är grövre än filanalys (Android ger bara 8-bitars ljud till mätningen, och upplösningen
        under 100 Hz är grov). Referenser från filer är exaktare.</li>
        <li>Analysen fortsätter i bakgrunden medan du lyssnar i en annan app.</li>
      </ul>`,
  },
  fil: {
    title: 'Fil – mastring för släpp',
    html: `
      <p>Mastrar en färdig låt (MP3/WAV) och exporterar en WAV för distribution. Allt sker på telefonen.</p>
      <ol>
        <li><b>Välj låt.</b> Den mastras direkt med vald preset och mål.</li>
        <li><b>Mål:</b> Streaming (−14 LUFS, −1 dBTP) eller Hög (−10 LUFS). Nivån räknas ut automatiskt.</li>
        <li><b>Preset</b> och reglage som i Live, plus kick-anslag, S-ljud (de-esser), Mjuk topp (mot glitter), soft clip,
        lim och stereobredd – alla med på/av, ⓘ och ↺.</li>
        <li><b>Klang mot referens:</b> välj en referens, se omdömet och tryck <b>Matcha klang</b>. Tryck igen för att förfina.</li>
        <li><b>Lyssna direkt:</b> låten spelas genom kedjan i realtid – ändringar hörs direkt. A (original) / B (mastrad),
        nivåmatchat så att du hör klangen och inte volymen.</li>
        <li><b>Versioner:</b> spara A, B, C … och växla mellan dem medan låten spelar.</li>
        <li><b>Mono och fas:</b> visar om låten tappar i mono (telefonhögtalare, klubb) och om basen är för bred.</li>
        <li><b>Album:</b> mastra flera låtar med samma inställning och nivå, exportera alla.</li>
        <li><b>Exportera:</b> 24 bit (för distribution) eller 16 bit, 44,1 eller 48 kHz, med dither.</li>
      </ol>
      <h3>Kedjan</h3>
      <p>Trim → Pre-EQ → Match-EQ → Multiband (Linkwitz-Riley, 4 band, kick-anslag på kickbandet) → Post-EQ →
      De-esser → Mjuk topp → Stereobredd → Lim → Drive → Soft clipper → True-peak-limiter (lookahead, 4x översampling) → Utgång.</p>
      <h3>Live och fil låter inte exakt lika</h3>
      <p>Live använder Androids inbyggda DSP; filmastringen har en egen kedja. Samma preset ger samma riktning men
      inte exakt samma ljud. Lyssna alltid på den exporterade filen innan du släpper den.</p>
      <h3>Mätarna</h3>
      <p>Loudness (LUFS) enligt EBU R128, true peak mätt mellan samplen (dBTP), loudness range (LU) och hur mycket
      limitern som mest sänkte.</p>`,
  },
  mer: {
    title: 'Mer',
    html: `
      <p>Behörigheter, felsökning och uppdateringar.</p>
      <ul>
        <li><b>Global session</b> – lägger effekten på allt ljud. Fungerar på din telefon.</li>
        <li><b>Mikrofon</b> – krävs av Android för att mäta ljudet: jämn volym, spektrum, analys och auto-nivåmatchning.
        Inget spelas in eller sparas.</li>
        <li><b>Notiser</b> – notisen med PÅ/AV.</li>
        <li><b>Batterioptimering</b> – så att Android inte stänger motorn. På Samsung även: Batteri → Gränser för
        bakgrundsanvändning → <i>Appar som aldrig försätts i viloläge</i>.</li>
        <li><b>Installera uppdateringar</b> – ny app-version med ett tryck.</li>
        <li><b>Sessionsdetektering (DUMP)</b> – reserv om global session slutar fungera.</li>
      </ul>
      <h3>Shizuku (bara telefonen)</h3>
      <ol>
        <li>Slå på utvecklaralternativ: Inställningar → Om telefonen → Programvaruinformation → tryck 7 gånger på <i>Build-nummer</i>.</li>
        <li>Installera Shizuku (knappen öppnar Play Butik).</li>
        <li>I Shizuku: <i>Starta via trådlös felsökning</i> och följ guiden (kräver wifi).</li>
        <li>Tryck <b>Bevilja med Shizuku</b> och tillåt Masterlab.</li>
      </ol>
      <h3>Uppdateringar</h3>
      <p>Appen söker vid start. Ändringar i gränssnitt, presets och hjälptexter kommer av sig själva; ändras appens
      inbyggda del visas en banner – tryck Installera.</p>
      <h3>Felsökning</h3>
      <p><b>Kopiera felsökningsrapport</b> och klistra in den i chatten med Claude om något krånglar.</p>`,
  },
};
