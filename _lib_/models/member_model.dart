import 'package:intl/intl.dart';

class MemberModel {
  const MemberModel({
    this.id,
    this.createdAt,
    this.numeroTessera = '',
    required this.nome,
    required this.cognome,
    required this.luogoNascita,
    this.dataNascita,
    required this.residenza,
    required this.comune,
    required this.cap,
    required this.email,
    required this.telefono,
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
  final String luogoNascita;
  final DateTime? dataNascita;
  final String residenza;
  final String comune;
  final String cap;
  final String email;
  final String telefono;
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

  String get birthDateLabel {
    if (dataNascita == null) {
      return '-';
    }

    return DateFormat('dd/MM/yyyy', 'it_IT').format(dataNascita!);
  }

  String get birthPlaceAndDateLabel {
    final place = luogoNascita.trim().isEmpty ? '-' : luogoNascita.trim();
    final date = birthDateLabel;
    if (place == '-' && date == '-') {
      return '-';
    }
    if (date == '-') {
      return place;
    }
    if (place == '-') {
      return date;
    }
    return '$place · $date';
  }

  String get residenceLabel {
    final address = residenza.trim();
    final city = comune.trim();
    final zip = cap.trim();

    final cityWithZip = [
      city,
      if (zip.isNotEmpty) '($zip)',
    ].where((value) => value.isNotEmpty).join(' ');

    final parts = <String>[
      if (address.isNotEmpty) address,
      if (cityWithZip.isNotEmpty) cityWithZip,
    ];

    return parts.isEmpty ? '-' : parts.join(' · ');
  }

  MemberModel copyWith({
    String? id,
    DateTime? createdAt,
    String? numeroTessera,
    String? nome,
    String? cognome,
    String? luogoNascita,
    DateTime? dataNascita,
    String? residenza,
    String? comune,
    String? cap,
    String? email,
    String? telefono,
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
      luogoNascita: luogoNascita ?? this.luogoNascita,
      dataNascita: dataNascita ?? this.dataNascita,
      residenza: residenza ?? this.residenza,
      comune: comune ?? this.comune,
      cap: cap ?? this.cap,
      email: email ?? this.email,
      telefono: telefono ?? this.telefono,
      firmaUrl: firmaUrl ?? this.firmaUrl,
      stato: stato ?? this.stato,
      privacyAccepted: privacyAccepted ?? this.privacyAccepted,
      isActive: isActive ?? this.isActive,
    );
  }

  factory MemberModel.fromMap(Map<String, dynamic> map) {
    return MemberModel(
      id: map['id']?.toString(),
      createdAt: _parseDateTimeValue(map['created_at']),
      numeroTessera: map['numero_tessera']?.toString() ?? '',
      nome: map['nome']?.toString() ?? '',
      cognome: map['cognome']?.toString() ?? '',
      luogoNascita: map['luogo_nascita']?.toString() ?? '',
      dataNascita: _parseDateTimeValue(map['data_nascita']),
      residenza: map['residenza']?.toString() ?? '',
      comune: map['comune']?.toString() ?? '',
      cap: map['cap']?.toString() ?? '',
      email: map['email']?.toString() ?? '',
      telefono: map['telefono']?.toString() ?? '',
      firmaUrl: map['firma_url']?.toString() ?? '',
      stato: map['stato']?.toString() ?? 'pending',
      privacyAccepted: map['privacy_accepted'] as bool? ?? false,
      isActive: map['is_active'] as bool? ?? true,
    );
  }

  static DateTime? _parseDateTimeValue(dynamic value) {
    if (value is DateTime) {
      return value.toLocal();
    }
    if (value is String && value.isNotEmpty) {
      return DateTime.tryParse(value)?.toLocal();
    }
    return null;
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
      'luogo_nascita': luogoNascita,
      'data_nascita': dataNascita == null
          ? null
          : DateFormat('yyyy-MM-dd').format(dataNascita!),
      'residenza': residenza,
      'comune': comune,
      'cap': cap,
      'email': email,
      'telefono': telefono,
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
