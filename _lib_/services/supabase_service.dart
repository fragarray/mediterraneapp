import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/legacy_membership_request_model.dart';
import '../models/member_model.dart';

class SupabaseService {
  SupabaseService._();

  static final SupabaseService instance = SupabaseService._();
  static const String _themeSettingKey = 'theme_seed_color';
  static const String _membershipStartSettingKey = 'membership_start_number';
  static const String _instagramUrlSettingKey = 'instagram_profile_url';
  static const String _landingCarouselSettingKey = 'landing_carousel_config';

  static const String _carouselStorageBucket = 'firme';

  static bool _configured = false;

  static void setConfigured(bool value) {
    _configured = value;
  }

  bool get isConfigured => _configured;

  void _logError(String context, Object error, StackTrace stackTrace) {
    debugPrint('[SupabaseService][$context] $error');
    debugPrintStack(stackTrace: stackTrace);
  }

  SupabaseClient get _client {
    if (!_configured) {
      throw StateError('Supabase non configurato.');
    }

    return Supabase.instance.client;
  }

  bool get isAuthenticated {
    if (!_configured) {
      return false;
    }

    return _client.auth.currentSession != null;
  }

  User? get currentUser => _configured ? _client.auth.currentUser : null;

  Stream<AuthState> get authChanges {
    if (!_configured) {
      return const Stream<AuthState>.empty();
    }

    return _client.auth.onAuthStateChange;
  }

  Future<void> signInAdmin({
    required String email,
    required String password,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase per accedere alla dashboard.');
    }

    final normalizedEmail = email.trim().toLowerCase();
    final hasLeadingOrTrailingSpaces = password != password.trim();
    final currentSession = _client.auth.currentSession;

    debugPrint(
      '[SupabaseService][signInAdmin] trying login for $normalizedEmail (passwordLength=${password.length}, hasTrimMismatch=$hasLeadingOrTrailingSpaces, currentSession=${currentSession != null})',
    );

    if (hasLeadingOrTrailingSpaces) {
      debugPrint(
        '[SupabaseService][signInAdmin] warning: the entered password has leading/trailing spaces.',
      );
    }

    try {
      final response = await _client.auth.signInWithPassword(
        email: normalizedEmail,
        password: password,
      );

      debugPrint(
        '[SupabaseService][signInAdmin] success user=${response.user?.email} confirmedAt=${response.user?.emailConfirmedAt} session=${response.session != null}',
      );
    } on AuthException catch (error, stackTrace) {
      _logError('signInAdmin(AuthException)', error, stackTrace);
      debugPrint(
        '[SupabaseService][signInAdmin] statusCode=${error.statusCode} code=${error.code} message=${error.message}',
      );
      if (error.code == 'invalid_credentials') {
        debugPrint(
          '[SupabaseService][signInAdmin] hint: verify exact email/password, enabled Email provider, confirmed user, and that this user belongs to the same Supabase project.',
        );
      }
      rethrow;
    } catch (error, stackTrace) {
      _logError('signInAdmin', error, stackTrace);
      rethrow;
    }
  }

  Future<void> signOutAdmin() async {
    if (!_configured) {
      return;
    }

    await _client.auth.signOut();
  }

  Future<void> submitRegistration({
    required MemberModel member,
    required Uint8List signatureBytes,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase prima di inviare le richieste.');
    }

    try {
      final signatureUrl = await uploadSignature(
        bytes: signatureBytes,
        email: member.email,
      );

      final payload = member.copyWith(firmaUrl: signatureUrl, stato: 'pending');

      await _client.from('soci').insert(payload.toInsertMap());
    } catch (error, stackTrace) {
      _logError('submitRegistration', error, stackTrace);
      debugPrint(
        '[SupabaseService][submitRegistration] email=${member.email} signatureBytes=${signatureBytes.length}',
      );
      rethrow;
    }
  }

