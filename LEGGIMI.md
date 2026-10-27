# PhantaCassandra (versione autonoma)

Questa versione funziona senza Claude e senza il tuo computer acceso. Ogni giorno, alle 9:36 e alle 15:36 (ora italiana; con l'ora legale alle 10:36 e alle 16:36), GitHub legge da solo le probabili formazioni di 8 siti e aggiorna la pagina. Tu la apri da qualsiasi telefono o computer.

## Cosa c'è nella cartella

- `docs/` contiene la pagina (`index.html`) e i dati (`data.json`, aggiornato in automatico).
- `scraper/` contiene il programma che legge i siti.
- `.github/workflows/aggiorna.yml` contiene gli orari dell'aggiornamento automatico.

## Installazione (circa 10 minuti, una volta sola)

1. **Crea un account gratuito** su https://github.com, se non ce l'hai.
2. **Crea il progetto.** In alto a destra premi **+**, poi **New repository**.
   - Nome: `phantacassandra`.
   - Scegli **Public**: con l'account gratuito la pagina web si può pubblicare solo da un progetto pubblico. Le tue rose comunque non finiscono su GitHub, restano nel tuo browser.
   - Premi **Create repository**.
3. **Carica i file.** Nella pagina del progetto premi **uploading an existing file**. Trascina dentro le cartelle `docs` e `scraper` e il file `LEGGIMI.md`, poi premi **Commit changes**.
4. **Crea il file degli orari.** La cartella `.github` è nascosta e spesso non si riesce a trascinarla, quindi la crei a mano:
   - premi **Add file**, poi **Create new file**;
   - come nome scrivi esattamente `.github/workflows/aggiorna.yml`;
   - incolla il contenuto del file `aggiorna.yml` che trovi nella cartella `.github/workflows` dello zip (aprilo con Blocco note o TextEdit);
   - premi **Commit changes**.
5. **Dai il permesso di salvare i dati.** Vai in **Settings**, poi **Actions**, poi **General**. Sotto *Workflow permissions* scegli **Read and write permissions** e premi **Save**.
6. **Pubblica la pagina.** Vai in **Settings**, poi **Pages**. Sotto *Branch* scegli `main` e la cartella `/docs`, poi premi **Save**. Dopo uno o due minuti la pagina è online all'indirizzo `https://TUONOME.github.io/phantacassandra/`.
7. **Primo aggiornamento di prova.** Vai in **Actions**, apri **Aggiorna PhantaCassandra**, premi **Run workflow** e poi di nuovo **Run workflow**. Dopo 3-5 minuti compare un segno verde. Ricarica la pagina: sotto il pulsante vedi l'ora dell'aggiornamento.

## Sul telefono

Apri l'indirizzo della pagina. Su iPhone premi Condividi e poi **Aggiungi alla schermata Home**; su Android apri il menu ⋮ e premi **Aggiungi a schermata Home**. Da quel momento si apre come un'app.

## Le rose

Le inserisci dalla pagina con **Modifica rosa**: puoi incollare le colonne da Excel oppure importare il file. Restano salvate nel browser che stai usando. Per averle anche sul telefono:

1. sul computer premi **Esporta rose** e ottieni il file `rose.json`;
2. mandalo al telefono (mail, WhatsApp o altro);
3. sul telefono apri la pagina, poi **Modifica rosa** e **Importa rose**.

In alternativa puoi caricare `rose.json` dentro la cartella `docs` del progetto: la pagina lo usa su ogni dispositivo che non ha ancora una rosa salvata. Ricorda però che il progetto è pubblico, quindi chiunque abbia il link può vedere quel file.

## Aggiornare quando vuoi

Il pulsante **Aggiorna dai siti** apre GitHub. Lì premi **Run workflow**, aspetti 3-5 minuti e ricarichi la pagina.

## Quando qualcosa non va

- **Una fonte resta grigia.** Quel sito ha cambiato grafica oppure blocca la lettura automatica. Le altre fonti continuano a funzionare. Per vedere il dettaglio apri l'ultima esecuzione in **Actions**, poi il passaggio *Leggi i siti*: ogni sito ha una riga che spiega cosa è successo. Copiala e incollala a Claude per farti correggere il lettore.
- **Nessun aggiornamento per molto tempo.** GitHub sospende gli orari automatici dei progetti fermi da 60 giorni. In quel caso compare un avviso in **Actions**: basta premere **Enable workflow**.
- **Formazioni ufficiali.** Vengono riconosciute quando Fantacalcio.it scrive "ufficiale" sulla partita. Questa regola non è ancora stata provata con una giornata vera: controllala alla prima partita.

## Fonti lette

Fantacalcio.it, Sky Sport, Gazzetta, Corriere dello Sport (stessi dati di Tuttosport, contati una volta sola), TuttoMercatoWeb (stesse formazioni di Sportitalia), SOS Fanta, Eurosport, Goal.com.

Restano escluse le fonti che vietano la raccolta automatica nei loro termini d'uso: Sportmediaset, Sofascore e FotMob.
