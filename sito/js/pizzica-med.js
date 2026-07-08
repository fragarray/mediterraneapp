/* Estate Mediterranea – configurazione italiana */
initEstateMediterranea({
  lang: 'it',
  otherLangHref: 'pizzica-med-en.html',
  days: ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],
  monthsFull: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  timeLabel: 'ore 19:30',
  s: {
    loading:          'Caricamento serate disponibili…',
    loadError:        'Impossibile caricare le serate. Riprova più tardi.',
    noEvents:         'Nessuna serata disponibile al momento. Torna presto!',
    formInvalid:      'Controlla i campi evidenziati.',
    submitLabel:      'Procedi al pagamento',
    successText:      n => n === 1
      ? 'La tua prenotazione per 1 posto è stata confermata. Ti aspettiamo!'
      : `La tua prenotazione per ${n} posti è stata confermata. Vi aspettiamo!`,
    payment: {
      loading:        'Caricamento sistema di pagamento…',
      missingConfig:  'Sistema di pagamento non configurato. Contatta l\'organizzatore.',
      loadError:      'Impossibile caricare il sistema di pagamento. Riprova.',
      processing:     'Elaborazione pagamento…',
      serverError:    'Pagamento ricevuto, ma si è verificato un errore. Contatta l\'organizzatore citando il tuo ordine PayPal.',
      paypalError:    'Si è verificato un errore con PayPal. Riprova.',
      cancelled:      'Pagamento annullato. Puoi riprovare quando vuoi.',
      expired:        'Tempo scaduto. Ricomincia la prenotazione.',
      seatSingular:   'posto',
      seatPlural:     'posti',
    },
  },
});

