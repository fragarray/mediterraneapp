import 'package:intl/intl.dart';

class LegacyMembershipRequestModel {
  const LegacyMembershipRequestModel({
    this.id,
    this.createdAt,
    this.dataRegistrazioneTessera,
    required this.numeroTessera,
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
  });

  final String? id;
  final DateTime? createdAt;
  final DateTime? dataRegistrazioneTessera;
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

  String get fullName => '$nome $cognome';

  String get createdAtLabel {
    if (createdAt == null) {
      return '-';
    }

    return DateFormat('dd/MM/yyyy', 'it_IT').format(createdAt!);
  }

  factory LegacyMembershipRequestModel.fromMap(Map<String, dynamic> map) {
    return LegacyMembershipRequestModel(
      id: map['id']?.toString(),
      createdAt: _parseDateTimeValue(map['created_at']),
      dataRegistrazioneTessera: _parseDateTimeValue(
        map['data_registrazione_tessera'],
      ),
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
    return <String, dynamic>{
      'numero_tessera': numeroTessera.trim(),
      'nome': nome,
      'cognome': cognome,
      'luogo_nascita': luogoNascita,
      'data_nascita': dataNascita == null
          ? null
          : DateFormat('yyyy-MM-dd').format(dataNascita!),
        'data_registrazione_tessera': dataRegistrazioneTessera == null
          ? null
          : DateFormat('yyyy-MM-dd').format(dataRegistrazioneTessera!),
      'residenza': residenza,
      'comune': comune,
      'cap': cap,
      'email': email,
      'telefono': telefono,
      'firma_url': firmaUrl,
      'stato': stato,
      'privacy_accepted': privacyAccepted,
      'created_at': (createdAt ?? DateTime.now()).toUtc().toIso8601String(),
    };
  }
}
