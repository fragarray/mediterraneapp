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
    submitLabel:      'Prenota',
    submittingLabel:  'Prenotazione in corso…',
    submitError:      'Errore durante la prenotazione. Riprova.',
    successText:      n => n === 1 ? 'La tua prenotazione per 1 posto è stata confermata. Ti aspettiamo!' : `La tua prenotazione per ${n} posti è stata confermata. Vi aspettiamo!`,
  },
});
