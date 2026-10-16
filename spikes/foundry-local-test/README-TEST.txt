FOUNDRY LOCAL TEST (til Mimer-projektet)
=========================================

Det her er IKKE Mimer. Det er et lille testprogram med sit eget navn. Det installerer ikke
noget, rører ikke Mimer fra Store (hverken program, indstillinger eller noter) og skriver kun i
mappen, du pakker det ud i. Slet mappen, og alt er væk.

Hvad testen undersøger (så vi ved, om Foundry Local kan bygges ind i Mimer):
 1. Kan motoren starte på din computer?
 2. Hvilken hardware kan den bruge: processor, grafikkort, NPU?
 3. Kan en lille model hentes og indlæses?
 4. Kan modellen kalde et værktøj (det er sådan Mimer søger i og ændrer noter)?

Sådan gør du
------------
1. Pak zip-filen ud i en NY mappe, fx på Skrivebordet (ikke i Mimers mappe og ikke i en
   mappe med dine noter). Alle filerne skal ligge sammen.
2. Dobbeltklik på foundry-local-test.exe.
   - Hvis Windows eller firmaets sikkerhed blokerer programmet ("Don't run" / "blocked"),
     så stop her og sig det. Så skal testen køres et andet sted. Prøv ikke at omgå
     blokeringen.
3. Vent. Første gang hentes motorens hardware-dele og en lille model (ca. 600 MB). Det kan
   tage nogle minutter. Programmet skriver, hvad det gør.
4. Når det spørger, kan du skrive et andet modelnavn for at prøve flere (fx phi-4-mini
   eller qwen3-4b), eller bare trykke Enter for at afslutte.
5. Send filen foundry-test-report.txt (ligger i samme mappe) til udvikleren. Den indeholder
   kun tekniske oplysninger om testen: ingen noter, ingen kodeord.

Hvilken version skal jeg bruge?
-------------------------------
 - foundry-local-test-x64    til almindelige Intel- eller AMD-computere.
 - foundry-local-test-arm64  til computere med Snapdragon (ARM).
Ved du det ikke: åbn Indstillinger > System > Om, og se "Systemtype".

Krav: Windows 11 version 24H2 eller nyere. Internetadgang (til motorens dele og modellen).