  Future<String> uploadSignature({
    required Uint8List bytes,
    required String email,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase prima di caricare la firma.');
    }

    final sanitizedEmail = email
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    final fileName =
        '${sanitizedEmail}_${DateTime.now().millisecondsSinceEpoch}.png';

    try {
      await _client.storage
          .from('firme')
          .uploadBinary(
            fileName,
            bytes,
            fileOptions: const FileOptions(
              contentType: 'image/png',
              upsert: false,
            ),
          );
    } on StorageException catch (error, stackTrace) {
      _logError('uploadSignature(StorageException)', error, stackTrace);
      debugPrint(
        '[SupabaseService][uploadSignature] bucket=firme fileName=$fileName statusCode=${error.statusCode}',
      );
      throw Exception(
        'Upload firma fallito (${error.statusCode}). Verifica bucket "firme" e policy INSERT su storage.objects per ruolo anon. Dettaglio: ${error.message}',
      );
    } catch (error, stackTrace) {
      _logError('uploadSignature', error, stackTrace);
      debugPrint(
        '[SupabaseService][uploadSignature] bucket=firme fileName=$fileName',
      );
      rethrow;
    }

    return _client.storage.from('firme').getPublicUrl(fileName);
  }

  Future<String?> approveMemberAndAssignMembershipNumber({
    required String memberId,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase per approvare i soci.');
    }

    try {
      final maxBeforeApproval = await _getMaxAssignedMembershipNumber();

      final response = await _client.rpc(
        'approve_member_with_membership_number',
        params: <String, dynamic>{'p_member_id': memberId},
      );

      Future<String?> maybeFixReusedNumber(String? assignedRaw) async {
        final assigned = int.tryParse((assignedRaw ?? '').trim());
        if (assigned == null || maxBeforeApproval == null) {
          return assignedRaw;
        }

        // If returned number is <= previous historical max, it has been reused.
        if (assigned <= maxBeforeApproval) {
          final corrected = (maxBeforeApproval + 1).toString();
          await _client
              .from('soci')
              .update(<String, dynamic>{
                'numero_tessera': corrected,
                'stato': 'approved',
              })
              .eq('id', memberId);
          return corrected;
        }

        return assignedRaw;
      }

      if (response is int) {
        return maybeFixReusedNumber(response.toString());
      }

      if (response is num) {
        return maybeFixReusedNumber(response.toInt().toString());
      }

      if (response is String) {
        final membershipNumber = response.trim();
        if (membershipNumber.isEmpty) {
          return null;
        }
        return maybeFixReusedNumber(membershipNumber);
      }

      return null;
    } catch (error, stackTrace) {
      _logError('approveMemberAndAssignMembershipNumber', error, stackTrace);
      if (error is PostgrestException) {
        final message = error.message.trim();
        if (message.isNotEmpty) {
          throw Exception(message);
        }
      }
      throw Exception(
        'Approvazione non completata. Verifica la funzione Supabase approve_member_with_membership_number.',
      );
    }
  }

  Future<int?> getNextMembershipNumberPreview() async {
    if (!_configured) {
      return null;
    }

    try {
      final maxAssigned = await _getMaxAssignedMembershipNumber();
      if (maxAssigned != null) {
        return maxAssigned + 1;
      }

      final response = await _client.rpc('peek_next_membership_number');
      if (response is int) {
        return response;
      }
      if (response is num) {
        return response.toInt();
      }
      if (response is String) {
        return int.tryParse(response.trim());
      }
      return null;
    } catch (error, stackTrace) {
      _logError('getNextMembershipNumberPreview', error, stackTrace);
      return null;
    }
  }

  Future<bool> membershipNumberExists(String membershipNumber) async {
    if (!_configured) {
      return false;
    }

    final normalized = membershipNumber.trim();
    if (normalized.isEmpty) {
      return false;
    }

    try {
      final response = await _client
          .from('soci')
          .select('id')
          .eq('numero_tessera', normalized)
          .limit(1);

      return (response as List).isNotEmpty;
    } catch (error, stackTrace) {
      _logError('membershipNumberExists', error, stackTrace);
      rethrow;
    }
  }

