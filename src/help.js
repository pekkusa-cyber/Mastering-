// Hjälptexter (ⓘ) per vy. Uppdatera texten för vyn samtidigt som funktionen ändras (se CLAUDE.md).
export const HELP = {
  live: {
    title: 'Live',
    html: `
      <p>Live-läget lägger Androids inbyggda ljudeffekt <b>DynamicsProcessing</b> på allt ljud som telefonen spelar
      (Suno-appen, Suno i Chrome, YouTube) medan du lyssnar.</p>
      <h3>På/av</h3>
      <p>Den stora knappen växlar mellan <b>PÅ</b> (mastrat) och <b>AV</b> (originalet, förbikopplat). Samma knapp finns
      i notisen, så du kan jämföra utan att byta app. Motorn startar av sig själv när du slår PÅ.</p>
      <h3>Nivåmatcha – låt inte örat luras</h3>
      <p>Det som är högre låter nästan alltid "bättre". Använd <b>Utgångsnivå</b> så att PÅ och AV låter lika högt,
      och jämför sedan. <b>Auto-nivåmatcha</b> mäter nivån med och utan bearbetning (cirka 8 sekunder, ljudet växlar
      under tiden) och ställer in utgången åt dig. Den kräver mikrofonbehörighet – inget spelas in.
      Fungerar inte mätningen på telefonen står det varför.</p>
      <h3>Presets</h3>
      <p>Presetsen är startvärden att justera med örat, inte facit:</p>
      <ul>
        <li><b>Mjuk kick</b> – kick-bandet (0–120 Hz) komprimeras med snabb attack, limitern tar topparna.</li>
        <li><b>Radio ljus</b> – lätt höjning över 8 kHz, bred kompression och hård limiter.</li>
        <li><b>Silkeslen röst</b> – mjukare 3–8 kHz och mild kompression i det övre mellanregistret.</li>
        <li><b>Varm lim</b> – mild, bred kompression som håller ihop mixen.</li>
        <li><b>Test (överdrivet)</b> – fas 1:s testläge, för att höra att effekten sitter på.</li>
      </ul>
      <p><b>Spara som</b> sparar det du hör nu som en egen preset. Egna presets kan döpas om, tas bort,
      exporteras till en JSON-fil och importeras igen (t.ex. på en annan telefon). "(ändrad)" betyder att
      inställningen skiljer sig från den sparade presetten.</p>
      <h3>Enkelt</h3>
      <p>Fyra reglage ovanpå vald preset. Mitten (0) = presetten som den är.</p>
      <ul>
        <li><b>Kick mjukare</b> – hårdare kompression av 0–120 Hz med snabbare attack.</li>
        <li><b>Ljusare</b> – mer diskant över 8 kHz.</li>
        <li><b>Tryck / limiter</b> – mer signal in i limitern: högre och tätare.</li>
        <li><b>Röst silkeslen</b> – mjukare 3–8 kHz och mer kompression där rösten sticker ut.</li>
      </ul>
      <h3>Avancerat</h3>
      <p>Hela kedjan i ordning: <b>Ingång</b> → <b>Pre-EQ</b> (8 band) → <b>Multiband</b> (4 band: kick 0–120 Hz,
      120 Hz–2 kHz, 2–8 kHz, 8 kHz+) → <b>Post-EQ</b> (8 band) → <b>Limiter</b> → <b>Utgång</b>.
      Per multiband: <i>tröskel</i> (där kompressionen börjar), <i>ratio</i> (hur hårt), <i>attack</i>/<i>release</i>
      (hur snabbt den tar tag/släpper), <i>knä</i> (mjuk övergång), <i>för-</i> och <i>efterförstärkning</i>.
      Limiterns <i>tak</i> är den högsta nivån som släpps igenom. När du går till Avancerat bakas de enkla
      reglagen in i värdena.</p>
      <h3>Felsökning</h3>
      <p>Listan visar vilka ljud-sessioner som hittats och om effekten sitter på. <b>Global session (0)</b> tar allt ljud
      och är förvald. Hittas enskilda appar samtidigt får de ingen egen effekt (annars bearbetas ljudet två gånger).
      <b>Kopiera felsökningsrapport</b> och klistra in den i chatten med Claude om något krånglar.</p>
      <p>Använd inte Wavelet samtidigt – apparna slåss om samma ljud.</p>`,
  },
  perms: {
    title: 'Behörigheter',
    html: `
      <p>Här ser du allt Masterlab behöver och kan ge det med ett tryck. Bara <b>Global session</b> krävs; resten gör
      live-läget stabilare eller ger extra funktioner.</p>
      <ul>
        <li><b>Global session</b> – lägger effekten på allt ljud. Fungerar på din telefon. Om den slutar fungera
        (t.ex. efter en uppdatering) behövs sessionsdetekteringen nedan.</li>
        <li><b>Notiser</b> – notisen med PÅ/AV-knappen. Utan den syns inte notisen, men motorn går ändå.</li>
        <li><b>Batterioptimering</b> – så att Android inte stänger motorn i bakgrunden. På Samsung: lägg också till
        Masterlab under Inställningar → Batteri → Gränser för bakgrundsanvändning →
        <i>Appar som aldrig försätts i viloläge</i>.</li>
        <li><b>Mikrofon</b> – bara för Auto-nivåmatcha (Android kräver den för att mäta ljudnivån). Inget spelas in eller sparas.</li>
        <li><b>Sessionsdetektering (DUMP)</b> – reserv om global session inte fungerar. Kan bara ges med ADB-rättigheter:
        antingen med <b>Shizuku</b> direkt på telefonen eller med en dator.</li>
      </ul>
      <h3>Shizuku – så gör du (bara telefonen)</h3>
      <ol>
        <li>Slå på utvecklaralternativ: Inställningar → Om telefonen → Programvaruinformation → tryck 7 gånger på <i>Build-nummer</i>.</li>
        <li>Installera Shizuku (knappen nedan öppnar Play Butik).</li>
        <li>I Shizuku: välj <i>Starta via trådlös felsökning</i> och följ guiden (parkoppla med koden under
        Utvecklaralternativ → Trådlös felsökning → <i>Para ihop enhet med parningskod</i>). Kräver wifi.</li>
        <li>Tillbaka här: tryck <b>Bevilja med Shizuku</b> och tillåt Masterlab i frågan som dyker upp.</li>
      </ol>
      <p>Behörigheten ligger kvar tills Masterlab avinstalleras. Shizuku behöver bara vara igång när du beviljar.</p>`,
  },
};
