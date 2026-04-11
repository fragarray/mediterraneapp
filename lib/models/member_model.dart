import 'package:intl/intl.dart';

class MemberModel {
  const MemberModel({
    this.id,
    this.createdAt,
    required this.nome,
    required this.cognome,
    required this.email,
    required this.telefono,
    required this.codiceFiscale,
    required this.firmaUrl,
    this.stato = 'pending',
    required this.privacyAccepted,
  });

  final String? id;
  final DateTime? createdAt;
  final String nome;
  final String cognome;
  final String email;
  final String telefono;
  final String codiceFiscale;
  final String firmaUrl;
  final String stato;
  final bool privacyAccepted;

  String get fullName => '$nome $cognome';

  String get createdAtLabel {
    if (createdAt == null) {
      return '-';
    }

    return DateFormat('dd/MM/yyyy HH:mm', 'it_IT').format(createdAt!);
  }

  MemberModel copyWith({
    String? id,
    DateTime? createdAt,
    String? nome,
    String? cognome,
    String? email,
    String? telefono,
    String? codiceFiscale,
    String? firmaUrl,
    String? stato,
    bool? privacyAccepted,
  }) {
    return MemberModel(
      id: id ?? this.id,
      createdAt: createdAt ?? this.createdAt,
      nome: nome ?? this.nome,
      cognome: cognome ?? this.cognome,
      email: email ?? this.email,
      telefono: telefono ?? this.telefono,
      codiceFiscale: codiceFiscale ?? this.codiceFiscale,
      firmaUrl: firmaUrl ?? this.firmaUrl,
      stato: stato ?? this.stato,
      privacyAccepted: privacyAccepted ?? this.privacyAccepted,
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
      nome: map['nome']?.toString() ?? '',
      cognome: map['cognome']?.toString() ?? '',
      email: map['email']?.toString() ?? '',
      telefono: map['telefono']?.toString() ?? '',
      codiceFiscale: map['codice_fiscale']?.toString() ?? '',
      firmaUrl: map['firma_url']?.toString() ?? '',
      stato: map['stato']?.toString() ?? 'pending',
      privacyAccepted: map['privacy_accepted'] as bool? ?? false,
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
    };

    if (includeCreatedAt) {
      data['created_at'] = (createdAt ?? DateTime.now())
          .toUtc()
          .toIso8601String();
    }

    return data;
  }
}