  Future<bool> canRequestLegacyMembershipNumber(int membershipNumber) async {
    if (!_configured) {
      return false;
    }

    final startNumber = await getMembershipStartNumber();
    if (startNumber == null || startNumber <= 1) {
      return false;
    }

    if (membershipNumber >= startNumber) {
      return false;
    }

    final exists = await membershipNumberExists(membershipNumber.toString());
    if (exists) {
      return false;
    }

    final pendingResponse = await _client
        .from('legacy_membership_requests')
        .select('id')
        .eq('numero_tessera', membershipNumber.toString())
        .eq('stato', 'pending')
        .limit(1);

    return (pendingResponse as List).isEmpty;
  }

  Future<void> submitLegacyMembershipRequest({
    required LegacyMembershipRequestModel request,
    required Uint8List signatureBytes,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase prima di inviare le richieste.');
    }

    try {
      final signatureUrl = await uploadSignature(
        bytes: signatureBytes,
        email: request.email,
      );

      final payload = LegacyMembershipRequestModel(
        id: request.id,
        createdAt: request.createdAt,
        dataRegistrazioneTessera: request.dataRegistrazioneTessera,
        numeroTessera: request.numeroTessera,
        nome: request.nome,
        cognome: request.cognome,
        luogoNascita: request.luogoNascita,
        dataNascita: request.dataNascita,
        residenza: request.residenza,
        comune: request.comune,
        cap: request.cap,
        email: request.email,
        telefono: request.telefono,
        firmaUrl: signatureUrl,
        stato: 'pending',
        privacyAccepted: request.privacyAccepted,
      );

      await _client
          .from('legacy_membership_requests')
          .insert(payload.toInsertMap());
    } catch (error, stackTrace) {
      _logError('submitLegacyMembershipRequest', error, stackTrace);
      rethrow;
    }
  }

  Stream<List<LegacyMembershipRequestModel>>
  watchPendingLegacyMembershipRequests() {
    if (!_configured) {
      return Stream<List<LegacyMembershipRequestModel>>.value(
        const <LegacyMembershipRequestModel>[],
      );
    }

    return _client
        .from('legacy_membership_requests')
        .stream(primaryKey: <String>['id'])
        .order('created_at', ascending: false)
        .map(
          (rows) => rows
              .map(
                (row) => LegacyMembershipRequestModel.fromMap(
                  Map<String, dynamic>.from(row),
                ),
              )
              .where((request) => request.stato == 'pending')
              .toList(),
        );
  }

  Future<String?> approveLegacyMembershipRequest({
    required String requestId,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase per approvare le richieste legacy.');
    }

    try {
      final response = await _client.rpc(
        'approve_legacy_membership_request',
        params: <String, dynamic>{'p_request_id': requestId},
      );

      if (response is String) {
        final value = response.trim();
        return value.isEmpty ? null : value;
      }

      if (response is int) {
        return response.toString();
      }

      if (response is num) {
        return response.toInt().toString();
      }

      return null;
    } catch (error, stackTrace) {
      _logError('approveLegacyMembershipRequest', error, stackTrace);
      throw Exception(
        'Approvazione richiesta legacy non completata. Verifica la funzione Supabase approve_legacy_membership_request.',
      );
    }
  }

