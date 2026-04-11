import 'package:flutter_test/flutter_test.dart';

import 'package:mediterraneapp/main.dart';

void main() {
  testWidgets('renders the public registration page', (tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('Registrazione socio'), findsOneWidget);
    expect(find.text('Invia richiesta'), findsOneWidget);
  });
}
