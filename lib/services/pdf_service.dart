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

    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        build: (context) => <pw.Widget>[
          if (logoBytes != null)
            pw.Center(
              child: pw.Image(
                pw.MemoryImage(logoBytes),
                width: 150,
                fit: pw.BoxFit.contain,
              ),
            ),
          pw.SizedBox(height: 14),
          pw.Text(
            'Modulo tesseramento',
            style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 6),
          pw.Text('Documento generato il $generatedAt'),
          pw.SizedBox(height: 18),
          _infoRow('Nome', member.nome),
          _infoRow('Cognome', member.cognome),
          _infoRow('Email', member.email),
          _infoRow('Telefono', member.telefono),
          _infoRow('Codice fiscale', member.codiceFiscale),
          _infoRow('Stato', member.stato),
          _infoRow(
            'Privacy',
            member.privacyAccepted ? 'Accettata' : 'Non accettata',
          ),
          _infoRow('Data registrazione', registrationDate),
          pw.SizedBox(height: 24),
          pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: <pw.Widget>[
                pw.Text(
                  'Firma',
                  style: pw.TextStyle(
                    fontSize: 16,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.Container(
                  width: 130,
                  height: 60,
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
          ),
        ],
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

  pw.Widget _infoRow(String label, String value) {
    return pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 8),
      child: pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: pw.BoxDecoration(
          color: PdfColors.grey100,
          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
        ),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: <pw.Widget>[
            pw.SizedBox(
              width: 120,
              child: pw.Text(
                label,
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              ),
            ),
            pw.Expanded(child: pw.Text(value.isEmpty ? '-' : value)),
          ],
        ),
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
