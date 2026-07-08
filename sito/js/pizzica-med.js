/* Estate Mediterranea – configurazione italiana */
initEstateMediterranea({
  lang: 'it',
  otherLangHref: 'pizzica-med-en.html',
  days: ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],
  monthsFull: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  timeLabel: 'ore 19:30',
  s: {
    loading:     'Caricamento serate disponibili…',
    loadError:   'Impossibile caricare le serate. Riprova più tardi.',
    noEvents:    'Nessuna serata disponibile al momento. Torna presto!',
    formInvalid: 'Controlla i campi evidenziati.',
    submitLabel: 'Procedi al pagamento',
    successText: n => n === 1
      ? 'La tua prenotazione per 1 posto è stata confermata. Ti aspettiamo!'
      : `La tua prenotazione per ${n} posti è stata confermata. Vi aspettiamo!`,
    payment: {
      payNow:          'Paga con SumUp',
      creating:        'Preparazione pagamento…',
      createError:     'Errore nella creazione del pagamento. Riprova.',
      verifying:       'Verifica pagamento in corso…',
      verifyError:     'Impossibile verificare il pagamento. Contatta l\'organizzatore.',
      paymentFailed:   'Pagamento non riuscito. Puoi riprovare quando vuoi.',
      paymentExpired:  'Il tempo per il pagamento è scaduto. Riprova la prenotazione.',
      paymentPending:  'Pagamento in attesa di conferma. Riprova tra qualche istante.',
    },
  },
});

