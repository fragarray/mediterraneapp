# Editor corsi Mediterranea

Questa cartella è autonoma e non modifica i file esistenti del sito.

## Uso

Apri `index.html` nel browser. Configura il corso e premi `Genera pacchetto`. Il browser scaricherà i file singolarmente con il percorso incorporato nel nome del file.

Per un corso con slug `marketing` vengono generati:

- `marketing.html` e `marketing-en.html`;
- `admin-marketing.html`;
- JavaScript pubblico e admin;
- CSS pubblico e admin;
- API SumUp checkout e verifica;
- `sql_create_marketing_course.sql`;
- `config.json` e `README.md`.

## Installazione del corso generato

1. Esegui il file SQL nella dashboard SQL di Supabase.
2. Copia i file HTML nella root di `sito/`.
3. Copia i file JavaScript in `sito/js/`.
4. Copia i file CSS in `sito/css/`.
5. Copia le API in `api/`.
6. Mantieni le variabili Vercel già usate da Pizzica: `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
7. Apri l’admin generato e verifica login, sessioni, prenotazioni ed export.

Le tabelle vengono create con prefisso dello slug: `<slug>_eventi`, `<slug>_prenotazioni`, `<slug>_settings`. Pizzica resta sulle proprie tabelle.

## Nota sicurezza

Il prezzo del checkout viene ricalcolato dall’API usando la sessione Supabase. Prima della pubblicazione verifica le policy RLS generate e limita le policy admin agli utenti autorizzati del tuo progetto.
