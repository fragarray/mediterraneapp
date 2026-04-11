import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/member_model.dart';

class SupabaseService {
  SupabaseService._();

  static final SupabaseService instance = SupabaseService._();

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

  Stream<List<MemberModel>> watchMembersByStatus(String status) {
    if (!_configured) {
      return Stream<List<MemberModel>>.value(const <MemberModel>[]);
    }

    return _client
        .from('soci')
        .stream(primaryKey: <String>['id'])
        .eq('stato', status)
        .order('created_at', ascending: false)
        .map(
          (rows) => rows
              .map((row) => MemberModel.fromMap(Map<String, dynamic>.from(row)))
              .toList(),
        );
  }

  Stream<List<MemberModel>> watchPendingMembers() {
    return watchMembersByStatus('pending');
  }

  Stream<List<MemberModel>> watchApprovedMembers() {
    return watchMembersByStatus('approved');
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
      throw StateError('Configura Supabase per eliminare i soci.');
    }

    final memberId = member.id;
    if (memberId == null || memberId.isEmpty) {
      throw StateError('Il socio selezionato non ha un ID valido.');
    }

    final storagePath = _extractStoragePath(member.firmaUrl, 'firme');
    if (storagePath != null) {
      try {
        await _client.storage.from('firme').remove(<String>[storagePath]);
      } catch (error, stackTrace) {
        _logError('deleteMemberStorage', error, stackTrace);
      }
    }

    try {
      await _client.from('soci').delete().eq('id', memberId);
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

  String? _extractStoragePath(String publicUrl, String bucket) {
    if (publicUrl.isEmpty) {
      return null;
    }

    final uri = Uri.tryParse(publicUrl);
    if (uri == null) {
      return null;
    }

    final publicIndex = uri.pathSegments.indexOf('public');
    if (publicIndex == -1 || publicIndex + 2 > uri.pathSegments.length) {
      return null;
    }

    final bucketName = uri.pathSegments[publicIndex + 1];
    if (bucketName != bucket) {
      return null;
    }

    return uri.pathSegments.sublist(publicIndex + 2).join('/');
  }
}
