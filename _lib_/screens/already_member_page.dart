import 'package:flutter/material.dart';

import '../services/supabase_service.dart';

class AlreadyMemberPage extends StatefulWidget {
  const AlreadyMemberPage({super.key, required this.supabaseConfigured});

  final bool supabaseConfigured;

  @override
  State<AlreadyMemberPage> createState() => _AlreadyMemberPageState();
}

class _AlreadyMemberPageState extends State<AlreadyMemberPage> {
  final _formKey = GlobalKey<FormState>();
  final _membershipController = TextEditingController();
  bool _isChecking = false;

  @override
  void dispose() {
    _membershipController.dispose();
    super.dispose();
  }

  Future<void> _continueWithCardNumber() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase prima di usare questa funzione.', isError: true);
      return;
    }

    final membershipNumber = int.parse(_membershipController.text.trim());

    setState(() {
      _isChecking = true;
    });

    try {
      final isEligible = await SupabaseService.instance
          .canRequestLegacyMembershipNumber(membershipNumber);

      if (!isEligible) {
        _showMessage(
          'Numero non valido per il recupero: deve essere inferiore al numero iniziale e non presente tra i soci attivi.',
          isError: true,
        );
        return;
      }

      if (!mounted) {
        return;
      }

      Navigator.pushNamed(
        context,
        '/registration',
        arguments: membershipNumber.toString(),
      );
    } catch (error) {
      _showMessage(
        error.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isChecking = false;
        });
      }
    }
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ho gia la tessera!')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Card(
            elevation: 0,
            margin: const EdgeInsets.all(16),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'Recupero vecchia tessera',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Inserisci il numero della tessera cartacea gia in tuo possesso. Se valido, potrai compilare la registrazione mantenendo lo stesso numero.',
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _membershipController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Numero tessera',
                        hintText: 'es. 845',
                        prefixIcon: Icon(Icons.confirmation_number_outlined),
                      ),
                      validator: (value) {
                        final raw = (value ?? '').trim();
                        if (raw.isEmpty) {
                          return 'Numero tessera obbligatorio';
                        }
                        final number = int.tryParse(raw);
                        if (number == null || number <= 0) {
                          return 'Inserisci un numero valido maggiore di zero';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isChecking ? null : _continueWithCardNumber,
                        icon: _isChecking
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.arrow_forward_outlined),
                        label: Text(
                          _isChecking
                              ? 'Verifica in corso...'
                              : 'Continua con questo numero',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
