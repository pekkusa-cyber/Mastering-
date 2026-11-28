// Förklaringar (ⓘ) för varje reglage och sektion i Live, Analys och Fil. Kort: vad det gör, hur det låter,
// och ett tips. Uppdatera texten samtidigt som funktionen ändras (se CLAUDE.md).

const EQ_BANDS = [
  'Sub (0–60 Hz): mullret du känner mer än hör. För mycket gör låten tung och suddig på stora högtalare; för lite gör den tunn i bil och klubb.',
  'Kick och basens kropp (60–120 Hz): där kicken "trycker". Höj för mer tryck, sänk om kicken dånar.',
  'Bas värme (120–250 Hz): fyllighet och värme. För mycket låter "boomigt".',
  'Lådigt/grumligt (250–500 Hz): det vanligaste problemområdet. Sänk 1–2 dB för en klarare mix.',
  'Kropp (500 Hz–1 kHz): rösters och instruments stomme. För mycket låter näsigt eller som en telefon.',
  'Närvaro (1–3 kHz): rösten och tydligheten. Lite mer gör att texten hörs; för mycket blir tröttsamt.',
  'Skärpa (3–8 kHz): s-ljud, hi-hat och "hårdhet". Här brukar Suno låta vasst – sänk för silkeslen röst.',
  'Luft (8 kHz+): glans och öppenhet. Höj för en dyrare känsla; för mycket fräser.',
];

const MBC_BANDS = [
  'Kickbandet (0–120 Hz): kick och bas. Snabb attack här gör en hård kick mjukare.',
  'Mellanbandet (120 Hz–2 kHz): kroppen i mixen – bas, gitarr, röstens grund.',
  'Närvarobandet (2–8 kHz): röst, skärpa och s-ljud. Kompression här gör rösten lenare och jämnare.',
  'Luftbandet (8 kHz+): cymbaler, s-ljud och glans. Kompression här tar udden av fräs.',
];