  Future<void> rejectLegacyMembershipRequest({
    required String requestId,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase per rifiutare le richieste legacy.');
    }

    try {
      await _client
          .from('legacy_membership_requests')
          .update(<String, dynamic>{
            'stato': 'rejected',
            'reviewed_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', requestId);
    } catch (error, stackTrace) {
      _logError('rejectLegacyMembershipRequest', error, stackTrace);
      rethrow;
    }
  }

  Future<int?> getMembershipStartNumber() async {
    if (!_configured) {
      return null;
    }

    try {
      final response = await _client
          .from('app_settings')
          .select('value')
          .eq('key', _membershipStartSettingKey)
          .maybeSingle();

      final rawValue = response?['value']?.toString().trim();
      if (rawValue == null || rawValue.isEmpty) {
        return null;
      }

      return int.tryParse(rawValue);
    } catch (error, stackTrace) {
      _logError('getMembershipStartNumber', error, stackTrace);
      return null;
    }
  }

  Future<void> saveMembershipStartNumber(int startNumber) async {
    if (!_configured) {
      throw StateError(
        'Configura Supabase per salvare il numero iniziale tessere.',
      );
    }

    if (startNumber <= 0) {
      throw StateError('Il numero iniziale deve essere maggiore di zero.');
    }

    try {
      await _client.from('app_settings').upsert(<String, dynamic>{
        'key': _membershipStartSettingKey,
        'value': startNumber.toString(),
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'key');
    } catch (error, stackTrace) {
      _logError('saveMembershipStartNumber', error, stackTrace);
      rethrow;
    }
  }

  Future<String?> getThemeSeedColorHex() async {
    if (!_configured) {
      return null;
    }

    try {
      final response = await _client
          .from('app_settings')
          .select('value')
          .eq('key', _themeSettingKey)
          .maybeSingle();

      if (response == null) {
        return null;
      }

      return response['value'] as String?;
    } catch (error, stackTrace) {
      _logError('getThemeSeedColorHex', error, stackTrace);
      return null;
    }
  }

  Future<void> saveThemeSeedColorHex(String hexColor) async {
    if (!_configured) {
      throw StateError('Configura Supabase per salvare il tema applicazione.');
    }

    try {
      await _client.from('app_settings').upsert(<String, dynamic>{
        'key': _themeSettingKey,
        'value': hexColor,
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'key');
    } catch (error, stackTrace) {
      _logError('saveThemeSeedColorHex', error, stackTrace);
      rethrow;
    }
  }

  Future<String?> getInstagramProfileUrl() async {
    if (!_configured) {
      return null;
    }

    try {
      final response = await _client
          .from('app_settings')
          .select('value')
          .eq('key', _instagramUrlSettingKey)
          .maybeSingle();

      final value = response?['value']?.toString().trim();
      if (value == null || value.isEmpty) {
        return null;
      }

      return value;
    } catch (error, stackTrace) {
      _logError('getInstagramProfileUrl', error, stackTrace);
      return null;
    }
  }

  Future<void> saveInstagramProfileUrl(String? url) async {
    if (!_configured) {
      throw StateError('Configura Supabase per salvare il link Instagram.');
    }

    final normalized = url?.trim() ?? '';

    try {
      await _client.from('app_settings').upsert(<String, dynamic>{
        'key': _instagramUrlSettingKey,
        'value': normalized,
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'key');
    } catch (error, stackTrace) {
      _logError('saveInstagramProfileUrl', error, stackTrace);
      rethrow;
    }
  }

  Future<LandingCarouselSettings> getLandingCarouselSettings() async {
    if (!_configured) {
      return const LandingCarouselSettings();
    }

    try {
      final response = await _client
          .from('app_settings')
          .select('value')
          .eq('key', _landingCarouselSettingKey)
          .maybeSingle();

      final rawValue = response?['value']?.toString().trim();
      if (rawValue == null || rawValue.isEmpty) {
        return const LandingCarouselSettings();
      }

      final decoded = jsonDecode(rawValue);
      if (decoded is! Map<String, dynamic>) {
        return const LandingCarouselSettings();
      }

      return LandingCarouselSettings.fromJson(decoded);
    } catch (error, stackTrace) {
      _logError('getLandingCarouselSettings', error, stackTrace);
      return const LandingCarouselSettings();
    }
  }

  Future<void> saveLandingCarouselSettings(
    LandingCarouselSettings settings,
  ) async {
    if (!_configured) {
      throw StateError('Configura Supabase per salvare il carosello.');
    }

    final serialized = jsonEncode(settings.toJson());

    try {
      await _client.from('app_settings').upsert(<String, dynamic>{
        'key': _landingCarouselSettingKey,
        'value': serialized,
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'key');
    } catch (error, stackTrace) {
      _logError('saveLandingCarouselSettings', error, stackTrace);
      rethrow;
    }
  }

  Future<String> uploadCarouselImage({
    required Uint8List bytes,
    required String fileName,
    String? contentType,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase prima di caricare immagini.');
    }

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final safeName = fileName
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9._-]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    final path = 'landing/$timestamp-$safeName';

    final inferredType = contentType ?? _inferImageContentType(fileName);

    try {
      await _client.storage
          .from(_carouselStorageBucket)
          .uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: inferredType, upsert: true),
          );
    } on StorageException catch (error, stackTrace) {
      _logError('uploadCarouselImage(StorageException)', error, stackTrace);
      throw Exception(
        'Upload carosello fallito sul bucket "$_carouselStorageBucket". Verifica policy storage.objects di upload e lettura pubblica. Dettaglio: ${error.message}',
      );
    } catch (error, stackTrace) {
      _logError('uploadCarouselImage', error, stackTrace);
      rethrow;
    }

    return _client.storage.from(_carouselStorageBucket).getPublicUrl(path);
  }

  Future<void> deleteCarouselImageByPublicUrl(String publicUrl) async {
    if (!_configured) {
      throw StateError('Configura Supabase prima di rimuovere immagini.');
    }

    final objectPath = _extractStorageObjectPathFromPublicUrl(publicUrl);
    if (objectPath == null || objectPath.isEmpty) {
      return;
    }

    try {
      await _client.storage.from(_carouselStorageBucket).remove(<String>[
        objectPath,
      ]);
    } on StorageException catch (error, stackTrace) {
      _logError(
        'deleteCarouselImageByPublicUrl(StorageException)',
        error,
        stackTrace,
      );
      throw Exception(
        'Eliminazione immagine carosello fallita: ${error.message}',
      );
    } catch (error, stackTrace) {
      _logError('deleteCarouselImageByPublicUrl', error, stackTrace);
      rethrow;
    }
  }

  String? _extractStorageObjectPathFromPublicUrl(String publicUrl) {
    final uri = Uri.tryParse(publicUrl.trim());
    if (uri == null) {
      return null;
    }

    final segments = uri.pathSegments;
    final bucketIndex = segments.indexOf(_carouselStorageBucket);
    if (bucketIndex < 0 || bucketIndex >= segments.length - 1) {
      return null;
    }

    final objectSegments = segments.sublist(bucketIndex + 1);
    if (objectSegments.isEmpty) {
      return null;
    }

    return objectSegments.map(Uri.decodeComponent).join('/');
  }

  String _inferImageContentType(String fileName) {
    final normalized = fileName.toLowerCase();
    if (normalized.endsWith('.png')) {
      return 'image/png';
    }
    if (normalized.endsWith('.gif')) {
      return 'image/gif';
    }
    if (normalized.endsWith('.webp')) {
      return 'image/webp';
    }
    if (normalized.endsWith('.bmp')) {
      return 'image/bmp';
    }
    if (normalized.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    return 'image/jpeg';
  }

  Stream<List<MemberModel>> watchMembersByStatus(String status) {
    if (!_configured) {
      return Stream<List<MemberModel>>.value(const <MemberModel>[]);
    }

    return watchAllMembers().map(
      (members) => members.where((member) => member.stato == status).toList(),
    );
  }

  Stream<List<MemberModel>> watchPendingMembers() {
    return watchMembersByStatus('pending');
  }

  Stream<List<MemberModel>> watchApprovedMembers() {
    return watchMembersByStatus('approved');
  }

  Stream<List<MemberModel>> watchAllMembers() {
    if (!_configured) {
      return Stream<List<MemberModel>>.value(const <MemberModel>[]);
    }

    return _client
        .from('soci')
        .stream(primaryKey: <String>['id'])
        .order('created_at', ascending: false)
        .map(
          (rows) => rows
              .map((row) => MemberModel.fromMap(Map<String, dynamic>.from(row)))
              .toList(),
        );
  }

  Future<int?> _getMaxAssignedMembershipNumber() async {
    if (!_configured) {
      return null;
    }

    try {
      final response = await _client
          .from('soci')
          .select('numero_tessera')
          .not('numero_tessera', 'is', null);

      final rows = response as List<dynamic>;
      int? maxValue;

      for (final row in rows) {
        final map = Map<String, dynamic>.from(row as Map);
        final raw = map['numero_tessera']?.toString().trim() ?? '';
        final parsed = int.tryParse(raw);
        if (parsed == null) {
          continue;
        }

        if (maxValue == null || parsed > maxValue) {
          maxValue = parsed;
        }
      }

      return maxValue;
    } catch (error, stackTrace) {
      _logError('_getMaxAssignedMembershipNumber', error, stackTrace);
      return null;
    }
  }

  Future<void> updateMemberStatus({
    required String memberId,
    required String status,
  }) async {
    if (!_configured) {
      throw StateError('Configura Supabase per aggiornare lo stato dei soci.');
    }

    await _client
        .from('soci')
        .update(<String, dynamic>{'stato': status})
        .eq('id', memberId);
  }

  Future<void> updateMember(MemberModel member) async {
    if (!_configured) {
      throw StateError('Configura Supabase per modificare i soci.');
    }

    final memberId = member.id;
    if (memberId == null || memberId.isEmpty) {
      throw StateError('Il socio selezionato non ha un ID valido.');
    }

    try {
      await _client
          .from('soci')
          .update(member.toUpdateMap())
          .eq('id', memberId);
    } catch (error, stackTrace) {
      _logError('updateMember', error, stackTrace);
      rethrow;
    }
  }

  Future<void> deleteMember(MemberModel member) async {
    if (!_configured) {
      throw StateError('Configura Supabase per archiviare i soci.');
    }

    final memberId = member.id;
    if (memberId == null || memberId.isEmpty) {
      throw StateError('Il socio selezionato non ha un ID valido.');
    }

    try {
      await _client
          .from('soci')
          .update(<String, dynamic>{
            'is_active': false,
            'deleted_at': DateTime.now().toUtc().toIso8601String(),
            'stato': 'deleted',
          })
          .eq('id', memberId);
    } catch (error, stackTrace) {
      _logError('deleteMember', error, stackTrace);
      rethrow;
    }
  }

  Future<List<MemberModel>> getMembersByStatus(String status) async {
    if (!_configured) {
      throw StateError('Configura Supabase per leggere i soci.');
    }

    final response = await _client
        .from('soci')
        .select()
        .eq('stato', status)
        .order('created_at', ascending: false);

    final rows = (response as List<dynamic>)
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();

    return rows.map(MemberModel.fromMap).toList();
  }

  Future<List<MemberModel>> getApprovedMembers() async {
    return getMembersByStatus('approved');
  }
}

class LandingCarouselSettings {
  const LandingCarouselSettings({
    this.imageUrls = const <String>[],
    this.autoplaySeconds = 4,
    this.widgetHeight = 230,
    this.visibleItems = 2,
  });

  final List<String> imageUrls;
  final double autoplaySeconds;
  final double widgetHeight;
  final double visibleItems;

  factory LandingCarouselSettings.fromJson(Map<String, dynamic> json) {
    final rawImages = json['image_urls'];
    final parsedImages = rawImages is List
        ? rawImages
              .map((item) => item?.toString().trim() ?? '')
              .where((item) => item.isNotEmpty)
              .toList()
        : const <String>[];

    final rawSeconds = json['autoplay_seconds'];
    final rawHeight = json['widget_height'];
    final rawVisibleItems = json['visible_items'];

    return LandingCarouselSettings(
      imageUrls: parsedImages,
      autoplaySeconds: (rawSeconds is num ? rawSeconds.toDouble() : 4)
          .clamp(1, 12)
          .toDouble(),
      widgetHeight: (rawHeight is num ? rawHeight.toDouble() : 230)
          .clamp(140, 520)
          .toDouble(),
      visibleItems: (rawVisibleItems is num ? rawVisibleItems.toDouble() : 2)
          .clamp(1, 4)
          .toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'image_urls': imageUrls,
      'autoplay_seconds': autoplaySeconds,
      'widget_height': widgetHeight,
      'visible_items': visibleItems,
    };
  }

  LandingCarouselSettings copyWith({
    List<String>? imageUrls,
    double? autoplaySeconds,
    double? widgetHeight,
    double? visibleItems,
  }) {
    return LandingCarouselSettings(
      imageUrls: imageUrls ?? this.imageUrls,
      autoplaySeconds: autoplaySeconds ?? this.autoplaySeconds,
      widgetHeight: widgetHeight ?? this.widgetHeight,
      visibleItems: visibleItems ?? this.visibleItems,
    );
  }
}
