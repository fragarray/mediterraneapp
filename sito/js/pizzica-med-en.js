/* Estate Mediterranea – English configuration */
initEstateMediterranea({
  lang: 'en',
  otherLangHref: 'pizzica-med.html',
  days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  monthsFull: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  timeLabel: '7:30 PM',
  s: {
    loading:     'Loading available evenings…',
    loadError:   'Unable to load events. Please try again later.',
    noEvents:    'No evenings available at the moment. Check back soon!',
    formInvalid: 'Please check the highlighted fields.',
    submitLabel: 'Proceed to payment',
    successText: n => n === 1
      ? 'Your booking for 1 seat has been confirmed. See you there!'
      : `Your booking for ${n} seats has been confirmed. See you there!`,
    payment: {
      payNow:          'Pay with SumUp',
      creating:        'Preparing payment…',
      createError:     'Could not create payment. Please try again.',
      verifying:       'Verifying payment…',
      verifyError:     'Unable to verify payment. Please contact the organiser.',
      paymentFailed:   'Payment failed. You can try again whenever you\'re ready.',
      paymentExpired:  'Payment time expired. Please restart your booking.',
      paymentPending:  'Payment pending confirmation. Please try again in a moment.',
    },
  },
});

