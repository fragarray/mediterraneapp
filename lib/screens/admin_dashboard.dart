import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/member_model.dart';
import '../services/excel_service.dart';
import '../services/supabase_service.dart';

const _associationGreen = Color(0xFF2E7D32);

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key, required this.supabaseConfigured});

  final bool supabaseConfigured;

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  final _loginFormKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _searchController = TextEditingController();
  final _nomeFilterController = TextEditingController();
  final _cognomeFilterController = TextEditingController();
  final _emailFilterController = TextEditingController();
  final _telefonoFilterController = TextEditingController();
  final _codiceFiscaleFilterController = TextEditingController();
  late final Stream<List<MemberModel>> _pendingMembersStream;
  late final Stream<List<MemberModel>> _approvedMembersStream;

  bool _isSigningIn = false;
  bool _isExporting = false;
  bool _showPassword = false;
  bool _showSearchPanel = true;
  String _selectedStatusFilter = 'all';
  String _selectedPrivacyFilter = 'all';

  Iterable<TextEditingController> get _filterControllers =>
      <TextEditingController>[
        _searchController,
        _nomeFilterController,
        _cognomeFilterController,
        _emailFilterController,
        _telefonoFilterController,
        _codiceFiscaleFilterController,
      ];

  @override
  void initState() {
    super.initState();
    _pendingMembersStream = SupabaseService.instance.watchPendingMembers();
    _approvedMembersStream = SupabaseService.instance.watchApprovedMembers();
    for (final controller in _filterControllers) {
      controller.addListener(_onSearchChanged);
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    for (final controller in _filterControllers) {
      controller
        ..removeListener(_onSearchChanged)
        ..dispose();
    }
    super.dispose();
  }

  void _onSearchChanged() {
    setState(() {});
  }

  void _clearFilters() {
    for (final controller in _filterControllers) {
      controller.clear();
    }

    setState(() {
      _selectedStatusFilter = 'all';
      _selectedPrivacyFilter = 'all';
    });
  }

  List<MemberModel> _filterMembers(List<MemberModel> members) {
    final generalQuery = _searchController.text.trim().toLowerCase();
    final nomeQuery = _nomeFilterController.text.trim().toLowerCase();
    final cognomeQuery = _cognomeFilterController.text.trim().toLowerCase();
    final emailQuery = _emailFilterController.text.trim().toLowerCase();
    final telefonoQuery = _telefonoFilterController.text.trim().toLowerCase();
    final codiceFiscaleQuery = _codiceFiscaleFilterController.text
        .trim()
        .toLowerCase();

    return members.where((member) {
      final searchable = <String>[
        member.nome,
        member.cognome,
        member.fullName,
        member.email,
        member.telefono,
        member.codiceFiscale,
        member.stato,
        member.privacyAccepted ? 'privacy accettata' : 'privacy non accettata',
        member.createdAtLabel,
        member.firmaUrl,
      ].join(' ').toLowerCase();

      if (generalQuery.isNotEmpty && !searchable.contains(generalQuery)) {
        return false;
      }
      if (nomeQuery.isNotEmpty &&
          !member.nome.toLowerCase().contains(nomeQuery)) {
        return false;
      }
      if (cognomeQuery.isNotEmpty &&
          !member.cognome.toLowerCase().contains(cognomeQuery)) {
        return false;
      }
      if (emailQuery.isNotEmpty &&
          !member.email.toLowerCase().contains(emailQuery)) {
        return false;
      }
      if (telefonoQuery.isNotEmpty &&
          !member.telefono.toLowerCase().contains(telefonoQuery)) {
        return false;
      }
      if (codiceFiscaleQuery.isNotEmpty &&
          !member.codiceFiscale.toLowerCase().contains(codiceFiscaleQuery)) {
        return false;
      }
      if (_selectedStatusFilter != 'all' &&
          member.stato != _selectedStatusFilter) {
        return false;
      }
      if (_selectedPrivacyFilter == 'accepted' && !member.privacyAccepted) {
        return false;
      }
      if (_selectedPrivacyFilter == 'not_accepted' && member.privacyAccepted) {
        return false;
      }

      return true;
    }).toList();
  }

  Future<void> _signIn() async {
    if (!_loginFormKey.currentState!.validate()) {
      return;
    }

    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase per accedere.', isError: true);
      return;
    }

    setState(() {
      _isSigningIn = true;
    });

    debugPrint(
      '[AdminDashboard] signIn attempt email=${_emailController.text.trim().toLowerCase()}',
    );

    try {
      await SupabaseService.instance.signInAdmin(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      debugPrint(
        '[AdminDashboard] signIn success currentUser=${SupabaseService.instance.currentUser?.email}',
      );
      _showMessage('Accesso effettuato con successo');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] signIn error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isSigningIn = false;
        });
      }
    }
  }

  Future<void> _signOut() async {
    await SupabaseService.instance.signOutAdmin();
    _showMessage('Sessione terminata');
  }

  Future<void> _changeStatus(MemberModel member, String status) async {
    final memberId = member.id;
    if (memberId == null || memberId.isEmpty) {
      _showMessage(
        'Impossibile aggiornare il socio selezionato.',
        isError: true,
      );
      return;
    }

    try {
      await SupabaseService.instance.updateMemberStatus(
        memberId: memberId,
        status: status,
      );
      _showMessage(
        status == 'approved'
            ? 'Socio approvato correttamente'
            : 'Socio rifiutato correttamente',
      );
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] changeStatus error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _editMember(MemberModel member) async {
    final formKey = GlobalKey<FormState>();
    final nomeController = TextEditingController(text: member.nome);
    final cognomeController = TextEditingController(text: member.cognome);
    final emailController = TextEditingController(text: member.email);
    final telefonoController = TextEditingController(text: member.telefono);
    final codiceFiscaleController = TextEditingController(
      text: member.codiceFiscale,
    );
    var selectedStatus = member.stato;

    final updatedMember = await showDialog<MemberModel>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text('Modifica ${member.fullName}'),
              content: SizedBox(
                width: 620,
                child: SingleChildScrollView(
                  child: Form(
                    key: formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: <Widget>[
                            SizedBox(
                              width: 280,
                              child: TextFormField(
                                controller: nomeController,
                                decoration: const InputDecoration(
                                  labelText: 'Nome',
                                ),
                                validator: (value) =>
                                    _validateRequired(value, 'Nome'),
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: TextFormField(
                                controller: cognomeController,
                                decoration: const InputDecoration(
                                  labelText: 'Cognome',
                                ),
                                validator: (value) =>
                                    _validateRequired(value, 'Cognome'),
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: TextFormField(
                                controller: emailController,
                                decoration: const InputDecoration(
                                  labelText: 'Email',
                                ),
                                validator: _validateEmail,
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: TextFormField(
                                controller: telefonoController,
                                decoration: const InputDecoration(
                                  labelText: 'Telefono',
                                ),
                                validator: (value) =>
                                    _validateRequired(value, 'Telefono'),
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: TextFormField(
                                controller: codiceFiscaleController,
                                decoration: const InputDecoration(
                                  labelText: 'Codice Fiscale',
                                ),
                                validator: (value) =>
                                    _validateRequired(value, 'Codice fiscale'),
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: DropdownButtonFormField<String>(
                                initialValue: selectedStatus,
                                decoration: const InputDecoration(
                                  labelText: 'Stato',
                                ),
                                items: const <DropdownMenuItem<String>>[
                                  DropdownMenuItem(
                                    value: 'pending',
                                    child: Text('Pending'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'approved',
                                    child: Text('Confermato'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'rejected',
                                    child: Text('Rifiutato'),
                                  ),
                                ],
                                onChanged: (value) {
                                  if (value == null) {
                                    return;
                                  }
                                  setDialogState(() {
                                    selectedStatus = value;
                                  });
                                },
                              ),
                            ),
                          ],
                        ),
                        if (member.firmaUrl.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 16),
                          const Text(
                            'Firma associata',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              _SignaturePreview(url: member.firmaUrl),
                              const SizedBox(width: 12),
                              Expanded(child: SelectableText(member.firmaUrl)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Annulla'),
                ),
                FilledButton.icon(
                  onPressed: () {
                    if (!formKey.currentState!.validate()) {
                      return;
                    }

                    Navigator.of(dialogContext).pop(
                      member.copyWith(
                        nome: nomeController.text.trim(),
                        cognome: cognomeController.text.trim(),
                        email: emailController.text.trim().toLowerCase(),
                        telefono: telefonoController.text.trim(),
                        codiceFiscale: codiceFiscaleController.text
                            .trim()
                            .toUpperCase(),
                        stato: selectedStatus,
                      ),
                    );
                  },
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Salva'),
                ),
              ],
            );
          },
        );
      },
    );

    nomeController.dispose();
    cognomeController.dispose();
    emailController.dispose();
    telefonoController.dispose();
    codiceFiscaleController.dispose();

    if (updatedMember == null) {
      return;
    }

    try {
      await SupabaseService.instance.updateMember(updatedMember);
      _showMessage('Socio aggiornato correttamente');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] editMember error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _deleteMember(MemberModel member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Elimina socio'),
          content: Text(
            'Vuoi eliminare definitivamente ${member.fullName}? Verrà rimosso anche il riferimento alla firma.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Annulla'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Elimina'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      await SupabaseService.instance.deleteMember(member);
      _showMessage('Socio eliminato correttamente');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] deleteMember error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _exportApprovedMembers() async {
    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase per usare l\'export.', isError: true);
      return;
    }

    setState(() {
      _isExporting = true;
    });

    try {
      final members = await SupabaseService.instance.getApprovedMembers();
      if (members.isEmpty) {
        _showMessage('Nessun socio approvato da esportare.');
        return;
      }

      await ExcelService.instance.exportApprovedMembers(members);
      _showMessage('File Excel generato correttamente');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] exportApprovedMembers error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
        });
      }
    }
  }

  Future<void> _exportSearchResults() async {
    if (!widget.supabaseConfigured) {
      _showMessage(
        'Configura Supabase per esportare i risultati.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isExporting = true;
    });

    try {
      final pending = await SupabaseService.instance.getMembersByStatus(
        'pending',
      );
      final approved = await SupabaseService.instance.getMembersByStatus(
        'approved',
      );
      final rejected = await SupabaseService.instance.getMembersByStatus(
        'rejected',
      );

      final filteredResults = _filterMembers(<MemberModel>[
        ...pending,
        ...approved,
        ...rejected,
      ]);

      if (filteredResults.isEmpty) {
        _showMessage('Nessun risultato da esportare con i filtri correnti.');
        return;
      }

      await ExcelService.instance.exportMembers(
        filteredResults,
        sheetName: 'Risultati ricerca',
        filePrefix: 'risultati_ricerca',
      );
      _showMessage('Export dei risultati della ricerca completato');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] exportSearchResults error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
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

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : _associationGreen,
      ),
    );
  }

  String _formatError(Object error) {
    if (error is AuthException) {
      return error.message;
    }

    return error
        .toString()
        .replaceFirst('Exception: ', '')
        .replaceFirst('AuthException(message: ', '')
        .replaceFirst('StateError: ', '')
        .replaceAll(')', '');
  }

  @override
  Widget build(BuildContext context) {
    final isAuthenticated = SupabaseService.instance.isAuthenticated;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard Admin'),
        actions: <Widget>[
          TextButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/'),
            icon: const Icon(Icons.how_to_reg_outlined),
            label: const Text('Registrazione'),
          ),
          if (isAuthenticated)
            IconButton(
              tooltip: _showSearchPanel ? 'Nascondi ricerca' : 'Mostra ricerca',
              onPressed: () {
                setState(() {
                  _showSearchPanel = !_showSearchPanel;
                });
              },
              icon: Icon(
                _showSearchPanel
                    ? Icons.menu_open_outlined
                    : Icons.menu_outlined,
              ),
            ),
          if (isAuthenticated)
            TextButton.icon(
              onPressed: _isExporting ? null : _exportApprovedMembers,
              icon: _isExporting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_outlined),
              label: const Text('Export XLSX'),
            ),
          if (isAuthenticated)
            TextButton.icon(
              onPressed: _signOut,
              icon: const Icon(Icons.logout_outlined),
              label: const Text('Esci'),
            ),
          const SizedBox(width: 12),
        ],
      ),
      body: StreamBuilder<AuthState>(
        stream: SupabaseService.instance.authChanges,
        builder: (context, snapshot) {
          if (!widget.supabaseConfigured) {
            return _buildConfigCard();
          }

          final hasSession = SupabaseService.instance.isAuthenticated;
          if (!hasSession) {
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 500),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: _buildLoginCard(),
                ),
              ),
            );
          }

          return _buildDashboardContent(
            isDesktop: MediaQuery.sizeOf(context).width >= 1100,
          );
        },
      ),
    );
  }

  Widget _buildDashboardContent({required bool isDesktop}) {
    final mainContent = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _buildOverviewSection(),
        const SizedBox(height: 16),
        _buildSearchCard(),
        const SizedBox(height: 16),
        _buildMembersSection(
          title: 'Richieste pending',
          description: 'Nuove richieste in attesa di approvazione o rifiuto.',
          stream: _pendingMembersStream,
          emptyMessage: 'Nessuna iscrizione pending trovata.',
          approvedSection: false,
        ),
        const SizedBox(height: 16),
        _buildMembersSection(
          title: 'Soci confermati',
          description:
              'Gestisci i soci approvati, modifica i dati anagrafici o elimina il record.',
          stream: _approvedMembersStream,
          emptyMessage: 'Nessun socio confermato trovato.',
          approvedSection: true,
        ),
      ],
    );

    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(
        horizontal: isDesktop ? 24 : 12,
        vertical: 24,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1360),
          child: isDesktop
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (_showSearchPanel) ...<Widget>[
                      SizedBox(width: 340, child: _buildSidePanel()),
                      const SizedBox(width: 24),
                    ],
                    Expanded(child: mainContent),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (_showSearchPanel) ...<Widget>[
                      _buildSidePanel(),
                      const SizedBox(height: 16),
                    ],
                    mainContent,
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildConfigCard() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Card(
          elevation: 0,
          margin: const EdgeInsets.all(16),
          child: const Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  Icons.settings_suggest_outlined,
                  color: _associationGreen,
                  size: 40,
                ),
                SizedBox(height: 12),
                Text(
                  'Configura Supabase',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 8),
                Text(
                  'La dashboard admin richiede Supabase Auth attivo. Una volta configurato, potrai approvare, modificare, eliminare ed esportare i soci approvati.',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoginCard() {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _loginFormKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Accesso Admin',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Usa un utente presente in Supabase Auth per aprire il pannello di gestione completo.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email admin'),
                validator: _validateEmail,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _passwordController,
                obscureText: !_showPassword,
                decoration: InputDecoration(
                  labelText: 'Password',
                  suffixIcon: IconButton(
                    onPressed: () {
                      setState(() {
                        _showPassword = !_showPassword;
                      });
                    },
                    icon: Icon(
                      _showPassword
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Password obbligatoria';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _isSigningIn ? null : _signIn,
                  icon: _isSigningIn
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.lock_open_outlined),
                  label: Text(_isSigningIn ? 'Accesso in corso...' : 'Accedi'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverviewSection() {
    return Wrap(
      spacing: 16,
      runSpacing: 16,
      children: <Widget>[
        _buildStatusSummaryCard(
          title: 'Richieste pending',
          description: 'Da valutare',
          icon: Icons.hourglass_top_outlined,
          stream: _pendingMembersStream,
        ),
        _buildStatusSummaryCard(
          title: 'Soci confermati',
          description: 'Gestibili e esportabili',
          icon: Icons.verified_user_outlined,
          stream: _approvedMembersStream,
        ),
        ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 220, maxWidth: 280),
          child: Card(
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(Icons.file_download_done_outlined),
                  const SizedBox(height: 12),
                  const Text(
                    'Export Excel',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Include URL e immagine della firma per ogni tesserato.',
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _isExporting ? null : _exportApprovedMembers,
                      icon: _isExporting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.download_outlined),
                      label: const Text('Scarica Excel'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusSummaryCard({
    required String title,
    required String description,
    required IconData icon,
    required Stream<List<MemberModel>> stream,
  }) {
    return StreamBuilder<List<MemberModel>>(
      stream: stream,
      builder: (context, snapshot) {
        final count = snapshot.data?.length ?? 0;
        return ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 220, maxWidth: 280),
          child: Card(
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(icon, color: _associationGreen),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(description),
                  const SizedBox(height: 12),
                  Text(
                    '$count',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: _associationGreen,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildSearchCard() {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                const Expanded(
                  child: Text(
                    'Ricerca rapida',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    setState(() {
                      _showSearchPanel = !_showSearchPanel;
                    });
                  },
                  icon: Icon(
                    _showSearchPanel
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                  label: Text(
                    _showSearchPanel ? 'Nascondi filtri' : 'Mostra filtri',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Ricerca generale su tutti i campi di registrazione',
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                FilledButton.tonalIcon(
                  onPressed: _isExporting ? null : _exportSearchResults,
                  icon: const Icon(Icons.filter_alt_outlined),
                  label: const Text('Export risultati filtrati'),
                ),
                TextButton.icon(
                  onPressed: _clearFilters,
                  icon: const Icon(Icons.restart_alt_outlined),
                  label: const Text('Pulisci tutti i filtri'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSidePanel() {
    final userEmail = SupabaseService.instance.currentUser?.email ?? 'Admin';

    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  const Expanded(
                    child: Text(
                      'Ricerca avanzata',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Nascondi pannello',
                    onPressed: () {
                      setState(() {
                        _showSearchPanel = false;
                      });
                    },
                    icon: const Icon(Icons.close_fullscreen_outlined),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('Utente autenticato: $userEmail'),
              const SizedBox(height: 16),
              TextField(
                controller: _nomeFilterController,
                decoration: const InputDecoration(
                  labelText: 'Nome',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _cognomeFilterController,
                decoration: const InputDecoration(
                  labelText: 'Cognome',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailFilterController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.alternate_email_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _telefonoFilterController,
                decoration: const InputDecoration(
                  labelText: 'Telefono',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _codiceFiscaleFilterController,
                decoration: const InputDecoration(
                  labelText: 'Codice Fiscale',
                  prefixIcon: Icon(Icons.credit_card_outlined),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: ValueKey<String>('status-$_selectedStatusFilter'),
                initialValue: _selectedStatusFilter,
                decoration: const InputDecoration(
                  labelText: 'Stato pratica',
                  prefixIcon: Icon(Icons.rule_folder_outlined),
                ),
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(
                    value: 'all',
                    child: Text('Tutti gli stati'),
                  ),
                  DropdownMenuItem(value: 'pending', child: Text('Pending')),
                  DropdownMenuItem(
                    value: 'approved',
                    child: Text('Confermati'),
                  ),
                  DropdownMenuItem(value: 'rejected', child: Text('Rifiutati')),
                ],
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }
                  setState(() {
                    _selectedStatusFilter = value;
                  });
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: ValueKey<String>('privacy-$_selectedPrivacyFilter'),
                initialValue: _selectedPrivacyFilter,
                decoration: const InputDecoration(
                  labelText: 'Privacy',
                  prefixIcon: Icon(Icons.privacy_tip_outlined),
                ),
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(value: 'all', child: Text('Tutti')),
                  DropdownMenuItem(
                    value: 'accepted',
                    child: Text('Privacy accettata'),
                  ),
                  DropdownMenuItem(
                    value: 'not_accepted',
                    child: Text('Privacy non accettata'),
                  ),
                ],
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }
                  setState(() {
                    _selectedPrivacyFilter = value;
                  });
                },
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _isExporting ? null : _exportSearchResults,
                  icon: _isExporting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.file_download_outlined),
                  label: const Text('Scarica risultati ricerca'),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _clearFilters,
                  icon: const Icon(Icons.restart_alt_outlined),
                  label: const Text('Reset filtri'),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _associationGreen.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Ricerca disponibile su',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    SizedBox(height: 8),
                    Text('• Nome e cognome'),
                    Text('• Email e telefono'),
                    Text('• Codice fiscale'),
                    Text('• Stato pratica e privacy'),
                    Text('• URL firma e data di iscrizione'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMembersSection({
    required String title,
    required String description,
    required Stream<List<MemberModel>> stream,
    required String emptyMessage,
    required bool approvedSection,
  }) {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: StreamBuilder<List<MemberModel>>(
          stream: stream,
          builder: (context, snapshot) {
            final members = _filterMembers(
              snapshot.data ?? const <MemberModel>[],
            );

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(description),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    _CounterChip(
                      count: members.length,
                      label: approvedSection ? 'confermati' : 'pending',
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const Center(child: CircularProgressIndicator())
                else if (members.isEmpty)
                  _buildEmptyState(emptyMessage)
                else if (MediaQuery.sizeOf(context).width >= 980)
                  _buildMembersTable(members, approvedSection: approvedSection)
                else
                  Column(
                    children: members
                        .map(
                          (member) => _buildMemberCard(
                            member,
                            approvedSection: approvedSection,
                          ),
                        )
                        .toList(),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildMembersTable(
    List<MemberModel> members, {
    required bool approvedSection,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 18,
        dataRowMinHeight: 76,
        dataRowMaxHeight: 92,
        columns: const <DataColumn>[
          DataColumn(label: Text('Nome')),
          DataColumn(label: Text('Email')),
          DataColumn(label: Text('Telefono')),
          DataColumn(label: Text('Cod. Fiscale')),
          DataColumn(label: Text('Firma')),
          DataColumn(label: Text('Data')),
          DataColumn(label: Text('Azioni')),
        ],
        rows: members.map((member) {
          return DataRow(
            cells: <DataCell>[
              DataCell(SizedBox(width: 160, child: Text(member.fullName))),
              DataCell(
                SizedBox(
                  width: 180,
                  child: Text(member.email, overflow: TextOverflow.ellipsis),
                ),
              ),
              DataCell(Text(member.telefono)),
              DataCell(
                SizedBox(
                  width: 130,
                  child: Text(
                    member.codiceFiscale,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              DataCell(_SignaturePreview(url: member.firmaUrl)),
              DataCell(Text(member.createdAtLabel)),
              DataCell(
                _buildActionButtons(member, approvedSection: approvedSection),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildActionButtons(
    MemberModel member, {
    required bool approvedSection,
  }) {
    if (approvedSection) {
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: <Widget>[
          FilledButton.icon(
            onPressed: () => _editMember(member),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Modifica'),
          ),
          OutlinedButton.icon(
            onPressed: () => _deleteMember(member),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Elimina'),
          ),
        ],
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: <Widget>[
        FilledButton.icon(
          onPressed: () => _changeStatus(member, 'approved'),
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Approva'),
        ),
        OutlinedButton.icon(
          onPressed: () => _changeStatus(member, 'rejected'),
          icon: const Icon(Icons.close_outlined),
          label: const Text('Rifiuta'),
        ),
      ],
    );
  }

  Widget _buildMemberCard(MemberModel member, {required bool approvedSection}) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        color: Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      member.fullName,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(member.email),
                    const SizedBox(height: 2),
                    Text(member.telefono),
                    const SizedBox(height: 2),
                    Text(member.codiceFiscale),
                    const SizedBox(height: 6),
                    Text('Richiesta: ${member.createdAtLabel}'),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                children: <Widget>[
                  _SignaturePreview(url: member.firmaUrl),
                  const SizedBox(height: 8),
                  _CounterChip(count: 1, label: member.stato),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildActionButtons(member, approvedSection: approvedSection),
        ],
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        children: <Widget>[
          const Icon(Icons.inbox_outlined, size: 42, color: Colors.grey),
          const SizedBox(height: 8),
          Text(message, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _CounterChip extends StatelessWidget {
  const _CounterChip({required this.count, required this.label});

  final int count;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _associationGreen.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Text(
        '$count $label',
        style: const TextStyle(
          color: _associationGreen,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _SignaturePreview extends StatelessWidget {
  const _SignaturePreview({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) {
      return Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: const Icon(Icons.draw_outlined, color: Colors.grey),
      );
    }

    return Tooltip(
      message: url,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          url,
          width: 56,
          height: 56,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              width: 56,
              height: 56,
              color: Colors.grey.shade100,
              alignment: Alignment.center,
              child: const Icon(Icons.broken_image_outlined),
            );
          },
          loadingBuilder: (context, child, loadingProgress) {
            if (loadingProgress == null) {
              return child;
            }

            return Container(
              width: 56,
              height: 56,
              color: Colors.grey.shade100,
              alignment: Alignment.center,
              child: const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            );
          },
        ),
      ),
    );
  }
}
