import 'package:flutter/material.dart';
import 'package:signature/signature.dart';

import '../models/member_model.dart';
import '../services/supabase_service.dart';

class RegistrationPage extends StatefulWidget {
  const RegistrationPage({super.key, required this.supabaseConfigured});

  final bool supabaseConfigured;

  @override
  State<RegistrationPage> createState() => _RegistrationPageState();
}

class _RegistrationPageState extends State<RegistrationPage> {
  final _formKey = GlobalKey<FormState>();
  final _nomeController = TextEditingController();
  final _cognomeController = TextEditingController();
  final _emailController = TextEditingController();
  final _telefonoController = TextEditingController();
  final _codiceFiscaleController = TextEditingController();
  final SignatureController _signatureController = SignatureController(
    penStrokeWidth: 2.5,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
  );

  bool _privacyAccepted = false;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nomeController.dispose();
    _cognomeController.dispose();
    _emailController.dispose();
    _telefonoController.dispose();
    _codiceFiscaleController.dispose();
    _signatureController.dispose();
    super.dispose();
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (!_privacyAccepted) {
      _showMessage('Devi accettare la privacy per proseguire.', isError: true);
      return;
    }

    if (_signatureController.isEmpty) {
      _showMessage('La firma elettronica è obbligatoria.', isError: true);
      return;
    }

    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase prima di usare il form.', isError: true);
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final signatureBytes = await _signatureController.toPngBytes();

      if (signatureBytes == null || signatureBytes.isEmpty) {
        throw StateError('Impossibile generare il file PNG della firma.');
      }

      final member = MemberModel(
        nome: _nomeController.text.trim(),
        cognome: _cognomeController.text.trim(),
        email: _emailController.text.trim().toLowerCase(),
        telefono: _telefonoController.text.trim(),
        codiceFiscale: _codiceFiscaleController.text.trim().toUpperCase(),
        firmaUrl: '',
        privacyAccepted: _privacyAccepted,
      );

      await SupabaseService.instance.submitRegistration(
        member: member,
        signatureBytes: signatureBytes,
      );

      _formKey.currentState!.reset();
      _nomeController.clear();
      _cognomeController.clear();
      _emailController.clear();
      _telefonoController.clear();
      _codiceFiscaleController.clear();
      _signatureController.clear();

      if (mounted) {
        setState(() {
          _privacyAccepted = false;
        });
      }

