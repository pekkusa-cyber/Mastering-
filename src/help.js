// Hjälptexter (ⓘ) per vy. Uppdatera texten för vyn samtidigt som funktionen ändras (se CLAUDE.md).
export const HELP = {
  live: {
    title: 'Live – testläge (fas 1)',
    html: `
      <p>Live-läget lägger Androids inbyggda ljudeffekt <b>DynamicsProcessing</b> på ljudet från andra appar
      (Suno-appen, Suno i Chrome, YouTube) medan du lyssnar. Det här är en prototyp som bara ska visa
      <b>om det går</b> på din telefon.</p>
      <p><b>Testläget</b> höjer ingången +6 dB och lägger en limiter med tak −20 dB. Det ska låta tydligt
      platt, tystare och hårt "klämt" när det är PÅ. Hör du ingen skillnad alls kopplades effekten inte på.</p>
      <h3>Så testar du</h3>
      <ol>
        <li>Tryck <b>Starta live-motorn</b>. En notis visas så länge den är igång.</li>
        <li>Spela en låt i Suno (app eller Chrome).</li>
        <li>Slå testläget på och av – med den stora knappen här eller med <b>Slå på/Slå av</b> i notisen
        (då slipper du byta app).</li>
        <li>Titta i listan <b>Hittade ljud-sessioner</b>: där syns vilken app som hittades och om effekten kopplades på.</li>
        <li>Tryck <b>Kopiera felsökningsrapport</b> och klistra in den i chatten med Claude.</li>
      </ol>
      <h3>Hur andra appars ljud hittas</h3>
      <ul>
        <li><b>Broadcast</b>: vissa spelare talar själva om sin ljud-session. Suno och Chrome gör det troligen inte.</li>
        <li><b>Sessionsdetektering (dumpsys)</b>: kräver en behörighet som bara kan ges via ADB från en dator,
        en gång (samma som Wavelet ber om). Se guiden i kortet nedan.</li>
        <li><b>Global session (0)</b>: gammalt sätt att påverka allt ljud. Spärrat på många nya telefoner – prova och se.</li>
      </ul>
      <p>Använder du Wavelet samtidigt kan de två apparna slåss om samma ljud. Stäng av Wavelet när du testar.</p>`,
  },
};
