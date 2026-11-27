# Presets – mätning på riktiga låtar

Mätt med appens egen filkedja på fyra Suno-låtar (dub-reggae, country rock, hiphop/trap, rockabilly; 45 s ur varje),
alla renderade till −14 LUFS. **Klangändring** = hur mycket klangbalansen ändras jämfört med ingen bearbetning (RMS över
banden 60 Hz–16 kHz, dB). **Kompression** = genomsnittlig nedtryckning i de fyra banden (kalibrerat mål).

| Preset | Klangändring före | Klangändring nu | Kompression (kick/mitt/närvaro/luft) | Bredd (sida/mitt dB) |
|---|---|---|---|---|
| Suno-fix | 1,8 | 2,2 | 1,5 / 1,0 / 2,5 / 1,9 | +0,3 |
| Transparent | 0,2 | 0,2 | 0,5 / 0,5 / 0,5 / 0,4 | +0,3 |
| Mjuk kick | 0,9 | 1,0 | 3,0 / 1,1 / 0,0 / 0,0 | +1,4 |
| Radio ljus | 0,7 | 1,0 | 2,0 / 2,0 / 2,0 / 1,9 | +1,6 |
| Silkeslen röst | 1,1 | 2,7 | 0,5 / 1,0 / 3,0 / 1,4 | -0,3 |
| Varm lim | 0,8 | 1,8 | 2,0 / 2,0 / 2,0 / 1,9 | +0,3 |
| Bas varm | 0,9 | 0,8 | 2,4 / 0,6 / 0,0 / 0,0 | -0,6 |
| Tät pop | 1,1 | 0,8 | 3,0 / 3,0 / 3,0 / 2,9 | +1,7 |
| Hiphop punch | 0,7 | 0,9 | 1,9 / 1,6 / 0,5 / 0,0 | -0,9 |
| Trap 808 | 0,4 | 0,9 | 3,0 / 1,0 / 0,5 / 1,9 | +1,0 |
| EDM högt | 1,1 | 1,1 | 4,0 / 3,5 / 3,0 / 2,9 | +1,9 |
| R&B silke | 0,8 | 1,5 | 1,5 / 1,5 / 2,5 / 1,4 | +0,1 |
| Reggae/dub | – | 1,2 | 2,0 / 1,0 / 1,5 / 0,4 | +0,0 |
| Reggaeton/afro | 0,7 | 0,7 | 2,0 / 1,0 / 2,0 / 0,4 | +0,3 |
| Rock | 1,3 | 1,5 | 2,0 / 2,5 / 1,0 / 0,4 | +1,3 |
| Metal tight | 1,2 | 1,5 | 3,0 / 2,5 / 2,0 / 0,4 | +1,3 |
| Country/americana | – | 1,1 | 1,5 / 2,0 / 1,5 / 0,8 | +1,6 |
| Schlager/dansband | 1,0 | 1,2 | 2,5 / 2,5 / 2,5 / 2,4 | +0,9 |
| Indie luftig | 0,4 | 0,5 | 1,0 / 1,0 / 1,0 / 0,9 | +1,2 |
| Akustisk luftig | 0,5 | 0,7 | 0,7 / 0,7 / 0,7 / 0,6 | +1,5 |
| Ballad – rösten fram | 1,0 | 1,2 | 0,5 / 1,5 / 1,5 / 0,4 | +0,8 |
| Jazz naturlig | 0,1 | 0,3 | 0,3 / 0,3 / 0,3 / 0,2 | +0,6 |
| Film/orkester | 0,3 | 0,2 | 0,5 / 0,5 / 0,5 / 0,4 | +1,8 |
| Lo-fi mjuk | 2,0 | 3,4 | 2,5 / 2,5 / 2,5 / 2,4 | -2,1 |
| Nattlyssning | 1,9 | 1,7 | 6,0 / 6,0 / 6,0 / 5,9 | +0,7 |
| Hörlurar – len topp | 1,5 | 2,3 | 1,0 / 1,0 / 1,0 / 0,9 | -0,5 |
| Bilstereo | 0,7 | 1,5 | 2,5 / 2,5 / 2,5 / 2,4 | -0,7 |
| Telefonhögtalare | 1,7 | 2,5 | 3,0 / 3,0 / 3,0 / 2,9 | +0,1 |
| Gym/energi | 1,2 | 0,8 | 4,0 / 4,0 / 4,0 / 3,9 | +0,8 |
| Demo-kontroll | 0,9 | 0,9 | 0,0 / 0,0 / 0,0 / 0,0 | +0,5 |

Par av presets som i praktiken låter lika: **38 av 406 före → 29 av 465 nu** (median-skillnad 1,31 → 1,57).
De som fortfarande ligger nära varandra är medvetet varsamma (Orörd, Transparent, Jazz, Film).

Mätskripten och kalibreringen finns inte i appen – trösklarna i `src/chain.js` är resultatet.
