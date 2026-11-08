# Saldo

Versione autonoma di Saldo, in italiano. Include panoramica, movimenti, conti, patrimonio, analisi, dati di esempio ed esportazione CSV.

## Pubblicare su GitHub Pages

1. Estrai lo ZIP. Carica il contenuto della cartella `saldo-github` nella radice di un nuovo repository GitHub.
2. Apri **Settings → Pages**. Seleziona **Deploy from a branch**, ramo **main**, cartella **/docs**, quindi **Save**. L’indirizzo compare nella stessa pagina dopo la pubblicazione.
3. Per verificare il funzionamento puoi aprire **Esplora con esempi**.

La cartella `docs` contiene già la build. Il codice della versione pubblicata è accessibile ai visitatori. Gli importi personali vengono salvati nel browser per quel sito e sono separati su ogni browser o dispositivo. Usa lo stesso indirizzo e profilo del browser per ritrovare i tuoi dati. Cancellare i dati del sito elimina il registro locale. Puoi esportare movimenti e saldi da **Impostazioni → I tuoi dati**. L’archivio parte vuoto. I dati della precedente app su ChatGPT Sites vanno reinseriti manualmente.

## Modificare il codice

Con Node.js 22.12+ o 24:

```sh
npm install
npm run dev
npm run build
```

Il codice è in `src`. Dopo ogni modifica, aggiorna anche `docs` nel repository. Se la build rimuove `docs/.nojekyll`, ricrea il file vuoto prima di pubblicare.
