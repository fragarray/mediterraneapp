/* Estate Mediterranea – English configuration */
initEstateMediterranea({
  lang: 'en',
  otherLangHref: 'estate-mediterranea.html',
  days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  monthsFull: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  timeLabel: '7:30 PM',
  s: {
    loading:          'Loading available evenings…',
    loadError:        'Unable to load events. Please try again later.',
    noEvents:         'No evenings available at the moment. Check back soon!',
    formInvalid:      'Please check the highlighted fields.',
    submitLabel:      'Book now',
    submittingLabel:  'Booking…',
    submitError:      'Booking failed. Please try again.',
    successText:      n => n === 1 ? 'Your booking for 1 seat has been confirmed. See you there!' : `Your booking for ${n} seats has been confirmed. See you there!`,
  },
});
