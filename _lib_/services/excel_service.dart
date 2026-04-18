import 'package:file_saver/file_saver.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:syncfusion_flutter_xlsio/xlsio.dart' as xlsio;

import '../models/member_model.dart';

class ExcelService {
  ExcelService._();

  static final ExcelService instance = ExcelService._();

  Future<void> exportApprovedMembers(List<MemberModel> members) async {
    await exportMembers(
      members,
      sheetName: 'Soci approvati',
      filePrefix: 'soci_approvati',
    );
  }

  Future<void> exportMembers(
    List<MemberModel> members, {
    String sheetName = 'Soci',
    String filePrefix = 'soci',
  }) async {
    final workbook = xlsio.Workbook();
    final sheet = workbook.worksheets[0];
    sheet.name = sheetName;

    final headers = <String>[
      'Numero Tessera',
      'Nome',
      'Cognome',
      'Luogo di Nascita',
      'Data di Nascita',
      'Residenza',
      'Comune',
      'CAP',
      'Email',
      'Telefono',
      'Stato',
      'Privacy',
      'Data Iscrizione',
      'Firma URL',
      'Firma',
    ];

    for (var index = 0; index < headers.length; index++) {
      final cell = sheet.getRangeByIndex(1, index + 1);
      cell.setText(headers[index]);
      cell.cellStyle.backColor = '#2E7D32';
      cell.cellStyle.fontColor = '#FFFFFF';
      cell.cellStyle.bold = true;
    }

    for (var rowIndex = 0; rowIndex < members.length; rowIndex++) {
      final member = members[rowIndex];
      final excelRow = rowIndex + 2;

      sheet.getRangeByIndex(excelRow, 1).rowHeight = 54;
      sheet.getRangeByIndex(excelRow, 1).setText(member.membershipNumberLabel);
      sheet.getRangeByIndex(excelRow, 2).setText(member.nome);
      sheet.getRangeByIndex(excelRow, 3).setText(member.cognome);
      sheet.getRangeByIndex(excelRow, 4).setText(member.luogoNascita);
      sheet.getRangeByIndex(excelRow, 5).setText(member.birthDateLabel);
      sheet.getRangeByIndex(excelRow, 6).setText(member.residenza);
      sheet.getRangeByIndex(excelRow, 7).setText(member.comune);
      sheet.getRangeByIndex(excelRow, 8).setText(member.cap);
      sheet.getRangeByIndex(excelRow, 9).setText(member.email);
      sheet.getRangeByIndex(excelRow, 10).setText(member.telefono);
      sheet.getRangeByIndex(excelRow, 11).setText(member.stato);
      sheet
          .getRangeByIndex(excelRow, 12)
          .setText(member.privacyAccepted ? 'Accettata' : 'Non accettata');
      sheet
          .getRangeByIndex(excelRow, 13)
          .setText(
            member.createdAt == null
                ? ''
                : DateFormat('dd/MM/yyyy', 'it_IT').format(member.createdAt!),
          );
      sheet.getRangeByIndex(excelRow, 14).setText(member.firmaUrl);

      final imageBytes = await _loadImageBytes(member.firmaUrl);
      if (imageBytes != null && imageBytes.isNotEmpty) {
        final picture = sheet.pictures.addStream(excelRow, 15, imageBytes);
        picture.lastRow = excelRow;
        picture.lastColumn = 15;
        picture.width = 72;
        picture.height = 44;
      }
    }

    for (var column = 1; column <= 13; column++) {
      sheet.autoFitColumn(column);
    }
    sheet.getRangeByIndex(1, 14).columnWidth = 40;
    sheet.getRangeByIndex(1, 15).columnWidth = 14;

    final bytes = Uint8List.fromList(workbook.saveAsStream());
    workbook.dispose();

    final fileName =
        '${filePrefix}_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}';

    await FileSaver.instance.saveFile(
      name: fileName,
      bytes: bytes,
      fileExtension: 'xlsx',
      mimeType: MimeType.microsoftExcel,
    );
  }

  Future<Uint8List?> _loadImageBytes(String url) async {
    if (url.isEmpty) {
      return null;
    }

    try {
      final data = await NetworkAssetBundle(Uri.parse(url)).load(url);
      return data.buffer.asUint8List();
    } catch (_) {
      return null;
    }
  }
}