export const INFO = {
  // ---- Live: övergripande ----
  onoff: { title: 'Original / Mastrad', text: 'Mastrad = bearbetat ljud (PÅ). Original = AV. Med Jämn volym påslagen låter PÅ och AV lika högt, så att du hör skillnaden i klang – inte i volym.' },
  agc: { title: 'Jämn volym', text: 'Håller ljudnivån jämn mellan appar och låtar: byt från YouTube till Suno utan att röra volymen. Masterlab mäter hur högt det spelas och höjer eller sänker gradvis (snabbare nedåt än uppåt). PÅ och AV får varsin nivå, så A/B-jämförelsen blir rättvis av sig själv. Första gången gör appen en kort mätning (ljudet sänks 4 dB i en sekund). Kräver mikrofonbehörighet – inget spelas in.' },
  agcTarget: { title: 'Nivå för jämn volym', text: 'Hur högt allt ska ligga. −14 passar de flesta. Lägre värde = tystare och mer marginal.' },
  presets: { title: 'Presets', text: 'Färdiga startpunkter att justera med örat – inte facit. Varje preset är byggd efter mastringspraxis (breda EQ-drag, lagom kompression) och kalibrerad på riktiga Suno-låtar: Jazz och Transparent trycker ned under 1 dB, Tät pop 3 dB, EDM och Gym 3–4 dB, Nattlyssning 6 dB. Börja gärna med Suno-fix eller din genre. Välj en, finjustera, och spara som din egen med "Spara som". Dina egna kan döpas om, tas bort (🗑 i listan) och exporteras som fil.' },
  mixer: { title: 'Snabb', text: 'Sex reglage ovanpå presetten: Kick, Ljus, Tryck, Röst, S-ljud och Topp (mitten = presetten som den är). Dra i sidled, eller tryck − / + (5 steg i taget). ↺ nollställer. På/av stänger av reglaget, S låter dig höra bara det. Det du ändrar här syns också på fadrarna i EQ, Kompressor och de andra blocken.' },
  mixerChain: { title: 'Mixer – Kedjan', text: 'En fader per del i kedjan: In (ingångsförstärkning), Pre-EQ, Kompressor, Post-EQ och PEQ som mängd (100 % = presetten, 0 % = ingen, 200 % = dubbelt så mycket), Limiterns tak och Ut (utgångsnivå). M stänger av delen, S låter dig höra bara den. Byter du till Kurva eller Avancerat bakas mängderna in i inställningen.' },
  curveMode: { title: 'Kurva', text: 'Den parametriska EQ:n direkt i spektrumet: dra en punkt i sidled för frekvens och upp/ner för gain. Två fingrar på skärmen = Q (isär = bredare, ihop = smalare). Tryck på en punkt eller en knapp 1–5 för att välja bandet och finjustera med reglagen under; M och S för bandet. Platta ut kurvan nollställer alla fem banden.' },
  simple: { title: 'Enkelt läge', text: 'Fyra reglage ovanpå vald preset. Mitten (0) = presetten som den är. ↺ nollställer ett reglage, "Återställ alla" nollställer alla.' },
  advanced: { title: 'Avancerat läge', text: 'Alla parametrar, för den som vill gå på djupet. Hela kedjan i ordning: Ingång → Pre-EQ → Multiband → Post-EQ → Parametrisk EQ → Limiter → Utgång. På/av-knappen = mute, S = solo (hör bara den delen). Dubbeltryck på namnet under en fader = tillbaka till presetens värde. "Återställ alla" = hela presetten. "Platt" = allt neutralt (ingen bearbetning utom skyddslimitern).' },

  kick: { title: 'Kick mjukare', text: 'Komprimerar kick-bandet (0–120 Hz) hårdare och snabbare så att en hård, klickig kick blir rundare. Åt vänster = hårdare, mer slag.' },
  bright: { title: 'Ljusare', text: 'Höjer diskanten över 8 kHz (och lite 3–8 kHz) för mer glans. Åt vänster = mörkare och mjukare.' },
  punch: { title: 'Tryck / limiter', text: 'Mer signal in i limitern: högre och tätare. För mycket gör låten platt och trött. Åt vänster = mer dynamik.' },
  vocal: { title: 'Röst silkeslen', text: 'Mjukar upp 3–8 kHz och komprimerar närvarobandet lätt, så att rösten blir len men fortfarande tydlig. Åt vänster = mer framträdande, skarpare röst.' },

  sibilance: { title: 'S-ljud', text: 'Tämjer vassa s-, t- och sch-ljud (5–10 kHz) med snabb kompression i de två övre banden – en de-esser. Åt vänster = mer s-ljud.' },
  glitter: { title: 'Mjuk topp', text: 'Tar bort "glitter", fräs och metalliskt skimmer i toppen över 8 kHz – vanligt i AI-genererad musik som Suno. Åt vänster = mer glans.' },
  enable: { title: 'På/av', text: 'Varje del kan slås av. Avslagen = påverkar inte ljudet alls (neutral), men inställningen sparas tills du slår på igen. Bra för att höra vad en enskild del gör.' },
  bypass: { title: 'Bypass', text: 'Helt originalljud – appen gör ingenting, inte ens jämn volym eller hörlurskorrigering. AV däremot visar originalet men nivåmatchat (och med hörlurskorrigering om den är på), så att jämförelsen blir rättvis.' },
  corrStrength: { title: 'Styrka', text: 'Hur mycket av AutoEq-korrektionen som används. 100 % = hela, mot Harman-kurvan (som många upplever som lite ljus för in-ear-lurar – den höjer kring 5 kHz). Låter allt vasst med korrigeringen på: prova 60–80 %.' },
  corrLevel: { title: 'Samma volym', text: 'Korrigeringen sänker totalt (preamp, för att +6 dB vid 5 kHz inte ska klippa) – utan detta blir det ca 6 dB tystare. Med detta på höjs nivån så att det låter lika högt som utan korrigering, och en säkerhetslimiter tar de få toppar som annars skulle klippa.' },
  corrAccuracy: { title: 'Hur exakt är korrigeringen?', text: 'Mätningen: ett exemplar av Liberty 4 Pro i en standardiserad öronsimulator (DHRME), mål Harman in-ear, korrektion från AutoEq. Hos dig skiljer det mest i basen, som beror på hur tätt öronproppen sluter (±2–4 dB – prova olika storlekar på tipsen), sedan exemplarvariation (ca ±1 dB). Över ca 8 kHz är alla sådana mätningar osäkra, därför korrigerar AutoEq försiktigt där. Appen lägger på kurvan med 31 tersband och följer den med i snitt under 0,2 dB avvikelse. Ställ Soundcore-appens EQ på platt/av.' },
  mains: { title: 'Hörlurar och Masterlab', text: 'De två runda knapparna i rubriken. 🎧 Hörlurar: bara korrigeringen som gör dina hörlurar neutrala – fungerar helt för sig. 🎚️ Masterlab: allt annat (mastring, jämn volym, konstant nivå). Grön = på, grå = av. 🎧 på och 🎚️ av = vanlig musik, bara neutral. Båda av = helt originalljud. Appen frågar då om den ska stängas helt (motor och notis) – den stängs aldrig av sig själv.' },
  smart: { title: 'Smarta funktioner', text: 'Tryck på ett chip för att slå på/av. Jämn volym: samma nivå mellan appar och mellan Original/Mastrad. Konstant nivå: varje ändring kompenseras direkt så att det låter lika högt (siffran = kompensationen). Volymoberoende: kompressionen låter likadant på alla volymer. (Hörlurskorrigeringen har en egen brytare högst upp.)' },
  constant: { title: 'Konstant utnivå', text: 'Varje ändring (EQ, kompression, ingång, limiter) kompenseras direkt så att PÅ ligger på samma nivå som originalet. Då hör du om ändringen gör låten bättre – inte bara högre. Appen räknar ut det från inställningarna; med Jämn volym på finjusteras det också med mätning.' },
  volComp: { title: 'Volymoberoende kompression', text: 'På vissa telefoner ligger volymknappen före effekten – då komprimerar appen mindre ju lägre du lyssnar. Med detta på flyttas trösklarna med volymen så att det låter likadant på alla volymer. Det används bara när appen har mätt att din telefon fungerar så (med Jämn volym på och en volymändring); annars skulle varje preset tryckas ihop för hårt och låta platt och vasst.' },
  correction: { title: 'Hörlurskorrigering', text: 'Rättar till dina hörlurars egen klang så att de låter neutralt (mot Harman-målkurvan) – som AutoEq i Wavelet. Gäller både PÅ och AV, så att du jämför på en neutral grund. Inbyggd: Soundcore Liberty 4 Pro (mätning av DHRME via AutoEq). Ställ Soundcore-appens EQ på platt/av. Du kan importera fler från AutoEq (ParametricEQ.txt).' },
  deviceProfile: { title: 'Profil per enhet', text: 'Koppla en preset och hörlurskorrigering till den utgång som används nu (t.ex. dina hörlurar, telefonens högtalare eller bilen). När den ansluts byter appen själv.' },
  eqCurve: { title: 'Klangkurva', text: 'Hur EQ:n ändrar klangen per frekvens: över linjen = mer, under = mindre. Heldragen = dina inställningar (pre- och post-EQ tillsammans), streckad = hörlurskorrigeringen.' },
  compCurve: { title: 'Kompressionskurvor', text: 'In-nivå (vågrätt) mot ut-nivå (lodrätt) per band. Den streckade diagonalen = ingen kompression. Där kurvan böjer av börjar kompressionen; ju flackare efter böjen, desto hårdare. Siffran = ungefär hur mycket bandet trycks ihop på normal musiknivå.' },
  outputGain: { title: 'Utgångsnivå', text: 'Sänk eller höj det mastrade ljudet så att PÅ och AV låter lika högt – annars luras örat av att högre låter bättre. Behövs inte när Jämn volym är på.' },
  autolevel: { title: 'Auto-nivåmatcha', text: 'Mäter nivån med och utan bearbetning (ca 8 sekunder, ljudet växlar) och ställer in utgångsnivån. Kräver mikrofonbehörighet.' },

  // ---- Live: kedjan ----
  sec_input: { title: 'Ingång', text: 'Förstärkningen in i kedjan. Mer in = mer kompression och limiter = högre och tätare.' },
  inputGain: { title: 'Ingångsförstärkning', text: 'Hur hårt ljudet driver in i kompressorer och limiter. +3–6 dB ger en tätare, högre känsla.' },
  sec_preEq: { title: 'Pre-EQ', text: 'EQ före kompressionen. Används för att ta bort problem (t.ex. grumlighet) innan kompressorerna reagerar på dem. 8 band.' },
  sec_peq: { title: 'Parametrisk EQ (Q)', text: 'Fem band där du själv väljer frekvens, gain och Q – för att träffa exakt det som stör (en tjutande ton, en lådig resonans) utan att röra grannarna. Bas och Topp är hyllor (allt under/över frekvensen), de tre i mitten är klockor. Ligger efter Post-EQ. Tips: höj ett band mycket, svep frekvensen tills det låter värst, sänk det sedan och smalna av med Q. S spelar bara bandets område, M tar bort det.' },
  peqFreq: { title: 'Frekvens', text: 'Var bandet verkar (Hz). För hyllorna: gränsen där höjningen/sänkningen börjar.' },
  peqGain: { title: 'Gain', text: 'Hur mycket bandet höjer (+) eller sänker (−). Sänk hellre än höj – det låter renare och ger inga nya toppar.' },
  peqQ: { title: 'Q', text: 'Bredden. Högt Q (4–8) = smalt, för en enskild ton eller resonans. Lågt Q (0,5–1) = brett och musikaliskt. För hyllor styr Q hur brant övergången är (0,7 = mjuk).' },
  compAll: { title: 'Hela låten', text: 'Flyttar alla fyra kompressorband lika mycket – som en vanlig kompressor över hela låten. Reglagen visar medelvärdet av banden, och skillnader mellan banden (t.ex. kicken hårdare än luften) behålls. Vill du ha exakt samma inställning på alla band trycker du Gör alla band lika. Välj ett band (Kick, Mellan, Närvaro, Luft) för att ställa det för sig – det ändrar då bara det bandet.' },
  areaSolo: { title: 'M och S på ett band', text: 'S (solo): bara bandets frekvensområde hörs, med allt annat i kedjan kvar – du hör exakt vad bandet gör. M (mute): bandets område tas bort. Som på en riktig EQ eller multibandkompressor. ✕ i grafen avslutar.' },
  fileQuick: { title: 'Snabb (Fil)', text: 'Sex reglage du oftast vill ha: Kick-anslag, S-ljud, Mjuk topp, Soft clip, Lim och Stereobredd. Samma reglage finns i sina block (Kompr., Färg, Limiter) – ändrar du här syns det där. Presetten för hela låten väljs uppe till höger.' },
  delta: { title: 'Δ – hör det som tas bort', text: 'Spelar bara det de-essern sänker. Proffsens sätt att ställa en de-esser: höj Mängd tills du hör tydliga s-ljud här, och sänk om du börjar höra hela ord – då tar den för mycket. Bara i lyssningen, påverkar aldrig exporten.' },
  farg: { title: 'Färg', text: 'Polering efter EQ 2, i ljudets ordning: S-ljud (de-esser) → Mjuk topp → Stereobredd → Lim (buss-kompressor). Finns bara i Fil – Androids live-effekt har inga sådana steg.' },
  compare: { title: 'Jämför', text: 'Lyssna på Original och dina sparade versioner i samma nivå, gärna med en loop på refrängen (⟲). Blindtest blandar ordningen och döljer namnen, så att du väljer med öronen. Behåll gör vald version till din inställning.' },
  simulate: { title: 'Lyssna som', text: 'Mobil: som en telefonhögtalare (ingen bas under ~350 Hz, inget över ~7 kHz, mono). Bil: mer bas och lite mörkare topp. Hör om låten håller där folk faktiskt lyssnar. Bara i lyssningen.' },
  monoListen: { title: 'Mono', text: 'Lyssna i mono – som en telefonhögtalare, en Bluetooth-högtalare eller en klubb. Försvinner något (ofta breda syntar eller körer) är det för brett.' },
  modules: { title: 'Byt bara en del', text: 'Ta EQ, kompressor eller limiter från en annan preset – resten ligger kvar. T.ex. EQ från "Radio ljus" men kompressorn och limitern från "Mjuk kick". Knappen visar varifrån delen kom; "Byt ▾" = presettens egen. Byter du hela presetten nollställs valen. Spara kombinationen med ⋯ → Spara som.' },
  solo: { title: 'Solo (S)', text: 'Två sorters solo. S på en hel del (t.ex. EQ 1, Kompressor eller ett Snabb-reglage): bara den delens effekt hörs, resten av kedjan blir neutral. S på ett band (ett EQ-band eller ett kompressorband): bara bandets frekvensområde hörs, med allt annat i kedjan kvar – precis som solo på en riktig EQ. M på ett band tar bort bandets område. En gul ruta i grafen visar vad du lyssnar på; ✕ avslutar. Sparas aldrig.' },
  sec_postEq: { title: 'Post-EQ', text: 'EQ efter kompressionen – för klangen du vill ha till sist (glans, värme). 8 band.' },
  eq: EQ_BANDS.map((t) => ({ title: 'EQ-band', text: t })),
  sec_mbc: { title: 'Multiband-kompressor', text: 'Delar ljudet i fyra frekvensband och komprimerar dem var för sig. Så kan kicken tämjas utan att rösten påverkas, eller s-ljuden utan att basen gör det.' },
  mbcBand: MBC_BANDS.map((t) => ({ title: 'Band', text: t })),
  threshold: { title: 'Tröskel', text: 'Nivån där kompressionen börjar. Lägre (mer negativ) = mer av ljudet komprimeras.' },
  ratio: { title: 'Ratio', text: 'Hur hårt. 1:1 = ingen kompression, 2:1 = mild, 4:1 = tydlig, 10:1+ = nästan limiter.' },
  attack: { title: 'Attack', text: 'Hur snabbt kompressorn tar tag. Snabb (1–3 ms) tar udden av slag som kick; långsam (15–30 ms) låter anslaget slå igenom (mer punch).' },
  release: { title: 'Release', text: 'Hur snabbt den släpper. Kort = mer energi men kan pumpa; lång = lugnare och jämnare.' },
  knee: { title: 'Knä', text: 'Hur mjukt kompressionen börjar runt tröskeln. Större knä = mer naturligt, mindre märkbart.' },
  preGain: { title: 'Förstärkning före', text: 'Höjer eller sänker bandet innan kompressorn – mer in = mer kompression i just det bandet.' },
  postGain: { title: 'Förstärkning efter', text: 'Bandets nivå efter kompressionen (make-up). Använd för att balansera banden mot varandra.' },
  sec_limiter: { title: 'Limiter', text: 'Sista skyddet: inget får gå över taket. Tar topparna (t.ex. en hård kick) och gör låten högre utan att den klipper.' },
  limThreshold: { title: 'Tak', text: 'Högsta nivån som släpps igenom. −1 dB är säkert för streaming.' },
  limRatio: { title: 'Ratio', text: 'Hur hårt limitern tar. 10–20:1 är normalt för en limiter.' },
  limAttack: { title: 'Attack', text: 'Hur snabbt limitern tar topparna. 0,5–1 ms tar även snabba kickar.' },
  limRelease: { title: 'Release', text: 'Hur snabbt limitern släpper. Kort = högre men kan låta pumpigt; längre = lugnare.' },
  limPostGain: { title: 'Efterförstärkning', text: 'Nivån efter limitern. Lämna på 0 – använd Utgångsnivå för att nivåmatcha.' },
  sec_output: { title: 'Utgång', text: 'Nivån på det mastrade ljudet, för att nivåmatcha mot originalet.' },

  // ---- Analys ----
  spectrum: { title: 'Spektrum', text: 'Masterlab läser ljudet som spelas internt – Spotify, YouTube, Suno – utan att använda mikrofonen (Android kräver ändå behörigheten som heter "mikrofon"). Hur mycket energi låten har i varje frekvensområde just nu (staplar) och, om du valt en referens, referensens medelkurva (linje). Kurvorna jämförs på formen – inte på volymen. Analysen visar ljudet som det spelas: slå AV för att se originalet.' },
  analyze: { title: 'Analysera en låt', text: 'Tryck Starta, gå till YouTube/Suno och spela hela låten, kom tillbaka och tryck Stoppa. Masterlab lyssnar i bakgrunden under tiden. Resultatet kan sparas som referens eller jämföras med en referens.' },
  references: { title: 'Referenser', text: 'Låtar du vill att dina ska låta som. Spara en referens från live-analysen (t.ex. en låt på YouTube) eller importera en ljudfil under Fil. Referenser från filer är exaktare än live – live-analysen ser bara 8-bitars ljud och har grov upplösning under 100 Hz.' },
  verdict: { title: 'Håller låten?', text: 'Jämför din låts klang med referensens per område. Grönt = som referensen (±1,5 dB), gult = lite skillnad (mastringen rättar det), rött = stor skillnad (över 3,5 dB). "Redo" = inget område skiljer mer än 3,5 dB och topparna är lika. Över 6 dB är oftast mixen/Suno-versionen, inte mastringen.' },
  level: { title: 'Nivå', text: 'Medelnivån (RMS) under låten, i dB. Jämför inte live mot fil – de mäts olika.' },
  crest: { title: 'Toppighet', text: 'Hur mycket topparna sticker upp över medelnivån (dB). Högt = hårda kickar/transienter och mycket dynamik; lågt = hårt komprimerat. Är din låt mycket toppigare än referensen behövs mjukare kick/mer limiter.' },
  dynamics: { title: 'Dynamik', text: 'Skillnaden mellan låtens tysta och starka partier (dB, ungefär som loudness range). Lågt = jämnt och tätt.' },
  fix: { title: 'Åtgärda – 3 förslag', text: 'Appen tar fram tre förslag som rättar det som skiljer mot referensen – bara de områden som är markerade (gult/rött), inte det som redan stämmer. A Varsam: halva skillnaden, bara EQ. B Balanserad: tre fjärdedelar + s-ljud, mjuk topp och dynamik där analysen pekar på det. C Kraftig: hela skillnaden. Växla mellan Före, A, B och C medan låten spelar och lyssna – välj med örat, inte med siffrorna. Behåll sparar förslaget som preset. Områden som inte går att jämföra (t.ex. Luft när referensen spelats i låg kvalitet) rörs inte.' },
  matchLive: { title: 'Matcha EQ live', text: 'Gör en ny preset där Post-EQ:n justeras mot referensens klang (70 % av skillnaden, högst ±6 dB). Lyssna och finjustera.' },

  // ---- Fil ----
  fileTarget: { title: 'Mål', text: 'Streaming: −14 LUFS, −1 dBTP – det Spotify/YouTube normaliserar till, bäst dynamik. Hög: −10 LUFS för tätare modern pop/EDM. Eget: du ställer Drive själv.' },
  diagnos: { title: 'Behöver låten mastras?', text: 'Appen jämför originalet med vad en färdig master brukar ha: nivå (nära −14 LUFS?), toppar (under −1 dBTP?), dynamik (redan komprimerad?), klang (resonanser, hårdhet, skimmer), bas (stereobred?) och slut (tvärt?). Suno-låtar kommer ofta ut som en färdig, polerad mix – då ska man röra den så lite som möjligt, och skillnaden efter mastring blir liten. Det är normalt och betyder att låten redan låter bra. Förvalet i ✨ Auto följer diagnosen.' },
  fadeIn: { title: 'Fade in', text: 'Tonar in början av den exporterade filen (mjuk kurva). En kort fade (50–200 ms) tar bort klick eller brus precis i starten. 0 = av. Gäller filen efter Rendera – inte direktlyssningen.' },
  fadeOut: { title: 'Fade ut', text: 'Tonar ut slutet av den exporterade filen. Bra när en Suno-låt slutar tvärt eller har brus/efterklang i svansen: 2–6 s brukar låta naturligt. 0 = av. Gäller filen efter Rendera – inte direktlyssningen.' },
  monoBass: { title: 'Bas i mono', text: 'Gör allt under vald frekvens mono (samma i vänster och höger). Proffs gör nästan alltid så med basen – runt 80–120 Hz: kick och bas blir stabila och centrerade, låter lika i mono, på klubb och i telefon, och ingen bas försvinner i fasproblem. Mer än ca 150 Hz börjar ta bredd från gitarrer och pads. 0 = av.' },
  trim: { title: 'In', text: 'Hur hårt låten driver EQ och kompressor. Appen lägger först låten på −14 LUFS (samma nivå som Live får från en strömningstjänst), så att presetten låter likadant oavsett om låten är tyst eller hög. In är presettens extra lyft ovanpå det – samma värde som In i Live. Slutnivån sätts av målet. Med målet Egen görs ingen nivåanpassning.' },
  matchEq: { title: 'Match-EQ', text: 'Tio oktavband som räknas ut från skillnaden mot vald referens. Tryck "Matcha klang" för att räkna om; varje band kan justeras och nollställas.' },
  matchAmount: { title: 'Hur mycket att matcha', text: 'Hur stor del av skillnaden mot referensen som rättas. 70 % brukar låta naturligt; 100 % kan bli överdrivet.' },
  kickPunch: { title: 'Kick-anslag', text: 'Transient shaper på kickbandet. Åt vänster mjukar upp anslaget (hård, klickig kick blir rundare), åt höger ger mer slag.' },
  width: { title: 'Stereobredd', text: '100 % = oförändrat. Mer = bredare (sidorna starkare), mindre = smalare. Över 130 % kan låta konstigt i mono.' },
  sec_glue: { title: 'Lim (buss-kompressor)', text: 'Mild kompression på hela mixen som håller ihop den. Långsam attack (20–30 ms) och 1,5–2:1 räcker.' },
  glueThreshold: { title: 'Tröskel', text: 'Var limmet börjar arbeta. Sikta på 1–3 dB förstärkningsminskning.' },
  glueRatio: { title: 'Ratio', text: '1 = av. 1,5–2:1 är typiskt lim.' },
  glueAttack: { title: 'Attack', text: 'Långsam (20–30 ms) låter slagen gå igenom.' },
  glueRelease: { title: 'Release', text: '100–300 ms brukar följa musiken.' },
  glueMakeup: { title: 'Make-up', text: 'Höjer efter limmet. Behövs sällan – målet sköter nivån.' },
  clip: { title: 'Soft clip', text: 'Rundar av de högsta topparna mjukt innan limitern, så att limitern arbetar mindre och låter renare. 0 = av, 1–3 dB = normalt, mer = hörbar distorsion.' },
  ceiling: { title: 'Tak (true peak)', text: 'Högsta tillåtna nivå, mätt även mellan samplen (true peak). −1 dBTP är kravet för de flesta streamingtjänster.' },
  fileLimRelease: { title: 'Limiterns release', text: 'Hur snabbt limitern släpper. 50–100 ms är normalt.' },
  drive: { title: 'Drive', text: 'Förstärkningen in i clipper och limiter. Räknas ut automatiskt mot målet; med "Eget" ställer du den själv.' },
  output: { title: 'Utgång', text: 'Slutnivån efter limitern (kan bara sänkas, så att taket hålls).' },
  meters: { title: 'Mätare', text: 'Integrerad loudness (LUFS, hela låten enligt EBU R128), högsta short-term (3 s), true peak (dBTP, även mellan samplen), loudness range (LU, dynamik) och hur mycket limitern som mest sänkte (dB). I grafen (Mätare) visas nedtryckningen per del: just nu medan låten spelar, annars den största under hela låten. Röd = mer än en mastring brukar ha – riktvärden i snitt: kompressor 1–4 dB, lim 1–2 dB, limiter högst 2–3 dB. Toppar under en låt får vara högre än snittet.' },
  ab: { title: 'A/B', text: 'Växla mellan original och mastrad under uppspelning. Med "Nivåmatchad" spelas originalet lika högt som den mastrade – då hör du klangskillnaden, inte volymen.' },
  export: { title: 'Exportera', text: 'WAV med dither. 24 bit för distribution (DistroKid m.fl. tar emot det), 16 bit för CD-format. 44,1 kHz är standard för musik, 48 kHz för video.' },
  fileDeEss: { title: 'S-ljud (de-esser)', text: 'Sänker vassa s-, t- och sch-ljud (5–10 kHz) bara när de sticker ut jämfört med resten – rösten i övrigt rörs inte. 20–40 % räcker oftast.' },
  fileGlitter: { title: 'Mjuk topp', text: 'Tar udden av fräs och "glitter" över 11 kHz (vanligt i AI-genererad musik): sänker toppen dynamiskt när den sticker ut och lite fast. 20–40 % brukar räcka.' },
  mono: { title: 'Mono och fas', text: 'Många lyssnar i mono: telefonhögtalare, Bluetooth-högtalare, klubbar. Korrelation 1 = mono, 0 = brett, under 0 = fasproblem (ljud tar ut varandra). Förlust i mono = hur mycket svagare det blir. Basen bör vara nästan mono (korrelation över 0,7).' },
  realtime: { title: 'Direktlyssning', text: 'Låten spelas genom samma mastringskedja i realtid, så varje ändring hörs direkt. Mätare, spektrum och exportfil räknas om först när du trycker Rendera.' },
  versions: { title: 'Versioner', text: 'Spara upp till sex inställningar (A, B, C …) och växla mellan dem medan låten spelar – det snabbaste sättet att välja den bästa. Versionerna sparas på telefonen.' },
  album: { title: 'Album', text: 'Mastrar flera låtar med exakt samma inställning och mål, så att de låter lika högt och hör ihop. Varje låt exporteras som egen WAV. Nivåskillnaden mellan låtarna visas efteråt (under 1 LU är bra).' },
  liveVsFile: { title: 'Live och fil låter inte exakt lika', text: 'Live använder Androids inbyggda DSP; filmastringen har en egen kedja (Linkwitz-Riley-multiband, soft clipper, true-peak-limiter med lookahead). Samma preset ger samma riktning men inte exakt samma ljud.' },
};

/** Info för ett reglage från dess sökväg (t.ex. "mbc.2.attack" → attack, "postEq.6.gain" → EQ-band 6). */
export function infoFor(key) {
  if (!key) return null;
  const mb = key.match(/^mbcBand(\d)$/);
  if (mb) return INFO.mbcBand[Number(mb[1])];
  const m = key.match(/^(preEq|postEq)\.(\d)\.gain$/);
  if (m) return INFO.eq[Number(m[2])];
  const b = key.match(/^mbc\.\d\.(\w+)$/);
  if (b) return INFO[b[1]];
  const l = key.match(/^limiter\.(\w+)$/);
  if (l) return INFO[{ threshold: 'limThreshold', ratio: 'limRatio', attack: 'limAttack', release: 'limRelease', postGain: 'limPostGain' }[l[1]]];
  const g = key.match(/^glue\.(\w+)$/);
  if (g) return INFO[`glue${g[1][0].toUpperCase()}${g[1].slice(1)}`];
  if (/^matchEq\./.test(key)) return INFO.matchEq;
  if (key === 'limRelease') return INFO.fileLimRelease;
  return INFO[key] || null;
}
