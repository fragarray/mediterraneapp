import 'dart:math' as math;
import 'dart:typed_data';

import 'package:carousel_slider/carousel_slider.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:image/image.dart' as img;
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_theme.dart';
import '../models/legacy_membership_request_model.dart';
import '../models/member_model.dart';
import '../services/excel_service.dart';
import '../services/pdf_service.dart';
import '../services/supabase_service.dart';

enum _AdminView { dashboard, search, carousel }

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
  final _luogoNascitaFilterController = TextEditingController();
  final _dataNascitaFilterController = TextEditingController();
  final _residenzaFilterController = TextEditingController();
  final _comuneFilterController = TextEditingController();
  final _capFilterController = TextEditingController();
  final _emailFilterController = TextEditingController();
  final _telefonoFilterController = TextEditingController();
  final _membershipStartController = TextEditingController();
  final _instagramUrlController = TextEditingController();
  final ScrollController _pendingTableScrollController = ScrollController();
  final ScrollController _approvedTableScrollController = ScrollController();
  final ScrollController _searchTableScrollController = ScrollController();
  late Stream<List<MemberModel>> _pendingMembersStream;
  late Stream<List<MemberModel>> _approvedMembersStream;
  late Stream<List<MemberModel>> _allMembersStream;
  late Stream<List<LegacyMembershipRequestModel>> _pendingLegacyRequestsStream;

  static const Map<String, double> _defaultColumnWidths = <String, double>{
    'membership': 86,
    'name': 130,
    'birth': 140,
    'residence': 160,
    'email': 165,
    'phone': 98,
    'status': 84,
    'date': 80,
    'actions': 140,
  };
  final Map<String, double> _columnWidths = Map<String, double>.from(
    _defaultColumnWidths,
  );

  bool _isSigningIn = false;
  bool _isExporting = false;
  bool _showPassword = false;
  bool _showSearchPanel = false;
  bool _isLoadingMembershipStart = false;
  bool _isSavingMembershipStart = false;
  bool _isLoadingLandingMedia = false;
  bool _isSavingLandingMedia = false;
  bool _isUploadingCarouselImages = false;
  bool _membershipStartLoaded = false;
  bool _isLoadingNextMembershipPreview = false;
  int? _nextMembershipPreview;
  double _carouselPreviewSpeedSeconds = 4;
  double _carouselPreviewHeight = 230;
  double _carouselVisibleItems = 2;
  List<String> _carouselImageUrls = <String>[];
  List<String> _persistedCarouselImageUrls = <String>[];
  String _sortColumnKey = 'date';
  bool _sortAscending = false;
  String? _highlightedColumnKey;
  String? _selectedMemberId;
  _AdminView _selectedView = _AdminView.dashboard;
  DateTimeRange? _registrationDateRange;
  String _selectedStatusFilter = 'all';
  String _selectedPrivacyFilter = 'all';

  Iterable<TextEditingController> get _filterControllers =>
      <TextEditingController>[
        _searchController,
        _nomeFilterController,
        _cognomeFilterController,
        _luogoNascitaFilterController,
        _dataNascitaFilterController,
        _residenzaFilterController,
        _comuneFilterController,
        _capFilterController,
        _emailFilterController,
        _telefonoFilterController,
      ];

  void _refreshMemberStreams() {
    _pendingMembersStream = SupabaseService.instance.watchPendingMembers();
    _approvedMembersStream = SupabaseService.instance.watchApprovedMembers();
    _allMembersStream = SupabaseService.instance.watchAllMembers();
    _pendingLegacyRequestsStream = SupabaseService.instance
        .watchPendingLegacyMembershipRequests();
  }

  @override
  void initState() {
    super.initState();
    _refreshMemberStreams();
    if (widget.supabaseConfigured) {
      _loadMembershipStartNumber();
      _loadNextMembershipPreview();
      _loadLandingMediaSettings();
    }
    for (final controller in _filterControllers) {
      controller.addListener(_onSearchChanged);
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _membershipStartController.dispose();
    _instagramUrlController.dispose();
    _pendingTableScrollController.dispose();
    _approvedTableScrollController.dispose();
    _searchTableScrollController.dispose();
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

  bool _hasActiveSearchFilters() {
    if (_searchController.text.trim().isNotEmpty) {
      return true;
    }
    if (_nomeFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_cognomeFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_luogoNascitaFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_dataNascitaFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_residenzaFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_comuneFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_capFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_emailFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_telefonoFilterController.text.trim().isNotEmpty) {
      return true;
    }
    if (_selectedStatusFilter != 'all') {
      return true;
    }
    if (_selectedPrivacyFilter != 'all') {
      return true;
    }
    if (_registrationDateRange != null) {
      return true;
    }

    return false;
  }

  double _columnWidth(String key) {
    return _columnWidths[key] ?? _defaultColumnWidths[key] ?? 120;
  }

  double _minColumnWidth(String key) {
    switch (key) {
      case 'membership':
        return 72;
      case 'name':
      case 'birth':
      case 'residence':
      case 'email':
        return 92;
      case 'phone':
        return 84;
      case 'status':
      case 'date':
        return 72;
      case 'actions':
        return 120;
      default:
        return 72;
    }
  }

  void _resizeColumn(String key, double delta) {
    final resizedWidth = (_columnWidth(key) + delta).clamp(
      _minColumnWidth(key),
      420.0,
    );

    if (resizedWidth == _columnWidth(key)) {
      return;
    }

    setState(() {
      _columnWidths[key] = resizedWidth;
    });
  }

  void _resetColumnWidth(String key) {
    final defaultWidth = _defaultColumnWidths[key];
    if (defaultWidth == null) {
      return;
    }

    setState(() {
      _columnWidths[key] = defaultWidth;
    });
  }

  void _resetColumnWidths() {
    setState(() {
      _columnWidths
        ..clear()
        ..addAll(_defaultColumnWidths);
    });
  }

  void _toggleSortColumn(String columnKey) {
    setState(() {
      if (_sortColumnKey == columnKey) {
        _sortAscending = !_sortAscending;
      } else {
        _sortColumnKey = columnKey;
        _sortAscending = true;
      }
      _highlightedColumnKey = columnKey;
    });
  }

  void _clearTableHighlights() {
    if (_selectedMemberId == null && _highlightedColumnKey == null) {
      return;
    }

    setState(() {
      _selectedMemberId = null;
      _highlightedColumnKey = null;
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
    final luogoNascitaQuery = _luogoNascitaFilterController.text
        .trim()
        .toLowerCase();
    final dataNascitaQuery = _dataNascitaFilterController.text
        .trim()
        .toLowerCase();
    final residenzaQuery = _residenzaFilterController.text.trim().toLowerCase();
    final comuneQuery = _comuneFilterController.text.trim().toLowerCase();
    final capQuery = _capFilterController.text.trim().toLowerCase();
    final emailQuery = _emailFilterController.text.trim().toLowerCase();
    final telefonoQuery = _telefonoFilterController.text.trim().toLowerCase();

    return members.where((member) {
      final createdDate = member.createdAt == null
          ? null
          : DateUtils.dateOnly(member.createdAt!);

      final searchable = <String>[
        member.numeroTessera,
        member.nome,
        member.cognome,
        member.fullName,
        member.luogoNascita,
        member.birthDateLabel,
        member.birthPlaceAndDateLabel,
        member.residenza,
        member.comune,
        member.cap,
        member.residenceLabel,
        member.email,
        member.telefono,
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
      if (luogoNascitaQuery.isNotEmpty &&
          !member.luogoNascita.toLowerCase().contains(luogoNascitaQuery)) {
        return false;
      }
      if (dataNascitaQuery.isNotEmpty &&
          !member.birthDateLabel.toLowerCase().contains(dataNascitaQuery)) {
        return false;
      }
      if (residenzaQuery.isNotEmpty &&
          !member.residenza.toLowerCase().contains(residenzaQuery)) {
        return false;
      }
      if (comuneQuery.isNotEmpty &&
          !member.comune.toLowerCase().contains(comuneQuery)) {
        return false;
      }
      if (capQuery.isNotEmpty && !member.cap.toLowerCase().contains(capQuery)) {
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
      await _loadMembershipStartNumber(forceRefresh: true);
      await _loadNextMembershipPreview(forceRefresh: true);
      await _loadLandingMediaSettings(forceRefresh: true);
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

  Future<void> _loadMembershipStartNumber({bool forceRefresh = false}) async {
    if (!widget.supabaseConfigured) {
      return;
    }

    if (_membershipStartLoaded && !forceRefresh) {
      return;
    }

    if (mounted) {
      setState(() {
        _isLoadingMembershipStart = true;
      });
    }

    try {
      final startNumber = await SupabaseService.instance
          .getMembershipStartNumber();
      _membershipStartController.text = startNumber?.toString() ?? '';
      _membershipStartLoaded = true;
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] loadMembershipStartNumber error: $error');
      debugPrintStack(stackTrace: stackTrace);
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingMembershipStart = false;
        });
      }
    }
  }

  Future<bool> _saveMembershipStartNumber() async {
    final rawValue = _membershipStartController.text.trim();
    final startNumber = int.tryParse(rawValue);

    if (startNumber == null || startNumber <= 0) {
      _showMessage(
        'Inserisci un numero iniziale valido maggiore di zero.',
        isError: true,
      );
      return false;
    }

    if (mounted) {
      setState(() {
        _isSavingMembershipStart = true;
      });
    }

    try {
      await SupabaseService.instance.saveMembershipStartNumber(startNumber);
      await _loadNextMembershipPreview(forceRefresh: true);
      _showMessage('Numero iniziale tesseramento salvato: $startNumber');
      return true;
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] saveMembershipStartNumber error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
      return false;
    } finally {
      if (mounted) {
        setState(() {
          _isSavingMembershipStart = false;
        });
      }
    }
  }

  Future<void> _loadNextMembershipPreview({bool forceRefresh = false}) async {
    if (!widget.supabaseConfigured) {
      return;
    }

    if (_isLoadingNextMembershipPreview && !forceRefresh) {
      return;
    }

    if (mounted) {
      setState(() {
        _isLoadingNextMembershipPreview = true;
      });
    }

    try {
      final preview = await SupabaseService.instance
          .getNextMembershipNumberPreview();
      if (mounted) {
        setState(() {
          _nextMembershipPreview = preview;
        });
      }
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] loadNextMembershipPreview error: $error');
      debugPrintStack(stackTrace: stackTrace);
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingNextMembershipPreview = false;
        });
      }
    }
  }

  Future<void> _loadLandingMediaSettings({bool forceRefresh = false}) async {
    if (!widget.supabaseConfigured) {
      return;
    }

    if (_isLoadingLandingMedia && !forceRefresh) {
      return;
    }

    if (mounted) {
      setState(() {
        _isLoadingLandingMedia = true;
      });
    }

    try {
      final settings = await SupabaseService.instance
          .getLandingCarouselSettings();
      final instagramUrl = await SupabaseService.instance
          .getInstagramProfileUrl();

      if (!mounted) {
        return;
      }

      setState(() {
        _carouselImageUrls = settings.imageUrls;
        _persistedCarouselImageUrls = List<String>.from(settings.imageUrls);
        _carouselPreviewSpeedSeconds = settings.autoplaySeconds;
        _carouselPreviewHeight = settings.widgetHeight;
        _carouselVisibleItems = settings.visibleItems;
        _instagramUrlController.text = instagramUrl ?? '';
      });
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] loadLandingMediaSettings error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingLandingMedia = false;
        });
      }
    }
  }

  Future<void> _saveLandingMediaSettings() async {
    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase per salvare il carosello.', isError: true);
      return;
    }

    final rawInstagram = _instagramUrlController.text.trim();
    if (rawInstagram.isNotEmpty && Uri.tryParse(rawInstagram) == null) {
      _showMessage('Inserisci un link Instagram valido.', isError: true);
      return;
    }

    if (mounted) {
      setState(() {
        _isSavingLandingMedia = true;
      });
    }

    try {
      final removedUrls = _persistedCarouselImageUrls
          .where((url) => !_carouselImageUrls.contains(url))
          .toList();

      for (final removedUrl in removedUrls) {
        await SupabaseService.instance.deleteCarouselImageByPublicUrl(removedUrl);
      }

      await SupabaseService.instance.saveInstagramProfileUrl(rawInstagram);
      await SupabaseService.instance.saveLandingCarouselSettings(
        LandingCarouselSettings(
          imageUrls: _carouselImageUrls,
          autoplaySeconds: _carouselPreviewSpeedSeconds,
          widgetHeight: _carouselPreviewHeight,
          visibleItems: _carouselVisibleItems,
        ),
      );
      _persistedCarouselImageUrls = List<String>.from(_carouselImageUrls);
      _showMessage('Carosello home e Instagram salvati.');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] saveLandingMediaSettings error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isSavingLandingMedia = false;
        });
      }
    }
  }

  Future<void> _removeCarouselImageAt(int index) async {
    if (index < 0 || index >= _carouselImageUrls.length) {
      return;
    }

    final urlToDelete = _carouselImageUrls[index];

    try {
      await SupabaseService.instance.deleteCarouselImageByPublicUrl(urlToDelete);
      if (!mounted) {
        return;
      }

      setState(() {
        _carouselImageUrls = List<String>.from(_carouselImageUrls)
          ..removeAt(index);
        _persistedCarouselImageUrls = List<String>.from(_persistedCarouselImageUrls)
          ..remove(urlToDelete);
      });
      _showMessage('Slide eliminata dal carosello e dallo storage.');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] removeCarouselImageAt error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _pickAndUploadCarouselImages() async {
    if (!widget.supabaseConfigured) {
      _showMessage('Configura Supabase per caricare immagini.', isError: true);
      return;
    }

    if (mounted) {
      setState(() {
        _isUploadingCarouselImages = true;
      });
    }

    try {
      const imageTypeGroup = XTypeGroup(
        label: 'Immagini',
        extensions: <String>[
          'jpg',
          'jpeg',
          'png',
          'webp',
          'gif',
          'bmp',
        ],
      );

      final files = await openFiles(acceptedTypeGroups: <XTypeGroup>[imageTypeGroup]);
      if (files.isEmpty) {
        return;
      }

      final uploadedUrls = <String>[];
      for (final file in files) {
        final bytes = await file.readAsBytes();
        if (bytes.isEmpty) {
          continue;
        }

        final processed = _optimizeCarouselImage(
          bytes: bytes,
          originalFileName: file.name,
        );

        final uploadedUrl = await SupabaseService.instance.uploadCarouselImage(
          bytes: processed.bytes,
          fileName: processed.fileName,
        );
        uploadedUrls.add(uploadedUrl);
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _carouselImageUrls = uploadedUrls;
      });
      _showMessage('Immagini carosello caricate: ${uploadedUrls.length}');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] pickAndUploadCarouselImages error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isUploadingCarouselImages = false;
        });
      }
    }
  }

  _OptimizedCarouselImage _optimizeCarouselImage({
    required Uint8List bytes,
    required String originalFileName,
  }) {
    final lowerName = originalFileName.toLowerCase();
    final isGif = lowerName.endsWith('.gif');

    // Keep GIFs untouched to avoid breaking animation frames.
    if (isGif) {
      return _OptimizedCarouselImage(bytes: bytes, fileName: originalFileName);
    }

    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      return _OptimizedCarouselImage(bytes: bytes, fileName: originalFileName);
    }

    const maxDimension = 1920;
    final width = decoded.width;
    final height = decoded.height;

    img.Image working = decoded;
    final needsResize = width > maxDimension || height > maxDimension;
    if (needsResize) {
      if (width >= height) {
        working = img.copyResize(
          decoded,
          width: maxDimension,
          interpolation: img.Interpolation.average,
        );
      } else {
        working = img.copyResize(
          decoded,
          height: maxDimension,
          interpolation: img.Interpolation.average,
        );
      }
    }

    final isPng = lowerName.endsWith('.png');
    if (isPng) {
      final encoded = Uint8List.fromList(img.encodePng(working, level: 6));
      final finalName = _replaceFileExtension(originalFileName, 'png');
      return _OptimizedCarouselImage(bytes: encoded, fileName: finalName);
    }

    final encoded = Uint8List.fromList(img.encodeJpg(working, quality: 82));
    final finalName = _replaceFileExtension(originalFileName, 'jpg');
    return _OptimizedCarouselImage(bytes: encoded, fileName: finalName);
  }

  String _replaceFileExtension(String fileName, String extension) {
    final normalizedExtension = extension.startsWith('.')
        ? extension.substring(1)
        : extension;
    final dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return '$fileName.$normalizedExtension';
    }
    return '${fileName.substring(0, dotIndex)}.$normalizedExtension';
  }

  Future<void> _approveLegacyRequest(LegacyMembershipRequestModel request) async {
    final requestId = request.id;
    if (requestId == null || requestId.isEmpty) {
      _showMessage('Richiesta legacy non valida.', isError: true);
      return;
    }

    try {
      final approvedNumber = await SupabaseService.instance
          .approveLegacyMembershipRequest(requestId: requestId);
      if (mounted) {
        setState(_refreshMemberStreams);
      }
      await _loadNextMembershipPreview(forceRefresh: true);
      _showMessage(
        approvedNumber == null
            ? 'Richiesta legacy approvata.'
            : 'Richiesta legacy approvata. Tessera confermata: $approvedNumber',
      );
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] approveLegacyRequest error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _rejectLegacyRequest(LegacyMembershipRequestModel request) async {
    final requestId = request.id;
    if (requestId == null || requestId.isEmpty) {
      _showMessage('Richiesta legacy non valida.', isError: true);
      return;
    }

    try {
      await SupabaseService.instance.rejectLegacyMembershipRequest(
        requestId: requestId,
      );
      if (mounted) {
        setState(_refreshMemberStreams);
      }
      _showMessage('Richiesta legacy rifiutata.');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] rejectLegacyRequest error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
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
      String? assignedMembershipNumber;

      if (status == 'approved') {
        assignedMembershipNumber = await SupabaseService.instance
            .approveMemberAndAssignMembershipNumber(memberId: memberId);
      } else {
        await SupabaseService.instance.updateMemberStatus(
          memberId: memberId,
          status: status,
        );
      }

      if (mounted) {
        setState(_refreshMemberStreams);
      }
      await _loadNextMembershipPreview(forceRefresh: true);
      _showMessage(
        status == 'approved'
            ? assignedMembershipNumber == null
                  ? 'Socio approvato correttamente'
                  : 'Socio approvato. Numero tessera assegnato: $assignedMembershipNumber'
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
    final luogoNascitaController = TextEditingController(
      text: member.luogoNascita,
    );
    final dataNascitaController = TextEditingController(
      text: member.birthDateLabel == '-' ? '' : member.birthDateLabel,
    );
    final residenzaController = TextEditingController(text: member.residenza);
    final comuneController = TextEditingController(text: member.comune);
    final capController = TextEditingController(text: member.cap);
    final emailController = TextEditingController(text: member.email);
    final telefonoController = TextEditingController(text: member.telefono);
    var selectedBirthDate = member.dataNascita;
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

            Future<void> selectBirthDate() async {
              final now = DateUtils.dateOnly(DateTime.now());
              final fallbackDate = DateTime(now.year - 18, now.month, now.day);
              final pickedDate = await showDatePicker(
                context: dialogContext,
                initialDate: selectedBirthDate ?? fallbackDate,
                firstDate: DateTime(1900),
                lastDate: now,
                locale: const Locale('it', 'IT'),
              );

              if (pickedDate == null) {
                return;
              }

              setDialogState(() {
                selectedBirthDate = DateUtils.dateOnly(pickedDate);
                dataNascitaController.text = DateFormat(
                  'dd/MM/yyyy',
                  'it_IT',
                ).format(selectedBirthDate!);
              });
            }

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
                                  initialValue: member.membershipNumberLabel,
                                  readOnly: true,
                                  enabled: false,
                                  decoration: const InputDecoration(
                                    labelText: 'Numero tessera',
                                  ),
                                ),
                              ),
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
                                  controller: luogoNascitaController,
                                  decoration: const InputDecoration(
                                    labelText: 'Luogo di nascita',
                                  ),
                                  validator: (value) => _validateRequired(
                                    value,
                                    'Luogo di nascita',
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: dataNascitaController,
                                  readOnly: true,
                                  onTap: selectBirthDate,
                                  decoration: const InputDecoration(
                                    labelText: 'Data di nascita',
                                    prefixIcon: Icon(Icons.event_outlined),
                                  ),
                                  validator: (value) => _validateRequired(
                                    value,
                                    'Data di nascita',
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: residenzaController,
                                  decoration: const InputDecoration(
                                    labelText: 'Residenza',
                                  ),
                                  validator: (value) =>
                                      _validateRequired(value, 'Residenza'),
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: comuneController,
                                  decoration: const InputDecoration(
                                    labelText: 'Comune',
                                  ),
                                  validator: (value) =>
                                      _validateRequired(value, 'Comune'),
                                ),
                              ),
                              SizedBox(
                                width: fieldWidth,
                                child: TextFormField(
                                  controller: capController,
                                  decoration: const InputDecoration(
                                    labelText: 'CAP',
                                  ),
                                  validator: _validateCap,
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
                                      luogoNascita: luogoNascitaController.text
                                          .trim(),
                                      dataNascita: selectedBirthDate,
                                      residenza: residenzaController.text
                                          .trim(),
                                      comune: comuneController.text.trim(),
                                      cap: capController.text.trim(),
                                      email: emailController.text
                                          .trim()
                                          .toLowerCase(),
                                      telefono: telefonoController.text.trim(),
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

    // Delay disposal so dialog transition/rebuilds cannot touch disposed controllers.
    Future<void>.delayed(const Duration(milliseconds: 300), () {
      nomeController.dispose();
      cognomeController.dispose();
      luogoNascitaController.dispose();
      dataNascitaController.dispose();
      residenzaController.dispose();
      comuneController.dispose();
      capController.dispose();
      emailController.dispose();
      telefonoController.dispose();
    });

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

  Future<void> _exportMemberPdf(MemberModel member) async {
    try {
      await PdfService.instance.exportMemberForm(member);
      _showMessage('PDF generato per ${member.fullName}');
    } catch (error, stackTrace) {
      debugPrint('[AdminDashboard] exportMemberPdf error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _showMessage(_formatError(error), isError: true);
    }
  }

  Future<void> _deleteMember(MemberModel member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Archivia socio'),
          content: Text(
            'Vuoi archiviare ${member.fullName}? Il record verrà conservato nel database e il numero tessera ${member.membershipNumberLabel} non sarà più riutilizzato.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Annulla'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Archivia'),
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
      _showMessage('Socio archiviato correttamente');
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

  String? _validateCap(String? value) {
    final requiredMessage = _validateRequired(value, 'CAP');
    if (requiredMessage != null) {
      return requiredMessage;
    }

    if (!RegExp(r'^\d{5}$').hasMatch(value!.trim())) {
      return 'Il CAP deve avere 5 cifre';
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

  Future<void> _saveThemeColor(Color color) async {
    AppThemeController.setSeedColor(color);

    if (!widget.supabaseConfigured) {
      return;
    }

    try {
      await SupabaseService.instance.saveThemeSeedColorHex(
        AppThemeController.colorToHex(color),
      );
      _showMessage('Tema salvato in modo persistente.');
    } catch (error) {
      _showMessage(
        'Tema applicato localmente, ma non salvato su Supabase. Crea la tabella app_settings e le policy indicate.',
        isError: true,
      );
    }
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
    final topBarIconColor = Theme.of(context).colorScheme.primary;
    final title = !isAuthenticated
        ? 'Dashboard Admin'
        : _selectedView == _AdminView.dashboard
        ? 'Area Admin · Home'
        : _selectedView == _AdminView.search
        ? 'Area Admin · Ricerca'
        : 'Area Admin · Carosello';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        iconTheme: IconThemeData(color: topBarIconColor),
        actionsIconTheme: IconThemeData(color: topBarIconColor),
        actions: <Widget>[
          if (isAuthenticated)
            IconButton(
              tooltip: 'Home admin',
              onPressed: () {
                setState(() {
                  _selectedView = _AdminView.dashboard;
                });
              },
              icon: const Icon(Icons.home_outlined),
            ),
          if (isAuthenticated)
            IconButton(
              tooltip: 'Ricerca soci',
              onPressed: () {
                setState(() {
                  _selectedView = _AdminView.search;
                });
              },
              icon: const Icon(Icons.search_outlined),
            ),
          if (isAuthenticated)
            IconButton(
              tooltip: 'Gestione carosello',
              onPressed: () {
                setState(() {
                  _selectedView = _AdminView.carousel;
                });
              },
              icon: const Icon(Icons.view_carousel_outlined),
            ),
          if (isAuthenticated) _buildThemeMenuButton(),
          if (isAuthenticated)
            IconButton(
              tooltip: 'Impostazioni amministratore',
              onPressed: _openAdminSettingsDialog,
              icon: const Icon(Icons.settings_outlined),
            ),
          IconButton(
            tooltip: 'Vai alla pagina registrazione',
            onPressed: () => Navigator.pushNamed(context, '/'),
            icon: const Icon(Icons.how_to_reg_outlined),
          ),
          if (isAuthenticated)
            IconButton(
              tooltip: 'Esci',
              onPressed: _signOut,
              icon: const Icon(Icons.logout_outlined),
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

          if (!_membershipStartLoaded && !_isLoadingMembershipStart) {
            Future<void>.microtask(_loadMembershipStartNumber);
          }
          if (_nextMembershipPreview == null && !_isLoadingNextMembershipPreview) {
            Future<void>.microtask(_loadNextMembershipPreview);
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
                    : _selectedView == _AdminView.search
                    ? _buildSearchPage(isDesktop: isDesktop)
                    : _buildCarouselPage(),
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

  String _colorToHex8(Color color) {
    return '#${color.toARGB32().toRadixString(16).padLeft(8, '0').toUpperCase()}';
  }

  Future<void> _openThemeColorDialog() async {
    var selectedColor = AppThemeController.seedColor.value;

    final pickedColor = await showDialog<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Scegli il colore'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    ColorPicker(
                      pickerColor: selectedColor,
                      onColorChanged: (color) {
                        setDialogState(() {
                          selectedColor = color;
                        });
                      },
                      enableAlpha: true,
                      displayThumbColor: true,
                      paletteType: PaletteType.hueWheel,
                      pickerAreaBorderRadius: const BorderRadius.all(
                        Radius.circular(12),
                      ),
                      hexInputBar: true,
                      labelTypes: const <ColorLabelType>[
                        ColorLabelType.hex,
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Valore corrente: ${_colorToHex8(selectedColor)}',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Annulla'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selectedColor),
                  child: const Text('Applica'),
                ),
              ],
            );
          },
        );
      },
    );

    if (pickedColor == null) {
      return;
    }

    await _saveThemeColor(pickedColor);
  }

  Widget _buildThemeMenuButton() {
    return IconButton(
      tooltip: 'Selettore colore',
      onPressed: _openThemeColorDialog,
      icon: const Icon(Icons.palette_outlined),
    );
  }

  Future<void> _openAdminSettingsDialog() async {
    await _loadMembershipStartNumber(forceRefresh: true);
    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Impostazioni amministratore'),
              content: SizedBox(
                width: 360,
                child: TextField(
                  controller: _membershipStartController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Numero iniziale tesseramento',
                    hintText: 'es. 1101',
                  ),
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Chiudi'),
                ),
                FilledButton.icon(
                  onPressed: _isSavingMembershipStart
                      ? null
                      : () async {
                          final saved = await _saveMembershipStartNumber();
                          if (!dialogContext.mounted) {
                            return;
                          }
                          if (saved) {
                            Navigator.of(dialogContext).pop();
                          } else {
                            setDialogState(() {});
                          }
                        },
                  icon: _isSavingMembershipStart
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: const Text('Salva'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildHomePage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _buildActiveMembersOverview(),
        const SizedBox(height: 16),
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
        _buildLegacyRequestsSection(),
        const SizedBox(height: 16),
        _buildMembersSection(
          title: 'Ultimi associati',
          description: 'Ultimi 30 soci confermati registrati più di recente.',
          stream: _approvedMembersStream,
          emptyMessage: 'Nessun socio confermato trovato.',
          approvedSection: true,
          transformMembers: _latestApprovedMembers,
          showCountChip: false,
        ),
      ],
    );
  }

  Widget _buildCarouselPage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _buildLandingMediaSettingsCard(),
      ],
    );
  }

  Widget _buildActiveMembersOverview() {
    return StreamBuilder<List<MemberModel>>(
      stream: _approvedMembersStream,
      builder: (context, snapshot) {
        final predictedLastMembership = _nextMembershipPreview == null
            ? null
            : math.max(0, _nextMembershipPreview! - 1);

        return SizedBox(
          width: double.infinity,
          child: Card(
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: <Widget>[
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'Soci attivi totali',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Monitoraggio rapido del tesseramento e dell\'ultimo numero previsto.',
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF5EA),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          _isLoadingNextMembershipPreview
                              ? '...'
                              : (predictedLastMembership?.toString() ?? '-'),
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
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

  Widget _buildLandingMediaSettingsCard() {
    return SizedBox(
      width: double.infinity,
      child: Card(
        elevation: 0,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Home pubblica: carosello e Instagram',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Carica immagini per il carosello della home, imposta velocita e dimensione, e salva il link Instagram.',
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  FilledButton.icon(
                    onPressed: _isUploadingCarouselImages
                        ? null
                        : _pickAndUploadCarouselImages,
                    icon: _isUploadingCarouselImages
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.add_photo_alternate_outlined),
                    label: const Text('Seleziona immagini'),
                  ),
                  TextButton.icon(
                    onPressed: _isLoadingLandingMedia
                        ? null
                        : () => _loadLandingMediaSettings(forceRefresh: true),
                    icon: const Icon(Icons.refresh_outlined),
                    label: const Text('Ricarica'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_carouselImageUrls.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F8F6),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: const Text(
                    'Nessuna immagine selezionata.',
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: CarouselSlider.builder(
                    key: ValueKey<String>(
                      '${_carouselImageUrls.length}-${_carouselPreviewSpeedSeconds.toStringAsFixed(1)}-${_carouselPreviewHeight.toStringAsFixed(0)}-${_carouselVisibleItems.toStringAsFixed(0)}',
                    ),
                    itemCount: _carouselImageUrls.length,
                    itemBuilder: (context, index, realIndex) {
                      return SizedBox.expand(
                        child: Image.network(
                          _carouselImageUrls[index],
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              color: Colors.grey.shade200,
                              alignment: Alignment.center,
                              child: const Text('Immagine non disponibile'),
                            );
                          },
                        ),
                      );
                    },
                    options: CarouselOptions(
                      height: _carouselPreviewHeight,
                      initialPage: 0,
                      viewportFraction: _carouselImageUrls.length > 1
                          ? (1 / _carouselVisibleItems).clamp(0.28, 1).toDouble()
                          : 1,
                      padEnds: true,
                      autoPlay: _carouselImageUrls.length > 1,
                      autoPlayInterval: Duration(
                        milliseconds: (_carouselPreviewSpeedSeconds * 1000)
                            .round(),
                      ),
                      autoPlayAnimationDuration: const Duration(
                        milliseconds: 650,
                      ),
                      enlargeCenterPage: _carouselImageUrls.length > 1,
                      enlargeFactor: _carouselImageUrls.length > 1 ? 0.34 : 0,
                      enlargeStrategy: CenterPageEnlargeStrategy.zoom,
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final controlWidth = constraints.maxWidth >= 980
                      ? (constraints.maxWidth - 24) / 3
                      : constraints.maxWidth;

                  return Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: <Widget>[
                      SizedBox(
                        width: controlWidth,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text.rich(
                              TextSpan(
                                text: 'Velocita: ',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                                children: <InlineSpan>[
                                  TextSpan(
                                    text: '${_carouselPreviewSpeedSeconds.toStringAsFixed(1)} s',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                overlayShape: SliderComponentShape.noOverlay,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 7,
                                ),
                              ),
                              child: Slider(
                                value: _carouselPreviewSpeedSeconds,
                                min: 1,
                                max: 10,
                                divisions: 18,
                                label: '${_carouselPreviewSpeedSeconds.toStringAsFixed(1)} s',
                                onChanged: (value) {
                                  setState(() {
                                    _carouselPreviewSpeedSeconds = value;
                                  });
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: controlWidth,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text.rich(
                              TextSpan(
                                text: 'Altezza: ',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                                children: <InlineSpan>[
                                  TextSpan(
                                    text: '${_carouselPreviewHeight.toStringAsFixed(0)} px',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                overlayShape: SliderComponentShape.noOverlay,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 7,
                                ),
                              ),
                              child: Slider(
                                value: _carouselPreviewHeight,
                                min: 140,
                                max: 520,
                                divisions: 38,
                                label: '${_carouselPreviewHeight.toStringAsFixed(0)} px',
                                onChanged: (value) {
                                  setState(() {
                                    _carouselPreviewHeight = value;
                                  });
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: controlWidth,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text.rich(
                              TextSpan(
                                text: 'Immagini visibili: ',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                                children: <InlineSpan>[
                                  TextSpan(
                                    text: _carouselVisibleItems.toStringAsFixed(0),
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                overlayShape: SliderComponentShape.noOverlay,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 7,
                                ),
                              ),
                              child: Slider(
                                value: _carouselVisibleItems,
                                min: 1,
                                max: 4,
                                divisions: 3,
                                label: _carouselVisibleItems.toStringAsFixed(0),
                                onChanged: (value) {
                                  setState(() {
                                    _carouselVisibleItems = value.roundToDouble();
                                  });
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 6),
              FilledButton.icon(
                onPressed: _isSavingLandingMedia ? null : _saveLandingMediaSettings,
                icon: _isSavingLandingMedia
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save_outlined),
                label: const Text('Salva configurazione home'),
              ),
              const SizedBox(height: 20),
              const Divider(height: 1),
              const SizedBox(height: 14),
              const Text(
                'Link Instagram',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _instagramUrlController,
                decoration: const InputDecoration(
                  labelText: 'Link profilo Instagram',
                  hintText: 'https://www.instagram.com/tuo_profilo/',
                  prefixIcon: Icon(Icons.camera_alt_outlined),
                ),
              ),
              const SizedBox(height: 20),
              const Divider(height: 1),
              const SizedBox(height: 14),
              const Text(
                'Lista file carosello',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Ordina immagini (drag-and-drop) o elimina singole slide',
              ),
              const SizedBox(height: 8),
              if (_carouselImageUrls.isNotEmpty)
                SizedBox(
                  height: math.min(
                    300,
                    (_carouselImageUrls.length * 66 + 10).toDouble(),
                  ),
                  child: ReorderableListView.builder(
                    itemCount: _carouselImageUrls.length,
                    buildDefaultDragHandles: false,
                    onReorder: (oldIndex, newIndex) {
                      setState(() {
                        final items = List<String>.from(_carouselImageUrls);
                        if (newIndex > oldIndex) {
                          newIndex -= 1;
                        }
                        final moved = items.removeAt(oldIndex);
                        items.insert(newIndex, moved);
                        _carouselImageUrls = items;
                      });
                    },
                    itemBuilder: (context, index) {
                      final imageUrl = _carouselImageUrls[index];
                      return Card(
                        key: ValueKey<String>('carousel-$index-$imageUrl'),
                        margin: const EdgeInsets.symmetric(vertical: 3),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 2,
                          ),
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.network(
                              imageUrl,
                              width: 44,
                              height: 44,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return Container(
                                  width: 44,
                                  height: 44,
                                  color: Colors.grey.shade300,
                                  alignment: Alignment.center,
                                  child: const Icon(Icons.broken_image_outlined),
                                );
                              },
                            ),
                          ),
                          title: Text(
                            'Slide ${index + 1}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text(
                            imageUrl,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: Wrap(
                            spacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: <Widget>[
                              IconButton(
                                tooltip: 'Elimina slide',
                                onPressed: () => _removeCarouselImageAt(index),
                                icon: const Icon(Icons.delete_outline),
                              ),
                              ReorderableDragStartListener(
                                index: index,
                                child: const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 6),
                                  child: Icon(Icons.drag_indicator_outlined),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                )
              else
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F8F6),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: const Text(
                    'Nessun file in lista.',
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
      ),
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
                            'Tessera, nome, cognome, nascita, residenza, comune, CAP, email, telefono o data',
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
                                    controller: _luogoNascitaFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Luogo di nascita',
                                      prefixIcon: Icon(Icons.place_outlined),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _dataNascitaFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Data di nascita',
                                      prefixIcon: Icon(Icons.event_outlined),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _residenzaFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Residenza',
                                      prefixIcon: Icon(Icons.home_outlined),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _comuneFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'Comune',
                                      prefixIcon: Icon(
                                        Icons.location_city_outlined,
                                      ),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  width: advancedWidth,
                                  child: TextField(
                                    controller: _capFilterController,
                                    decoration: const InputDecoration(
                                      labelText: 'CAP',
                                      prefixIcon: Icon(
                                        Icons.markunread_mailbox_outlined,
                                      ),
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
              initialUnfilteredLimit: 30,
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

  ScrollController _getTableScrollController({
    required bool approvedSection,
    required bool mixedStatuses,
  }) {
    if (mixedStatuses) {
      return _searchTableScrollController;
    }

    return approvedSection
        ? _approvedTableScrollController
        : _pendingTableScrollController;
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
    bool showCountChip = true,
    int? initialUnfilteredLimit,
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
                final filteredMembers = applySearchFilters
                  ? _filterMembers(transformedMembers)
                  : transformedMembers;
                final shouldApplyInitialLimit =
                  applySearchFilters &&
                  initialUnfilteredLimit != null &&
                  !_hasActiveSearchFilters();
                final members = shouldApplyInitialLimit
                  ? filteredMembers.take(initialUnfilteredLimit).toList()
                  : filteredMembers;

              return LayoutBuilder(
                builder: (context, constraints) {
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
                              if (showCountChip)
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
                      else
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: <Widget>[
                                Icon(
                                  Icons.open_with_outlined,
                                  size: 16,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                                const Text(
                                  'Trascina il separatore nelle intestazioni per ridimensionare le colonne.',
                                ),
                                TextButton(
                                  onPressed: _resetColumnWidths,
                                  child: const Text('Ripristina larghezze'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            _buildMembersTable(
                              members,
                              approvedSection: approvedSection,
                              mixedStatuses: mixedStatuses,
                              scrollController: _getTableScrollController(
                                approvedSection: approvedSection,
                                mixedStatuses: mixedStatuses,
                              ),
                            ),
                          ],
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

  Widget _buildLegacyRequestsSection() {
    return SizedBox(
      width: double.infinity,
      child: Card(
        elevation: 0,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: StreamBuilder<List<LegacyMembershipRequestModel>>(
            stream: _pendingLegacyRequestsStream,
            builder: (context, snapshot) {
              final requests = snapshot.data ??
                  const <LegacyMembershipRequestModel>[];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: <Widget>[
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            'Richieste vecchie tessere',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Coda separata: nessun salvataggio in soci fino all\'approvazione admin.',
                          ),
                        ],
                      ),
                      _CounterChip(count: requests.length, label: 'legacy pending'),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (snapshot.connectionState == ConnectionState.waiting)
                    const Center(child: CircularProgressIndicator())
                  else if (requests.isEmpty)
                    _buildEmptyState('Nessuna richiesta legacy in pending.')
                  else
                    Column(
                      children: requests.map((request) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAF7),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: Wrap(
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
                                      'Tessera ${request.numeroTessera} · ${request.fullName}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${request.email} · ${request.telefono} · richiesta ${request.createdAtLabel}',
                                    ),
                                  ],
                                ),
                              ),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: <Widget>[
                                  FilledButton.icon(
                                    onPressed: () => _approveLegacyRequest(request),
                                    icon: const Icon(Icons.check_circle_outline),
                                    label: const Text('Approva'),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: () => _rejectLegacyRequest(request),
                                    icon: const Icon(Icons.close_outlined),
                                    label: const Text('Rifiuta'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                ],
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
    required ScrollController scrollController,
    bool mixedStatuses = false,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final theme = Theme.of(context);
        final gridBorderColor = Colors.blueGrey.shade100;
        final outerBorderColor = Colors.blueGrey.shade200;
        final headerBackground = const Color(0xFFF2F6FA);
        final evenRowBackground = Colors.white;
        final oddRowBackground = const Color(0xFFFAFCFF);
        const hoveredRowBackground = Color(0xFFE9F2FF);
        const selectedRowBackground = Color(0xFFD7E9FF);
        const sortedColumnBackground = Color(0xFFEEF5FF);

        final visibleColumnKeys = <String>[
          'membership',
          'name',
          'birth',
          'residence',
          'email',
          'phone',
          if (mixedStatuses) 'status',
          'date',
          'actions',
        ];
        final minimumTableWidth =
            visibleColumnKeys.fold<double>(
              0,
              (total, key) => total + _columnWidth(key),
            ) +
            ((visibleColumnKeys.length - 1) * 24.0) +
            24.0;
        final tableWidth = math.max(constraints.maxWidth, minimumTableWidth);

        String membershipLabelForRow(MemberModel member, int rowIndex) {
          if (!approvedSection && !mixedStatuses) {
            final currentValue = member.numeroTessera.trim();
            final isLegacyPlaceholder = RegExp(
              r'^APP[\w-]*$',
              caseSensitive: false,
            ).hasMatch(currentValue);

            if (currentValue.isEmpty || isLegacyPlaceholder) {
              if (_nextMembershipPreview != null) {
                return (_nextMembershipPreview! + rowIndex).toString();
              }
              return 'Da assegnare';
            }
          }

          return member.membershipNumberLabel;
        }

        int compareByKey(MemberModel a, MemberModel b, String key) {
          int compareString(String first, String second) =>
              first.toLowerCase().compareTo(second.toLowerCase());

          int parseMembership(MemberModel member) {
            final parsed = int.tryParse(member.numeroTessera.trim());
            if (parsed != null) {
              return parsed;
            }
            return -1;
          }

          switch (key) {
            case 'membership':
              return parseMembership(a).compareTo(parseMembership(b));
            case 'name':
              return compareString(a.fullName, b.fullName);
            case 'birth':
              return compareString(a.birthPlaceAndDateLabel, b.birthPlaceAndDateLabel);
            case 'residence':
              return compareString(a.residenceLabel, b.residenceLabel);
            case 'email':
              return compareString(a.email, b.email);
            case 'phone':
              return compareString(a.telefono, b.telefono);
            case 'status':
              return compareString(a.stato, b.stato);
            case 'date':
              return (a.createdAt ?? DateTime(1900)).compareTo(
                b.createdAt ?? DateTime(1900),
              );
            default:
              return 0;
          }
        }

        final sortedMembers = members.toList()
          ..sort((first, second) {
            final result = compareByKey(first, second, _sortColumnKey);
            return _sortAscending ? result : -result;
          });

        DataColumn buildSortableColumn(String label, String columnKey) {
          return DataColumn(
            label: _buildResizableHeader(
              label,
              columnKey,
              isSorted: _highlightedColumnKey == columnKey,
              onSortTap: () => _toggleSortColumn(columnKey),
            ),
          );
        }

        Color resolveRowColor(Set<WidgetState> states, int index) {
          if (states.contains(WidgetState.selected)) {
            return selectedRowBackground;
          }
          if (states.contains(WidgetState.hovered)) {
            return hoveredRowBackground;
          }
          return index.isEven ? evenRowBackground : oddRowBackground;
        }

        bool isSortedColumn(String columnKey) =>
          _highlightedColumnKey == columnKey;

        Widget wrapCellHighlight({
          required String columnKey,
          required Widget child,
        }) {
          if (!isSortedColumn(columnKey)) {
            return child;
          }

          return Container(
            color: sortedColumnBackground,
            child: child,
          );
        }

        return TapRegion(
          onTapOutside: (_) => _clearTableHighlights(),
          child: Scrollbar(
            controller: scrollController,
            thumbVisibility: true,
            trackVisibility: true,
            interactive: true,
            notificationPredicate: (notification) =>
                notification.metrics.axis == Axis.horizontal,
            child: SingleChildScrollView(
              controller: scrollController,
              scrollDirection: Axis.horizontal,
              primary: false,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: tableWidth),
                child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: outerBorderColor),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: DataTableTheme(
                    data: DataTableThemeData(
                      headingRowColor: WidgetStatePropertyAll<Color>(
                        headerBackground,
                      ),
                      headingTextStyle: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                        color: const Color(0xFF1B2A3A),
                      ),
                      dividerThickness: 1,
                    ),
                    child: DataTable(
                      showCheckboxColumn: false,
                      horizontalMargin: 10,
                      columnSpacing: 12,
                      headingRowHeight: 52,
                      dataRowMinHeight: 56,
                      dataRowMaxHeight: 64,
                      border: TableBorder(
                        top: BorderSide(color: outerBorderColor),
                        left: BorderSide(color: outerBorderColor),
                        right: BorderSide(color: outerBorderColor),
                        bottom: BorderSide(color: outerBorderColor),
                        horizontalInside: BorderSide(color: gridBorderColor),
                        verticalInside: BorderSide(color: gridBorderColor),
                      ),
                      columns: <DataColumn>[
                        buildSortableColumn('Tessera', 'membership'),
                        buildSortableColumn('Nome', 'name'),
                        buildSortableColumn('Nascita', 'birth'),
                        buildSortableColumn('Residenza', 'residence'),
                        buildSortableColumn('Email', 'email'),
                        buildSortableColumn('Telefono', 'phone'),
                        if (mixedStatuses)
                          buildSortableColumn('Stato', 'status'),
                        buildSortableColumn('Data', 'date'),
                        DataColumn(
                          label: _buildResizableHeader(
                            'Azioni',
                            'actions',
                            isSorted: false,
                          ),
                        ),
                      ],
                      rows: List<DataRow>.generate(sortedMembers.length, (
                        index,
                      ) {
                        final member = sortedMembers[index];

                        return DataRow.byIndex(
                          index: index,
                          selected:
                              member.id != null && _selectedMemberId == member.id,
                          onSelectChanged: (_) {
                            final memberId = member.id;
                            if (memberId == null) {
                              return;
                            }
                            setState(() {
                              _selectedMemberId =
                                  _selectedMemberId == memberId
                                  ? null
                                  : memberId;
                            });
                          },
                          color: WidgetStateProperty.resolveWith<Color>(
                            (states) => resolveRowColor(states, index),
                          ),
                          cells: <DataCell>[
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'membership',
                                child: _buildTableTextCell(
                                  membershipLabelForRow(member, index),
                                  columnKey: 'membership',
                                  maxLines: 1,
                                ),
                              ),
                            ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'name',
                                child: _buildTableTextCell(
                                  member.fullName,
                                  columnKey: 'name',
                                ),
                              ),
                            ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'birth',
                                child: _buildTableTextCell(
                                  member.birthPlaceAndDateLabel,
                                  columnKey: 'birth',
                                ),
                              ),
                            ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'residence',
                                child: _buildTableTextCell(
                                  member.residenceLabel,
                                  columnKey: 'residence',
                                ),
                              ),
                            ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'email',
                                child: _buildTableTextCell(
                                  member.email,
                                  columnKey: 'email',
                                ),
                              ),
                            ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'phone',
                                child: _buildTableTextCell(
                                  member.telefono,
                                  columnKey: 'phone',
                                  maxLines: 1,
                                ),
                              ),
                            ),
                            if (mixedStatuses)
                              DataCell(
                                wrapCellHighlight(
                                  columnKey: 'status',
                                  child: SizedBox(
                                    width: _columnWidth('status'),
                                    child: Align(
                                      alignment: Alignment.centerLeft,
                                      child: Tooltip(
                                        message: member.stato,
                                        child: Icon(
                                          Icons.circle,
                                          size: 12,
                                          color: switch (
                                            member.stato.trim().toLowerCase()
                                          ) {
                                            'approved' => Colors.green.shade700,
                                            'deleted' => Colors.red.shade700,
                                            'rejected' => Colors.black,
                                            _ => Colors.blueGrey.shade500,
                                          },
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            DataCell(
                              wrapCellHighlight(
                                columnKey: 'date',
                                child: _buildTableTextCell(
                                  member.createdAtLabel,
                                  columnKey: 'date',
                                  maxLines: 1,
                                ),
                              ),
                            ),
                            DataCell(
                              SizedBox(
                                width: _columnWidth('actions'),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: _buildActionButtons(
                                    member,
                                    approvedSection: approvedSection,
                                    mixedStatuses: mixedStatuses,
                                    compact: true,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      }),
                    ),
                  ),
                ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildResizableHeader(
    String label,
    String columnKey, {
    required bool isSorted,
    VoidCallback? onSortTap,
  }) {
    return SizedBox(
      width: _columnWidth(columnKey),
      child: Row(
        children: <Widget>[
          Expanded(
            child: InkWell(
              onTap: onSortTap,
              borderRadius: BorderRadius.circular(4),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
                decoration: isSorted
                    ? BoxDecoration(
                        color: const Color(0xFFDCEBFF),
                        borderRadius: BorderRadius.circular(4),
                      )
                    : null,
                child: Text(
                  label.toUpperCase(),
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    letterSpacing: 0.35,
                    color: isSorted ? const Color(0xFF0D3A73) : null,
                  ),
                ),
              ),
            ),
          ),
          Tooltip(
            message:
                'Trascina il bordo destro per ridimensionare · doppio click per ripristinare',
            child: MouseRegion(
              cursor: SystemMouseCursors.resizeLeftRight,
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onHorizontalDragUpdate: (details) =>
                    _resizeColumn(columnKey, details.delta.dx),
                onDoubleTap: () => _resetColumnWidth(columnKey),
                child: const SizedBox(width: 6, height: 24),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableTextCell(
    String value, {
    required String columnKey,
    int maxLines = 1,
  }) {
    return SizedBox(
      width: _columnWidth(columnKey),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Text(
          value,
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13.2, height: 1.24),
        ),
      ),
    );
  }

  Widget _buildCompactActionIcon({
    required String tooltip,
    required VoidCallback onPressed,
    required IconData icon,
  }) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 32, height: 32),
      padding: EdgeInsets.zero,
      splashRadius: 18,
      iconSize: 18,
      icon: Icon(icon),
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
        return Wrap(
          spacing: 2,
          runSpacing: 2,
          children: <Widget>[
            _buildCompactActionIcon(
              tooltip: 'Modifica socio',
              onPressed: () => _editMember(member),
              icon: Icons.edit_outlined,
            ),
            _buildCompactActionIcon(
              tooltip: 'Genera PDF',
              onPressed: () => _exportMemberPdf(member),
              icon: Icons.picture_as_pdf_outlined,
            ),
            _buildCompactActionIcon(
              tooltip: 'Archivia socio',
              onPressed: () => _deleteMember(member),
              icon: Icons.delete_outline,
            ),
          ],
        );
      }

      return Wrap(
        spacing: 2,
        runSpacing: 2,
        children: <Widget>[
          _buildCompactActionIcon(
            tooltip: 'Genera PDF',
            onPressed: () => _exportMemberPdf(member),
            icon: Icons.picture_as_pdf_outlined,
          ),
          _buildCompactActionIcon(
            tooltip: 'Archivia socio',
            onPressed: () => _deleteMember(member),
            icon: Icons.delete_outline,
          ),
          _buildCompactActionIcon(
            tooltip: 'Approva richiesta',
            onPressed: () => _changeStatus(member, 'approved'),
            icon: Icons.check_circle_outline,
          ),
          _buildCompactActionIcon(
            tooltip: 'Rifiuta richiesta',
            onPressed: () => _changeStatus(member, 'rejected'),
            icon: Icons.close_outlined,
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
            onPressed: () => _exportMemberPdf(member),
            icon: const Icon(Icons.picture_as_pdf_outlined),
            label: const Text('PDF'),
          ),
          OutlinedButton.icon(
            onPressed: () => _deleteMember(member),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Archivia'),
          ),
        ],
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: <Widget>[
        OutlinedButton.icon(
          onPressed: () => _exportMemberPdf(member),
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('PDF'),
        ),
        OutlinedButton.icon(
          onPressed: () => _deleteMember(member),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Archivia'),
        ),
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

class _OptimizedCarouselImage {
  const _OptimizedCarouselImage({required this.bytes, required this.fileName});

  final Uint8List bytes;
  final String fileName;
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
