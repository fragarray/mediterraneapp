# Editor corsi Mediterranea

Questa cartella è autonoma e non modifica i file esistenti del sito.

## Uso

Apri `index.html` nel browser. Configura il corso e premi `Genera pacchetto`, poi premi `Scarica ZIP`. L’archivio contiene una cartella radice con lo slug del corso, ad esempio `marketing/`.

Per un corso con slug `marketing` vengono generati:

- `index.html` e `en.html`;
- `admin.html`;
- JavaScript pubblico e admin;
- CSS pubblico e admin;
- API SumUp checkout e verifica;
- `sql/create_marketing_course.sql`;
- `config.json` e `README.md`.

## Installazione del corso generato

1. Estrai la cartella dello ZIP dentro `sito/`. Otterrai `sito/marketing/`, raggiungibile da `www.miosito.it/marketing/`.
2. La cartella contiene le pagine, gli asset, l’admin dedicato, il SQL e le API del corso.
3. Le API Vercel non vengono eseguite dentro una cartella pubblica `sito/marketing/api/`: copia i due file API generati nella cartella API radice del progetto (`api/`). È l’unico passaggio esterno alla cartella del corso.
4. Apri `sito/marketing/sql/create_marketing_course.sql` nell’SQL Editor di Supabase, copia tutto il contenuto e premi **Run**. In alternativa usa il pannello SQL dell’editor e il pulsante `Copia SQL`.
5. Il file SQL **non va caricato sul sito di hosting**: serve esclusivamente a creare le tabelle nel database.
6. Mantieni le variabili Vercel già usate da Pizzica: `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
7. Per rimuovere il corso, elimina `sito/marketing/`, le due API dalla cartella `api/` e, se vuoi eliminare anche i dati, esegui le istruzioni `DROP TABLE` documentate nello SQL.

Le tabelle vengono create con prefisso dello slug: `<slug>_eventi`, `<slug>_prenotazioni`, `<slug>_settings`. Pizzica resta sulle proprie tabelle.

## Nota sicurezza

Il prezzo del checkout viene ricalcolato dall’API usando la sessione Supabase. Prima della pubblicazione verifica le policy RLS generate e limita le policy admin agli utenti autorizzati del tuo progetto.