      _showMessage('Richiesta inviata correttamente');
    } catch (error, stackTrace) {
      debugPrint('[RegistrationPage] submitRegistration error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  String? _validateRequired(String? value, String label) {
    if (value == null || value.trim().isEmpty) {
      return '$label obbligatorio';
    }
    return null;
  }

  String? _validateEmail(String? value) {
    final requiredMessage = _validateRequired(value, 'Email');
    if (requiredMessage != null) {
      return requiredMessage;
    }

    final email = value!.trim();
    const pattern = r'^[\w\-.]+@([\w-]+\.)+[\w-]{2,4}$';
    if (!RegExp(pattern).hasMatch(email)) {
      return 'Inserisci un indirizzo email valido';
    }

    return null;
  }

  String? _validatePhone(String? value) {
    final requiredMessage = _validateRequired(value, 'Telefono');
    if (requiredMessage != null) {
      return requiredMessage;
    }

    final sanitized = value!.replaceAll(' ', '');
    if (!RegExp(r'^[+0-9]{8,15}$').hasMatch(sanitized)) {
      return 'Inserisci un numero di telefono valido';
    }

    return null;
  }

  String? _validateCodiceFiscale(String? value) {
    final requiredMessage = _validateRequired(value, 'Codice fiscale');
    if (requiredMessage != null) {
      return requiredMessage;
    }

    if (!RegExp(r'^[A-Za-z0-9]{16}$').hasMatch(value!.trim())) {
      return 'Il codice fiscale deve avere 16 caratteri';
    }

    return null;
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) {
      return;
    }

    final primaryColor = Theme.of(context).colorScheme.primary;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : primaryColor,
      ),
    );
  }

  String _formatError(Object error) {
    return error
        .toString()
        .replaceFirst('Exception: ', '')
        .replaceFirst('StateError: ', '');
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.sizeOf(context).width >= 960;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tesseramento Mediterranea'),
        actions: <Widget>[
          TextButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/admin'),
            icon: const Icon(Icons.admin_panel_settings_outlined),
            label: const Text('Admin'),
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.symmetric(
          horizontal: isDesktop ? 32 : 16,
          vertical: 24,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1180),
            child: Column(
              children: <Widget>[
                _buildLogoHeader(isDesktop: isDesktop),
                isDesktop
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Expanded(child: _buildIntroCard()),
                          const SizedBox(width: 24),
                          Expanded(flex: 2, child: _buildFormCard()),
                        ],
                      )
                    : Column(
                        children: <Widget>[
                          _buildIntroCard(),
                          const SizedBox(height: 16),
                          _buildFormCard(),
                        ],
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogoHeader({required bool isDesktop}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isDesktop ? 20 : 14),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Image.asset(
          'logopiccolo.png',
          height: isDesktop ? 110 : 78,
          fit: BoxFit.contain,
        ),
      ),
    );
  }

  Widget _buildIntroCard() {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const <Widget>[
            Text(
              'Registrazione socio',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 12),
            Text(
              'Compila il modulo, accetta la privacy e firma digitalmente per inviare la tua richiesta di tesseramento.',
            ),
            SizedBox(height: 24),
            _InfoTile(
              icon: Icons.verified_user_outlined,
              title: 'Privacy GDPR',
              subtitle: 'Accettazione obbligatoria prima dell\'invio.',
            ),
            _InfoTile(
              icon: Icons.draw_outlined,
              title: 'Firma elettronica',
              subtitle: 'La firma viene salvata in Supabase Storage.',
            ),
            _InfoTile(
              icon: Icons.hourglass_top_outlined,
              title: 'Stato richiesta',
              subtitle: 'Ogni nuova iscrizione entra in stato pending.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFormCard() {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wideFields = constraints.maxWidth > 720;
              final fieldWidth = wideFields
                  ? (constraints.maxWidth - 16) / 2
                  : constraints.maxWidth;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (!widget.supabaseConfigured) ...<Widget>[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.amber.shade200),
                      ),
                      child: const Text(
                        'Supabase non è ancora configurato. Avvia la web app con --dart-define=SUPABASE_URL=... e --dart-define=SUPABASE_ANON_KEY=... per attivare invio e dashboard.',
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  const Text(
                    'Dati anagrafici',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 16,
                    runSpacing: 16,
                    children: <Widget>[
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          controller: _nomeController,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Nome'),
                          validator: (value) =>
                              _validateRequired(value, 'Nome'),
                        ),
                      ),
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          controller: _cognomeController,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Cognome',
                          ),
                          validator: (value) =>
                              _validateRequired(value, 'Cognome'),
                        ),
                      ),
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Email'),
                          validator: _validateEmail,
                        ),
                      ),
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          controller: _telefonoController,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Telefono',
                          ),
                          validator: _validatePhone,
                        ),
                      ),
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          controller: _codiceFiscaleController,
                          textCapitalization: TextCapitalization.characters,
                          decoration: const InputDecoration(
                            labelText: 'Codice Fiscale',
                          ),
                          validator: _validateCodiceFiscale,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Firma elettronica',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  const Text('Firma nel riquadro bianco qui sotto.'),
                  const SizedBox(height: 12),
                  Container(
                    height: 210,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Signature(
                        controller: _signatureController,
                        backgroundColor: Colors.white,
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: _signatureController.clear,
                      icon: const Icon(Icons.restart_alt_outlined),
                      label: const Text('Cancella firma'),
                    ),
                  ),
                  CheckboxListTile(
                    value: _privacyAccepted,
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    onChanged: (value) {
                      setState(() {
                        _privacyAccepted = value ?? false;
                      });
                    },
                    title: const Text(
                      'Accetto il trattamento dei dati personali ai sensi del GDPR.',
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _isSubmitting ? null : _submitRegistration,
                      icon: _isSubmitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_outlined),
                      label: Text(
                        _isSubmitting ? 'Invio in corso...' : 'Invia richiesta',
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: primaryColor.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: primaryColor),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(subtitle),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
