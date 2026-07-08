/* Estate Mediterranea – English configuration */
initEstateMediterranea({
  lang: 'en',
  otherLangHref: 'pizzica-med.html',
  days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  monthsFull: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  timeLabel: '7:30 PM',
  s: {
    loading:          'Loading available evenings…',
    loadError:        'Unable to load events. Please try again later.',
    noEvents:         'No evenings available at the moment. Check back soon!',
    formInvalid:      'Please check the highlighted fields.',
    submitLabel:      'Proceed to payment',
    successText:      n => n === 1
      ? 'Your booking for 1 seat has been confirmed. See you there!'
      : `Your booking for ${n} seats has been confirmed. See you there!`,
    payment: {
      loading:        'Loading payment system…',
      missingConfig:  'Payment system not configured. Please contact the organiser.',
      loadError:      'Unable to load payment system. Please try again.',
      processing:     'Processing payment…',
      serverError:    'Payment received, but an error occurred. Please contact the organiser quoting your PayPal order.',
      paypalError:    'A PayPal error occurred. Please try again.',
      cancelled:      'Payment cancelled. You can try again whenever you\'re ready.',
      expired:        'Time expired. Please start your booking again.',
      seatSingular:   'seat',
      seatPlural:     'seats',
    },
  },
});

