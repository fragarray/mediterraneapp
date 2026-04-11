import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_theme.dart';
import '../models/member_model.dart';
import '../services/excel_service.dart';
import '../services/supabase_service.dart';

enum _AdminView { dashboard, search }

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
  late Stream<List<MemberModel>> _pendingMembersStream;
  late Stream<List<MemberModel>> _approvedMembersStream;
  late Stream<List<MemberModel>> _allMembersStream;

  bool _isSigningIn = false;
  bool _isExporting = false;
  bool _showPassword = false;
  bool _showSearchPanel = false;
  _AdminView _selectedView = _AdminView.dashboard;
  DateTimeRange? _registrationDateRange;
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

  void _refreshMemberStreams() {
    _pendingMembersStream = SupabaseService.instance.watchPendingMembers();
    _approvedMembersStream = SupabaseService.instance.watchApprovedMembers();
    _allMembersStream = SupabaseService.instance.watchAllMembers();
  }

  @override
  void initState() {
    super.initState();
    _refreshMemberStreams();
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
      _registrationDateRange = null;
    });
  }

  String _formatDateOnly(DateTime date) {
    return DateFormat('dd/MM/yyyy', 'it_IT').format(DateUtils.dateOnly(date));
  }

  Future<void> _pickRegistrationBoundary({required bool isStart}) async {
    final now = DateUtils.dateOnly(DateTime.now());
    final currentStart = _registrationDateRange?.start;
    final currentEnd = _registrationDateRange?.end;
    final initialDate = isStart
        ? (currentStart ?? now)
        : (currentEnd ?? currentStart ?? now);

    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: now.add(const Duration(days: 365)),
      locale: const Locale('it', 'IT'),
    );

    if (pickedDate == null) {
      return;
    }

    final normalized = DateUtils.dateOnly(pickedDate);

    setState(() {
      final start = isStart ? normalized : (currentStart ?? normalized);
      final end = isStart ? (currentEnd ?? normalized) : normalized;

      _registrationDateRange = DateTimeRange(
        start: start.isAfter(end) ? end : start,
        end: end.isBefore(start) ? start : end,
      );
    });
  }

  Widget _buildCompactDateField({
    required String label,
    required DateTime? value,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    final hasValue = value != null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: hasValue ? const Color(0xFFEAF5EA) : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: hasValue
                  ? theme.colorScheme.primary.withValues(alpha: 0.30)
                  : Colors.grey.shade300,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.event_outlined,
                size: 14,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                '$label: ${hasValue ? _formatDateOnly(value) : '--'}',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: hasValue
                      ? theme.colorScheme.onSurface
                      : Colors.grey.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<MemberModel> _latestApprovedMembers(List<MemberModel> members) {
    final sorted = members.toList()
      ..sort(
        (first, second) => (second.createdAt ?? DateTime(1900)).compareTo(
          first.createdAt ?? DateTime(1900),
        ),
      );

    return sorted.take(30).toList();
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
      final createdDate = member.createdAt == null
          ? null
          : DateUtils.dateOnly(member.createdAt!);

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
      if (_registrationDateRange != null && createdDate == null) {
        return false;
      }
      if (_registrationDateRange != null &&
          createdDate!.isBefore(_registrationDateRange!.start)) {
        return false;
      }
      if (_registrationDateRange != null &&
          createdDate!.isAfter(_registrationDateRange!.end)) {
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
      if (mounted) {
        setState(_refreshMemberStreams);
      }
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
            final screenWidth = MediaQuery.of(dialogContext).size.width;
            final dialogWidth = screenWidth >= 760
                ? 620.0
                : ((screenWidth - 48).clamp(280.0, 620.0)).toDouble();
            final twoColumns = dialogWidth >= 560;
            final fieldWidth = twoColumns
                ? (dialogWidth - 12) / 2
                : dialogWidth;

            return Dialog(
              insetPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 24,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: dialogWidth,
                  maxHeight: MediaQuery.of(dialogContext).size.height * 0.85,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: SingleChildScrollView(
                    child: Form(
                      key: formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            'Modifica ${member.fullName}',
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 16),
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: <Widget>[
                              SizedBox(
                                width: fieldWidth,
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
                                width: fieldWidth,
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
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: emailController,
                                  decoration: const InputDecoration(
                                    labelText: 'Email',
                                  ),
                                  validator: _validateEmail,
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
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
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: codiceFiscaleController,
                                  decoration: const InputDecoration(
                                    labelText: 'Codice Fiscale',
                                  ),
                                  validator: (value) => _validateRequired(
                                    value,
                                    'Codice fiscale',
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
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
                            if (twoColumns)
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  _SignaturePreview(
                                    url: member.firmaUrl,
                                    width: 180,
                                    height: 72,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: SelectableText(member.firmaUrl),
                                  ),
                                ],
                              )
                            else
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  _SignaturePreview(
                                    url: member.firmaUrl,
                                    width: 180,
                                    height: 72,
                                  ),
                                  const SizedBox(height: 8),
                                  SelectableText(member.firmaUrl),
                                ],
                              ),
                          ],
                          const SizedBox(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: <Widget>[
                              TextButton(
                                onPressed: () =>
                                    Navigator.of(dialogContext).pop(),
                                child: const Text('Annulla'),
                              ),
                              const SizedBox(width: 8),
                              FilledButton.icon(
                                onPressed: () {
                                  if (!formKey.currentState!.validate()) {
                                    return;
                                  }

                                  Navigator.of(dialogContext).pop(
                                    member.copyWith(
                                      nome: nomeController.text.trim(),
                                      cognome: cognomeController.text.trim(),
                                      email: emailController.text
                                          .trim()
                                          .toLowerCase(),
                                      telefono: telefonoController.text.trim(),
                                      codiceFiscale: codiceFiscaleController
                                          .text
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
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
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
      if (mounted) {
        setState(_refreshMemberStreams);
      }
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
      if (mounted) {
        setState(_refreshMemberStreams);
      }
      _showMessage('Socio eliminato correttamente');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] deleteMember error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
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

    final primaryColor = Theme.of(context).colorScheme.primary;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : primaryColor,
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
    final title = !isAuthenticated
        ? 'Dashboard Admin'
        : _selectedView == _AdminView.dashboard
        ? 'Area Admin · Home'
        : 'Area Admin · Ricerca';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: <Widget>[
          if (isAuthenticated)
            TextButton.icon(
              onPressed: () {
                setState(() {
                  _selectedView = _AdminView.dashboard;
                });
              },
              icon: const Icon(Icons.home_outlined),
              label: const Text('Home'),
            ),
          if (isAuthenticated)
            TextButton.icon(
              onPressed: () {
                setState(() {
                  _selectedView = _AdminView.search;
                });
              },
              icon: const Icon(Icons.search_outlined),
              label: const Text('Ricerca'),
            ),
          if (isAuthenticated) _buildThemeMenuButton(),
          TextButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/'),
            icon: const Icon(Icons.how_to_reg_outlined),
            label: const Text('Registrazione'),
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
    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(
        horizontal: isDesktop ? 24 : 12,
        vertical: 24,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1280),
          child: SizedBox(
            width: double.infinity,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: KeyedSubtree(
                key: ValueKey<_AdminView>(_selectedView),
                child: _selectedView == _AdminView.dashboard
                    ? _buildHomePage()
                    : _buildSearchPage(isDesktop: isDesktop),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildConfigCard() {
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Card(
          elevation: 0,
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  Icons.settings_suggest_outlined,
                  color: primaryColor,
                  size: 40,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Configura Supabase',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                const Text(
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

  Widget _buildThemeMenuButton() {
    return ValueListenableBuilder<Color>(
      valueListenable: AppThemeController.seedColor,
      builder: (context, currentColor, _) {
        return PopupMenuButton<Color>(
          tooltip: 'Colore applicazione',
          icon: ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              colors: <Color>[
                Color(0xFF2E7D32),
                Color(0xFF1565C0),
                Color(0xFF6A1B9A),
                Color(0xFFEF6C00),
              ],
            ).createShader(bounds),
            child: const Icon(Icons.palette_outlined, color: Colors.white),
          ),
          onSelected: AppThemeController.setSeedColor,
          itemBuilder: (context) {
            return AppThemeController.options.map((option) {
              final isSelected = currentColor == option.color;
              return PopupMenuItem<Color>(
                value: option.color,
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: option.color,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isSelected
                              ? Colors.black87
                              : Colors.grey.shade300,
                          width: isSelected ? 2.5 : 1,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(option.label),
                  ],
                ),
              );
            }).toList();
          },
        );
      },
    );
  }

  Widget _buildHomePage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _buildMembersSection(
          title: 'Richieste pending',
          description:
              'Qui gestisci le nuove richieste in attesa di approvazione o rifiuto.',
          stream: _pendingMembersStream,
          emptyMessage: 'Nessuna iscrizione pending trovata.',
          approvedSection: false,
          countLabel: 'pending',
        ),
        const SizedBox(height: 16),
        _buildMembersSection(
          title: 'Ultimi associati',
          description: 'Ultimi 30 soci confermati registrati più di recente.',
          stream: _approvedMembersStream,
          emptyMessage: 'Nessun socio confermato trovato.',
          approvedSection: true,
          transformMembers: _latestApprovedMembers,
          countLabel: 'associati',
        ),
      ],
    );
  }

  Widget _buildSearchPage({required bool isDesktop}) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = isDesktop && constraints.maxWidth >= 980;
        final primaryWidth = wide ? 220.0 : constraints.maxWidth;
        final advancedWidth = wide
            ? (constraints.maxWidth - 24) / 3
            : constraints.maxWidth;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Card(
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      alignment: WrapAlignment.spaceBetween,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 720),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(
                                'Ricerca tesserati',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Filtra in modo rapido e controlla la tabella prima di esportare.',
                              ),
                            ],
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () {
                            setState(() {
                              _selectedView = _AdminView.dashboard;
                            });
                          },
                          icon: const Icon(Icons.arrow_back_outlined),
                          label: const Text('Torna alla home'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _searchController,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search),
                        labelText: 'Ricerca generale',
                        hintText:
                            'Nome, cognome, email, telefono, codice fiscale o data',
                        suffixIcon: IconButton(
                          tooltip: _showSearchPanel
                              ? 'Nascondi filtri'
                              : 'Mostra filtri',
                          onPressed: () {
                            setState(() {
                              _showSearchPanel = !_showSearchPanel;
                            });
                          },
                          icon: Icon(
                            _showSearchPanel ? Icons.tune : Icons.tune_outlined,
                          ),
                        ),
                      ),
                    ),
                    if (_showSearchPanel) ...<Widget>[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAF7),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: <Widget>[
                                SizedBox(
                                  width: primaryWidth,
                                  child: DropdownButtonFormField<String>(
                                    key: ValueKey<String>(
                                      'status-$_selectedStatusFilter',
                                    ),
                                    initialValue: _selectedStatusFilter,
                                    decoration: const InputDecoration(
                                      labelText: 'Stato',
                                      prefixIcon: Icon(
                                        Icons.rule_folder_outlined,
                                      ),
                                    ),
                                    items: const <DropdownMenuItem<String>>[
                                      DropdownMenuItem(
                                        value: 'all',
                                        child: Text('Tutti gli stati'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'pending',
                                        child: Text('Pending'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'approved',
                                        child: Text('Confermati'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'rejected',
                                        child: Text('Rifiutati'),
                                      ),
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
                                ),
                                SizedBox(
                                  width: primaryWidth,
                                  child: DropdownButtonFormField<String>(
                                    key: ValueKey<String>(
                                      'privacy-$_selectedPrivacyFilter',
                                    ),
                                    initialValue: _selectedPrivacyFilter,
                                    decoration: const InputDecoration(
                                      labelText: 'Privacy',
                                      prefixIcon: Icon(
                                        Icons.privacy_tip_outlined,
                                      ),
                                    ),
                                    items: const <DropdownMenuItem<String>>[
                                      DropdownMenuItem(
                                        value: 'all',
                                        child: Text('Tutti'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'accepted',
                                        child: Text('Accettata'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'not_accepted',
                                        child: Text('Non accettata'),
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
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 7,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF3F7F1),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: <Widget>[
                                      Icon(
                                        Icons.date_range_outlined,
                                        size: 14,
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.primary,
                                      ),
                                      const SizedBox(width: 6),
                                      const Text(
                                        'Registrazione',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                _buildCompactDateField(
                                  label: 'Da',
                                  value: _registrationDateRange?.start,
                                  onTap: () =>
                                      _pickRegistrationBoundary(isStart: true),
                                ),
                                _buildCompactDateField(
                                  label: 'A',
                                  value: _registrationDateRange?.end,
                                  onTap: () =>
                                      _pickRegistrationBoundary(isStart: false),
                                ),
                                if (_registrationDateRange != null)
                                  TextButton.icon(
                                    style: TextButton.styleFrom(
                                      visualDensity: VisualDensity.compact,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    onPressed: () {
                                      setState(() {
                                        _registrationDateRange = null;
                                      });
                                    },
                                    icon: const Icon(
                                      Icons.close_outlined,
                                      size: 16,
                                    ),
                                    label: const Text('Azzera'),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: <Widget>[
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _nomeFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Nome',
                                      prefixIcon: Icon(Icons.person_outline),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _cognomeFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Cognome',
                                      prefixIcon: Icon(Icons.badge_outlined),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _emailFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Email',
                                      prefixIcon: Icon(
                                        Icons.alternate_email_outlined,
                                      ),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _telefonoFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Telefono',
                                      prefixIcon: Icon(Icons.phone_outlined),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _codiceFiscaleFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Codice Fiscale',
                                      prefixIcon: Icon(
                                        Icons.credit_card_outlined,
                                      ),
                                    ),
                                  ),
                                ),
                                TextButton.icon(
                                  onPressed: _clearFilters,
                                  icon: const Icon(Icons.restart_alt_outlined),
                                  label: const Text('Pulisci filtri'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            _buildMembersSection(
              title: 'Risultati ricerca',
              description:
                  'Anteprima live dei risultati. La tabella si aggiorna mentre scrivi.',
              stream: _allMembersStream,
              emptyMessage: 'Nessun socio trovato con i filtri correnti.',
              approvedSection: false,
              applySearchFilters: true,
              mixedStatuses: true,
              countLabel: 'risultati',
              headerActions: FilledButton.icon(
                onPressed: _isExporting ? null : _exportSearchResults,
                icon: _isExporting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_outlined),
                label: const Text('Export Excel'),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMembersSection({
    required String title,
    required String description,
    required Stream<List<MemberModel>> stream,
    required String emptyMessage,
    required bool approvedSection,
    bool applySearchFilters = false,
    bool mixedStatuses = false,
    String? countLabel,
    Widget? headerActions,
    List<MemberModel> Function(List<MemberModel> members)? transformMembers,
  }) {
    return SizedBox(
      width: double.infinity,
      child: Card(
        elevation: 0,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: StreamBuilder<List<MemberModel>>(
            stream: stream,
            builder: (context, snapshot) {
              final rawMembers = snapshot.data ?? const <MemberModel>[];
              final transformedMembers = transformMembers != null
                  ? transformMembers(rawMembers)
                  : rawMembers;
              final members = applySearchFilters
                  ? _filterMembers(transformedMembers)
                  : transformedMembers;

              return LayoutBuilder(
                builder: (context, constraints) {
                  final tableThreshold = mixedStatuses ? 1180.0 : 980.0;
                  final useTableLayout = constraints.maxWidth >= tableThreshold;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: <Widget>[
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 720),
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
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: <Widget>[
                              ?headerActions,
                              _CounterChip(
                                count: members.length,
                                label:
                                    countLabel ??
                                    (approvedSection
                                        ? 'confermati'
                                        : 'pending'),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      if (snapshot.connectionState == ConnectionState.waiting)
                        const Center(child: CircularProgressIndicator())
                      else if (members.isEmpty)
                        _buildEmptyState(emptyMessage)
                      else if (useTableLayout)
                        _buildMembersTable(
                          members,
                          approvedSection: approvedSection,
                          mixedStatuses: mixedStatuses,
                        )
                      else
                        Column(
                          children: members
                              .map(
                                (member) => _buildMemberCard(
                                  member,
                                  approvedSection: approvedSection,
                                  mixedStatuses: mixedStatuses,
                                ),
                              )
                              .toList(),
                        ),
                    ],
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildMembersTable(
    List<MemberModel> members, {
    required bool approvedSection,
    bool mixedStatuses = false,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          primary: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: DataTable(
              horizontalMargin: 12,
              columnSpacing: 24,
              dataRowMinHeight: 76,
              dataRowMaxHeight: 92,
              columns: <DataColumn>[
                const DataColumn(label: Text('Nome')),
                const DataColumn(label: Text('Email')),
                const DataColumn(label: Text('Telefono')),
                const DataColumn(label: Text('Cod. Fiscale')),
                if (mixedStatuses) const DataColumn(label: Text('Stato')),
                const DataColumn(label: Text('Firma')),
                const DataColumn(label: Text('Data')),
                const DataColumn(label: Text('Azioni')),
              ],
              rows: members.map((member) {
                return DataRow(
                  cells: <DataCell>[
                    DataCell(
                      SizedBox(width: 180, child: Text(member.fullName)),
                    ),
                    DataCell(
                      SizedBox(
                        width: 220,
                        child: Text(
                          member.email,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    DataCell(
                      SizedBox(width: 120, child: Text(member.telefono)),
                    ),
                    DataCell(
                      SizedBox(
                        width: 140,
                        child: Text(
                          member.codiceFiscale,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    if (mixedStatuses)
                      DataCell(_CounterChip(count: 1, label: member.stato)),
                    DataCell(
                      SizedBox(
                        width: 132,
                        child: _SignaturePreview(
                          url: member.firmaUrl,
                          width: 120,
                          height: 56,
                        ),
                      ),
                    ),
                    DataCell(
                      SizedBox(width: 90, child: Text(member.createdAtLabel)),
                    ),
                    DataCell(
                      _buildActionButtons(
                        member,
                        approvedSection: approvedSection,
                        mixedStatuses: mixedStatuses,
                        compact: true,
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        );
      },
    );
  }

  Widget _buildActionButtons(
    MemberModel member, {
    required bool approvedSection,
    bool mixedStatuses = false,
    bool compact = false,
  }) {
    final showApprovedActions =
        approvedSection || (mixedStatuses && member.stato == 'approved');

    if (compact) {
      if (showApprovedActions) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            IconButton(
              tooltip: 'Modifica socio',
              onPressed: () => _editMember(member),
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: 'Elimina socio',
              onPressed: () => _deleteMember(member),
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        );
      }

      return Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          IconButton(
            tooltip: 'Approva richiesta',
            onPressed: () => _changeStatus(member, 'approved'),
            icon: const Icon(Icons.check_circle_outline),
          ),
          IconButton(
            tooltip: 'Rifiuta richiesta',
            onPressed: () => _changeStatus(member, 'rejected'),
            icon: const Icon(Icons.close_outlined),
          ),
        ],
      );
    }

    if (showApprovedActions) {
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

  Widget _buildMemberCard(
    MemberModel member, {
    required bool approvedSection,
    bool mixedStatuses = false,
  }) {
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
                  _SignaturePreview(
                    url: member.firmaUrl,
                    width: 120,
                    height: 56,
                  ),
                  const SizedBox(height: 8),
                  _CounterChip(count: 1, label: member.stato),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildActionButtons(
            member,
            approvedSection: approvedSection,
            mixedStatuses: mixedStatuses,
          ),
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
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: primaryColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Text(
        '$count $label',
        style: TextStyle(color: primaryColor, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _SignaturePreview extends StatelessWidget {
  const _SignaturePreview({
    required this.url,
    this.width = 120,
    this.height = 56,
  });

  final String url;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    Widget buildFrame(Widget child) {
      return Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        alignment: Alignment.center,
        child: child,
      );
    }

    if (url.isEmpty) {
      return buildFrame(const Icon(Icons.draw_outlined, color: Colors.grey));
    }

    return Tooltip(
      message: url,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: buildFrame(
          Image.network(
            url,
            width: width,
            height: height,
            fit: BoxFit.contain,
            alignment: Alignment.center,
            errorBuilder: (context, error, stackTrace) {
              return const Icon(Icons.broken_image_outlined);
            },
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) {
                return child;
              }

              return const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              );
            },
          ),
        ),
      ),
    );
  }
}
