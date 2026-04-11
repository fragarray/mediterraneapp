import 'package:intl/intl.dart';

class MemberModel {
  const MemberModel({
    this.id,
    this.createdAt,
    this.numeroTessera = '',
    required this.nome,
    required this.cognome,
    required this.email,
    required this.telefono,
    required this.codiceFiscale,
    required this.firmaUrl,
    this.stato = 'pending',
    required this.privacyAccepted,
    this.isActive = true,
  });

  final String? id;
  final DateTime? createdAt;
  final String numeroTessera;
  final String nome;
  final String cognome;
  final String email;
  final String telefono;
  final String codiceFiscale;
  final String firmaUrl;
  final String stato;
  final bool privacyAccepted;
  final bool isActive;

  String get fullName => '$nome $cognome';
  String get membershipNumberLabel =>
      numeroTessera.trim().isEmpty ? '-' : numeroTessera.trim();

  String get createdAtLabel {
    if (createdAt == null) {
      return '-';
    }

    return DateFormat('dd/MM/yyyy', 'it_IT').format(createdAt!);
  }

  MemberModel copyWith({
    String? id,
    DateTime? createdAt,
    String? numeroTessera,
    String? nome,
    String? cognome,
    String? email,
    String? telefono,
    String? codiceFiscale,
    String? firmaUrl,
    String? stato,
    bool? privacyAccepted,
    bool? isActive,
  }) {
    return MemberModel(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      numeroTessera: numeroTessera ?? this.numeroTessera,
      nome: nome ?? this.nome,
      cognome: cognome ?? this.cognome,
      email: email ?? this.email,
      telefono: telefono ?? this.telefono,
      codiceFiscale: codiceFiscale ?? this.codiceFiscale,
      firmaUrl: firmaUrl ?? this.firmaUrl,
      stato: stato ?? this.stato,
      privacyAccepted: privacyAccepted ?? this.privacyAccepted,
      isActive: isActive ?? this.isActive,
    );
  }

  factory MemberModel.fromMap(Map<String, dynamic> map) {
    final createdAtValue = map['created_at'];
    DateTime? parsedCreatedAt;

    if (createdAtValue is DateTime) {
      parsedCreatedAt = createdAtValue.toLocal();
    } else if (createdAtValue is String && createdAtValue.isNotEmpty) {
      parsedCreatedAt = DateTime.tryParse(createdAtValue)?.toLocal();
    }

    return MemberModel(
      id: map['id']?.toString(),
      createdAt: parsedCreatedAt,
      numeroTessera: map['numero_tessera']?.toString() ?? '',
      nome: map['nome']?.toString() ?? '',
      cognome: map['cognome']?.toString() ?? '',
      email: map['email']?.toString() ?? '',
      telefono: map['telefono']?.toString() ?? '',
      codiceFiscale: map['codice_fiscale']?.toString() ?? '',
      firmaUrl: map['firma_url']?.toString() ?? '',
      stato: map['stato']?.toString() ?? 'pending',
      privacyAccepted: map['privacy_accepted'] as bool? ?? false,
      isActive: map['is_active'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toInsertMap() {
    return _toDatabaseMap(includeCreatedAt: true);
  }

  Map<String, dynamic> toUpdateMap() {
    return _toDatabaseMap(includeCreatedAt: false);
  }

  Map<String, dynamic> _toDatabaseMap({required bool includeCreatedAt}) {
    final data = <String, dynamic>{
      'nome': nome,
      'cognome': cognome,
      'email': email,
      'telefono': telefono,
      'codice_fiscale': codiceFiscale,
      'firma_url': firmaUrl,
      'stato': stato,
      'privacy_accepted': privacyAccepted,
      if (numeroTessera.trim().isNotEmpty)
        'numero_tessera': numeroTessera.trim(),
    };

    if (includeCreatedAt) {
      data['created_at'] = (createdAt ?? DateTime.now())
          .toUtc()
          .toIso8601String();
    }

    return data;
  }
}
