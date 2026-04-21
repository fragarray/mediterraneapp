initRegistrationPage({
  otherLangButtonId: 'langItBtn',
  otherLangPage: 'registration.html',
  legacy: {
    appBarTitle: 'Confirm old membership card',
    documentTitle: 'Confirm old membership card \u2013 Mediterranea',
    introTitle: 'Legacy Membership Digitisation',
    introDesc: membershipNumber =>
      `You are digitising paper membership card n\u00B0 ${membershipNumber} you already hold. The request will be placed in a pending queue and the admin must approve it before it is saved to the member database.`,
    introTesseraNote: 'The membership number remains fixed and will be verified by the admin.',
    membershipHelper: 'Historic membership number requested by the user',
  },
  messages: {
    invalidFields: 'Please check the highlighted fields.',
    privacyRequired: 'You must accept the privacy policy to proceed.',
    signatureRequired: 'The electronic signature is required.',
    signatureBlobError: 'Unable to generate the signature PNG file.',
    loadingLabel: 'Sending...',
    submitLabel: 'Submit request',
    submitError: 'An error occurred while submitting.',
    submitted: 'Request submitted successfully. The membership number will be assigned during admin approval.',
    legacySubmitted: membershipNumber =>
      `Request placed in the pending queue for digitisation of membership card ${membershipNumber}. The admin will validate it before final saving.`,
    defaultMembershipValue: 'Assigned after approval',
    phoneLabel: 'phone number',
    emailLabel: 'email address',
    optOutDialog: labelField =>
      `Without a ${labelField} you won't be able to receive updates and newsletters about Mediterranea events. Do you still want to proceed?`,
  },
});
