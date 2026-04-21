initRegistrationPage({
  otherLangButtonId: 'langEnBtn',
  otherLangPage: 'registration-en.html',
  legacy: {
    appBarTitle: 'Conferma vecchia tessera',
    documentTitle: 'Conferma vecchia tessera \u2013 Mediterranea',
    introTitle: 'Digitalizzazione vecchia tessera',
    introDesc: membershipNumber =>
      `Stai digitalizzando la tessera cartacea n\u00B0 ${membershipNumber} gi\u00E0 in tuo possesso. La richiesta verr\u00E0 inviata in una coda pending e l'admin dovr\u00E0 approvarla prima del salvataggio nel database soci.`,
    introTesseraNote: 'Il numero tessera rimane fisso e viene verificato dall\'admin.',
    membershipHelper: 'Numero tessera storico richiesto dall\'utente',
  },
  messages: {
    invalidFields: 'Controlla i campi evidenziati.',
    privacyRequired: 'Devi accettare la privacy per proseguire.',
    signatureRequired: 'La firma elettronica \u00E8 obbligatoria.',
    signatureBlobError: 'Impossibile generare il file PNG della firma.',
    loadingLabel: 'Invio in corso...',
    submitLabel: 'Invia richiesta',
    submitError: 'Errore durante l\'invio.',
    submitted: 'Richiesta inviata correttamente. Il numero tessera verr\u00E0 assegnato in fase di approvazione admin.',
    legacySubmitted: membershipNumber =>
      `Richiesta inviata in pending per la digitalizzazione della tessera ${membershipNumber}. Sar\u00E0 validata dall'admin prima del salvataggio definitivo.`,
    defaultMembershipValue: 'Assegnato dopo approvazione',
    phoneLabel: 'numero di telefono',
    emailLabel: 'indirizzo email',
    optOutDialog: labelField =>
      `Senza ${labelField} non potrai ricevere aggiornamenti e newsletter riguardo gli eventi di Mediterranea. Vuoi proseguire ugualmente?`,
  },
});
