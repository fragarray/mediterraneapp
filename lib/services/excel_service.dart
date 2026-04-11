import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';
import 'package:intl/intl.dart';
import 'package:syncfusion_flutter_xlsio/xlsio.dart' as xlsio;

import '../models/member_model.dart';

class ExcelService {
  ExcelService._();

  static final ExcelService instance = ExcelService._();

  Future<void> exportApprovedMembers(List<MemberModel> members) async {
    final workbook = xlsio.Workbook();
    final sheet = workbook.worksheets[0];
    sheet.name = 'Soci approvati';

    final headers = <String>[
      'Nome',
      'Cognome',
      'Email',
      'Telefono',
      'Codice Fiscale',
      'Data Iscrizione',
      'Firma URL',
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

      sheet.getRangeByIndex(excelRow, 1).setText(member.nome);
      sheet.getRangeByIndex(excelRow, 2).setText(member.cognome);
      sheet.getRangeByIndex(excelRow, 3).setText(member.email);
      sheet.getRangeByIndex(excelRow, 4).setText(member.telefono);
      sheet.getRangeByIndex(excelRow, 5).setText(member.codiceFiscale);
      sheet
          .getRangeByIndex(excelRow, 6)
          .setText(
            member.createdAt == null
                ? ''
                : DateFormat(
                    'dd/MM/yyyy HH:mm',
                    'it_IT',
                  ).format(member.createdAt!),
          );
      sheet.getRangeByIndex(excelRow, 7).setText(member.firmaUrl);
    }

    for (var column = 1; column <= headers.length; column++) {
      sheet.autoFitColumn(column);
    }

    final bytes = Uint8List.fromList(workbook.saveAsStream());
    workbook.dispose();

    final fileName =
        'soci_approvati_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}';

    await FileSaver.instance.saveFile(
      name: fileName,
      bytes: bytes,
      fileExtension: 'xlsx',
      mimeType: MimeType.microsoftExcel,
    );
  }
}
