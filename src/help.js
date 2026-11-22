// Hjälptexter (ⓘ i rubriken) per vy. Förklaringar för enskilda reglage och sektioner finns i info.js.
// Uppdatera texten för vyn samtidigt som funktionen ändras (se CLAUDE.md).
export const HELP = {
  live: {
    title: 'Live',
    html: `
      <p>Live lägger Androids ljudeffekt <b>DynamicsProcessing</b> på allt ljud telefonen spelar – Suno, Spotify, YouTube –
      medan du lyssnar.</p>
      <h3>Samma upplägg i hela appen</h3>
      <p>Skärmen är delad i två fasta halvor och scrollar aldrig: <b>grafen överst</b> visar alltid det du arbetar med,
      <b>blocken</b> i mitten är flödet i ljudets ordning, och <b>panelen</b> under visar reglagen för valt block.
      Tryck på ett block (eller svep i sidled i panelen) för att byta.</p>
      <h3>Rubriken</h3>
      <ul>
        <li><b>🎧</b> – hörlurskorrigeringen (neutrala lurar). Grön = på, grå = av. Fungerar helt för sig.</li>
        <li><b>🎚️</b> – Masterlab: allt annat (mastring, jämn volym, konstant nivå). Grön = på, grå = av.</li>
        <li><b>☰</b> menyn: byt mellan Live, Analys, Fil och Mer. <b>⚙</b> inställningar, <b>ⓘ</b> den här hjälpen.</li>
      </ul>
      <p>🎧 på + 🎚️ av = vanlig musik, bara neutral. Båda av = helt originalljud. Knapparna finns också i notisen.</p>
      <h3>Raden under rubriken</h3>
      <ul>
        <li><b>Preset ▾</b> – välj bland 30 (Orörd, Mjuk kick, Suno-fix, Radio ljus …). "ändrad" = du har ändrat något.</li>
        <li><b>Före / Efter</b> – jämför originalet med det mastrade ljudet (nivåmatchat).</li>
        <li><b>↶</b> Ångra (upp till 20 steg). <b>⋯</b> visar vad presetten påverkar och låter dig spara, döpa om, ta bort, exportera och importera.</li>
      </ul>
      <h3>Blocken följer ljudets väg</h3>
      <p>Ljudet går genom effekten i en fast ordning (Androids), och blocken står i exakt samma ordning:
      <b>In</b> → <b>EQ 1</b> (före kompressorn) → <b>Kompr.</b> → <b>EQ 2</b> (efter kompressorn) → <b>Limiter</b> → <b>Ut</b>.
      Hörlurskorrigeringen (🎧) läggs i slutet av EQ 2, precis före limitern. <b>Snabb</b> är ingen del av kedjan utan en genväg som styr flera
      delar samtidigt, därför står den för sig.</p>
      <ul>
        <li><b>Snabb</b> – sex reglage ovanpå presetten: Kick, Ljus, Tryck, Röst, S-ljud, Topp (mitten = presetten som den är).</li>
        <li><b>In</b> – ingångsförstärkning: hur hårt ljudet driver in i allt som följer.</li>
        <li><b>EQ 1</b> – åtta band före kompressorn (formar vad kompressorn reagerar på).</li>
        <li><b>Kompr.</b> (tryck) – fyra band: Kick, Mellan, Närvaro, Luft. Grafen visar hur mycket varje band trycks ner.
        Fadrar: Styrka, Startar vid, Reaktion, Släpper, Mjukhet, Lyft.</li>
        <li><b>EQ 2</b> – efter kompressorn: <b>8 band</b> och sedan de fem EQ-punkterna Bas, Lågmitt, Mitt, Närvaro och Diskant. Dra punkterna i grafen
        eller använd fadrarna <b>Frekvens</b>, <b>Höj / sänk</b> och <b>Bredd (Q)</b>.</li>
        <li><b>Limiter</b> (volym) – skyddar topparna: Tak, Styrka, Reaktion, Släpper, Lyft. Grafen visar in → ut.</li>
        <li><b>Ut</b> – slutlig nivå, Auto-nivåmatcha, Platt, Slå på allt och Återställ alla. Grafen jämför nivån Original och Efter.</li>
      </ul>
      <p>Pricken på ett block visar om det är på. I panelens rubrik: på/av för hela blocket, <b>S</b> (solo – hör bara blocket)
      och <b>Preset ▾</b> – ta just den delen från en annan preset.</p>
      <h3>Reglagen</h3>
      <ul>
        <li><b>EQ</b> (EQ 1 och EQ 2) har lodräta fadrar som ett riktigt mixerbord: dra handtaget uppåt/nedåt, <b>+ / −</b> = 0,5 dB,
        dubbeltryck på namnet = presetens värde. Frekvens går logaritmiskt (en tredjedels oktav per tryck), som på en riktig EQ.</li>
        <li><b>Allt annat</b> är vågräta reglage: dra i sidled, <b>− / +</b> tar ett tydligt steg, <b>↺</b> = presetens värde.</li>
        <li>Ett tryck flyttar inget, och sveper du upp/ner scrollar sidan – inget ändras av misstag.</li>
        <li>Det du ändrar i <b>Snabb</b> syns på fadrarna i de andra blocken (t.ex. Ljusare höjer EQ 2:s 8k-fader).</li>
        <li><b>ⓘ</b> vid varje reglage förklarar vad det gör.</li>
      </ul>
      <h3>Solo och mute</h3>
      <ul>
        <li><b>S på en hel del</b> (Snabb-reglage, In, EQ 1, Kompressor, Limiter): bara den delens effekt hörs.</li>
        <li><b>S på ett band</b> (EQ-band eller kompressorband): bara bandets frekvensområde hörs, med hela kedjan kvar – som solo på en riktig EQ.
        <b>M på ett band</b> tar bort området. En gul ruta i grafen visar vad du lyssnar på, ✕ avslutar.</li>
        <li>På/av-knappen vid en del stänger av hela delen.</li>
      </ul>
      <h3>Kompressorn</h3>
      <p><b>Hela låten</b> ställer alla fyra band likadant – hela låten trycks ihop jämnt. Eller välj Kick, Mellan, Närvaro eller Luft och ställ bandet för sig.</p>
      <h3>Bekräftelse</h3>
      <p>Efter en ändring visas en kort ruta nere till höger i grafen (t.ex. <b>✓ Ändringen hörs nu</b>) som försvinner av sig själv.
      Tar en annan app (t.ex. Wavelet) kontrollen ligger en varning kvar tills du trycker <b>Ta tillbaka</b>.</p>
      <h3>Inställningar (⚙)</h3>
      <p>Hörlurar (modell, styrka, samma volym, graf), Jämn volym, Konstant utnivå, Volymoberoende kompression och profil
      för enheten (byter inställning själv när hörlurarna/bilen ansluts).</p>
      <p>Använd inte Wavelet samtidigt – apparna slåss om samma ljud.</p>`,
  },
  analys: {
    title: 'Analys – referenslyssning',
    html: `
      <p>Här ser du vad som spelas och jämför din låt med låtar du vill låta som – utan att behöva ladda upp testversioner.
      Samma upplägg som i Live: grafen överst, blocken <b>Analysera → Resultat → Referenser</b> och panelen under.</p>
      <h3>Spektrum</h3>
      <p>Staplarna visar energin per frekvensområde just nu. Linjen är vald referens. Kurvorna jämförs på formen,
      inte på volymen. Tryck på ett band för att se värdena.</p>
      <h3>Så gör du</h3>
      <ol>
        <li><b>Spara en referens:</b> tryck <b>Starta analys</b>, spela en låt du gillar (t.ex. på YouTube) från början
        till slut, kom tillbaka och tryck <b>Stoppa</b> → <b>Spara som referens</b>. Du kan också importera en ljudfil.</li>
        <li><b>Kolla din låt:</b> välj referensen, analysera din låt i Suno på samma sätt. Du får ett omdöme per
        område (bas, närvaro, luft …) och om toppar/kick sticker ut.</li>
        <li><b>Rätta:</b> <b>Åtgärda – 3 förslag</b> tar fram A Varsam, B Balanserad och C Kraftig som bara rättar det som är
        markerat. Växla mellan Före, A, B och C medan låten spelar och behåll den som låter bäst. I <b>Fil</b> kan samma
        referens användas för att matcha och mastra låten för släpp.</li>
      </ol>
      <h3>Bra att veta</h3>
      <ul>
        <li>Analysen läser ljudet <b>internt</b> från det som spelas (Spotify, YouTube, Suno …). Mikrofonen används aldrig –
        Android kallar bara behörigheten för det "mikrofon".</li>
        <li>Analysen visar ljudet som det spelas – slå AV i Live för att analysera originalet.</li>
        <li>Saknar referensen toppen (spelad i låg kvalitet) markeras Luft som "kan inte jämföras" och rättas inte.</li>
        <li>Live-analysen är grövre än filanalys (Android ger bara 8-bitars ljud till mätningen, och upplösningen
        under 100 Hz är grov). Referenser från filer är exaktare.</li>
        <li>Analysen fortsätter i bakgrunden medan du lyssnar i en annan app.</li>
      </ul>`,
  },
  fil: {
    title: 'Fil – mastring för släpp',
    html: `
      <p>Mastrar en färdig låt (MP3/WAV) och exporterar en WAV för distribution. Allt sker på telefonen.
      Samma upplägg som i Live: spelaren (A/B) ligger fast överst, blocken <b>Låt → Klang → Mätare → Exportera</b> och panelen under.</p>
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
      <p>Trim → Pre-EQ → Match-EQ → Multiband (Linkwitz-Riley, 4 band, kick-anslag på kickbandet) → Post-EQ → Parametrisk EQ →
      De-esser → Mjuk topp → Stereobredd → Lim → Drive → Soft clipper → True-peak-limiter (lookahead, 4x översampling) → Utgång.</p>
      <h3>Varför Fil har fler delar än Live</h3>
      <p>Live använder Androids inbyggda ljudeffekt, som bara har In, EQ före kompressorn, en kompressor i fyra band, EQ efter
      och en limiter – i den ordningen, och den går inte att bygga ut. Fil räknar ljudet själv i appen och kan därför ha mer:
      match-EQ, kick-anslag, de-esser, mjuk topp, stereobredd, lim (buss-kompressor), soft clipper och en true-peak-limiter med lookahead.
      Upplägget är detsamma: EQ med lodräta fadrar, allt annat med vågräta reglage.</p>
      <h3>Spelaren</h3>
      <p>Överst syns låtens vågform: tryck eller dra på den för att spola. ▶/❚❚ spelar och pausar, ■ stoppar och går till början.
      A/B växlar mellan original och mastrat, <b>Lika nivå</b> gör dem lika höga så att du jämför klangen och inte volymen.</p>
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
      <p>Behörigheter, felsökning och uppdateringar. Överst en överblick (grön = klart, röd = saknas), blocken
      <b>Behörigheter → Felsökning → Appen</b> och panelen under.</p>
      <ul>
        <li><b>Global session</b> – lägger effekten på allt ljud. Fungerar på din telefon.</li>
        <li><b>Ljudanalys ("mikrofon")</b> – låter appen läsa det som spelas internt för spektrum, analys, jämn volym och
        auto-nivåmatchning. Mikrofonen används aldrig; Android kallar bara behörigheten så.</li>
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
