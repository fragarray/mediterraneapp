import 'package:file_saver/file_saver.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/member_model.dart';

class PdfService {
  PdfService._();

  static final PdfService instance = PdfService._();

  Future<void> exportMemberForm(MemberModel member) async {
    final document = pw.Document();
    final logoBytes = await _loadAssetBytes('logopiccolo.png');
    final signatureBytes = await _loadSignatureBytes(member.firmaUrl);
    final generatedAt = DateFormat(
      'dd/MM/yyyy',
      'it_IT',
    ).format(DateTime.now());
    final registrationDate = member.createdAt == null
        ? '-'
        : DateFormat('dd/MM/yyyy', 'it_IT').format(member.createdAt!);
    final details = <MapEntry<String, String>>[
      MapEntry('Numero tessera', member.membershipNumberLabel),
      MapEntry('Data registrazione', registrationDate),
      MapEntry('Nome', member.nome),
      MapEntry('Cognome', member.cognome),
      MapEntry('Luogo di nascita', member.luogoNascita),
      MapEntry('Data di nascita', member.birthDateLabel),
      MapEntry('Residenza', member.residenza),
      MapEntry('Comune', member.comune),
      MapEntry('CAP', member.cap),
      MapEntry('Telefono', member.telefono),
      MapEntry('Email', member.email),
    ];

    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.fromLTRB(22, 18, 22, 20),
        build: (context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: <pw.Widget>[
              pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: <pw.Widget>[
                  if (logoBytes != null)
                    pw.Container(
                      width: 92,
                      height: 92,
                      alignment: pw.Alignment.topLeft,
                      child: pw.Image(
                        pw.MemoryImage(logoBytes),
                        fit: pw.BoxFit.contain,
                      ),
                    ),
                  if (logoBytes != null) pw.SizedBox(width: 14),
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: <pw.Widget>[
                        pw.Text(
                          'JATA APS',
                          style: pw.TextStyle(
                            fontSize: 16,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                        pw.SizedBox(height: 3),
                        pw.Text(
                          'Via Giacomo Leopardi 1/C - 73020 Cutrofiano (LE)',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                        pw.Text(
                          'P.IVA / Cod. Fisc. 05190010750',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                        pw.SizedBox(height: 10),
                        pw.Text(
                          'Modulo di adesione socio',
                          style: pw.TextStyle(
                            fontSize: 18,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                        pw.SizedBox(height: 4),
                        pw.Text(
                          'Documento generato il $generatedAt',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              pw.SizedBox(height: 12),
              pw.Wrap(
                spacing: 10,
                runSpacing: 8,
                children: details
                    .map(
                      (entry) => pw.SizedBox(
                        width: 255,
                        child: _infoCard(entry.key, entry.value),
                      ),
                    )
                    .toList(),
              ),
              pw.SizedBox(height: 14),
              pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: <pw.Widget>[
                  pw.Expanded(
                    child: pw.Text(
                      'Firma del socio',
                      style: pw.TextStyle(
                        fontSize: 11,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                  ),
                  pw.Container(
                    width: 150,
                    height: 62,
                    padding: const pw.EdgeInsets.all(6),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey400),
                      borderRadius: const pw.BorderRadius.all(
                        pw.Radius.circular(8),
                      ),
                    ),
                    child: signatureBytes != null && signatureBytes.isNotEmpty
                        ? pw.Image(
                            pw.MemoryImage(signatureBytes),
                            fit: pw.BoxFit.contain,
                          )
                        : pw.Center(
                            child: pw.Text(
                              'Firma non disponibile',
                              textAlign: pw.TextAlign.center,
                              style: const pw.TextStyle(
                                color: PdfColors.grey700,
                                fontSize: 8,
                              ),
                            ),
                          ),
                  ),
                ],
              ),
              pw.Spacer(),
              pw.Divider(color: PdfColors.grey300),
              pw.SizedBox(height: 4),
              pw.Text(
                'Acconsento al trattamento dei miei dati personali ai sensi del REg. UE 679/2016 (GDPR), esclusivamente per finalità associative e di comunicazione interna.',
                textAlign: pw.TextAlign.center,
                style: const pw.TextStyle(
                  fontSize: 8,
                  color: PdfColors.grey700,
                ),
              ),
            ],
          );
        },
      ),
    );

    final bytes = Uint8List.fromList(await document.save());
    final timestamp = DateFormat('yyyyMMdd_HHmm').format(DateTime.now());
    final safeName = '${member.cognome}_${member.nome}'
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');

    await FileSaver.instance.saveFile(
      name: 'modulo_${safeName.isEmpty ? 'socio' : safeName}_$timestamp',
      bytes: bytes,
      fileExtension: 'pdf',
      mimeType: MimeType.pdf,
    );
  }

  pw.Widget _infoCard(String label, String value) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: pw.BoxDecoration(
        color: PdfColors.grey100,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: <pw.Widget>[
          pw.Text(
            label,
            style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 2),
          pw.Text(
            value.isEmpty ? '-' : value,
            style: const pw.TextStyle(fontSize: 9),
          ),
        ],
      ),
    );
  }

  Future<Uint8List?> _loadAssetBytes(String path) async {
    try {
      final data = await rootBundle.load(path);
      return data.buffer.asUint8List();
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> _loadSignatureBytes(String url) async {
    if (url.isEmpty) {
      return null;
    }

    final storagePath = _extractStoragePath(url, 'firme');
    if (storagePath != null) {
      try {
        final bytes = await Supabase.instance.client.storage
            .from('firme')
            .download(storagePath);
        if (bytes.isNotEmpty) {
          return bytes;
        }
      } catch (error) {
        debugPrint(
          '[PdfService] storage download failed for $storagePath: $error',
        );
      }
    }

    try {
      final data = await NetworkAssetBundle(Uri.parse(url)).load(url);
      return data.buffer.asUint8List();
    } catch (error) {
      debugPrint('[PdfService] network download failed for $url: $error');
      return null;
    }
  }

  String? _extractStoragePath(String publicUrl, String bucket) {
    final uri = Uri.tryParse(publicUrl);
    if (uri == null) {
      return null;
    }

    final publicIndex = uri.pathSegments.indexOf('public');
    if (publicIndex != -1 && publicIndex + 2 < uri.pathSegments.length) {
      final bucketName = uri.pathSegments[publicIndex + 1];
      if (bucketName == bucket) {
        return uri.pathSegments.sublist(publicIndex + 2).join('/');
      }
    }

    final signIndex = uri.pathSegments.indexOf('sign');
    if (signIndex != -1 && signIndex + 2 < uri.pathSegments.length) {
      final bucketName = uri.pathSegments[signIndex + 1];
      if (bucketName == bucket) {
        return uri.pathSegments.sublist(signIndex + 2).join('/');
      }
    }

    return null;
  }
}
