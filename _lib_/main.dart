import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_theme.dart';
import 'screens/already_member_page.dart';
import 'screens/admin_dashboard.dart';
import 'screens/home_landing_page.dart';
import 'screens/registration_page.dart';
import 'services/supabase_service.dart';

const _supabaseUrl = 'https://bfdxxlwacimbknamxnjn.supabase.co';
const _supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZHh4bHdhY2ltYmtuYW14bmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzU5MzEsImV4cCI6MjA5MTQ1MTkzMX0.ZqJfp2WdJBA51A235jZRNPjyz60K_LorALpE_FYRR1E';

Map<String, dynamic>? _decodeJwtPayload(String token) {
  try {
    final parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    final normalized = base64Url.normalize(parts[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    return jsonDecode(decoded) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final keyPayload = _decodeJwtPayload(_supabaseAnonKey);
  final urlHost = Uri.tryParse(_supabaseUrl)?.host;
  final keyRef = keyPayload?['ref'];
  final keyRole = keyPayload?['role'];
  final keyMatchesUrl =
      keyRef is String &&
      urlHost != null &&
      urlHost.contains('$keyRef.supabase.co');

  debugPrint(
    '[SupabaseConfig] host=$urlHost anonKeyPresent=${_supabaseAnonKey.isNotEmpty} ref=$keyRef role=$keyRole keyMatchesUrl=$keyMatchesUrl',
  );

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('[FlutterError] ${details.exceptionAsString()}');
    if (details.stack != null) {
      debugPrintStack(stackTrace: details.stack);
    }
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('[UncaughtError] $error');
    debugPrintStack(stackTrace: stack);
    return false;
  };

  Intl.defaultLocale = 'it_IT';
  await initializeDateFormatting('it_IT');

  var supabaseConfigured = false;

  if (_supabaseUrl.isNotEmpty && _supabaseAnonKey.isNotEmpty) {
    try {
      await Supabase.initialize(
        url: _supabaseUrl,
        anonKey: _supabaseAnonKey,
        authOptions: const FlutterAuthClientOptions(
          authFlowType: AuthFlowType.pkce,
        ),
      );
      supabaseConfigured = true;
    } catch (error) {
      debugPrint('[SupabaseInit] error: $error');
      debugPrint('Supabase init error: $error');
    }
  }

  SupabaseService.setConfigured(supabaseConfigured);

  if (supabaseConfigured) {
    final savedThemeColor = await SupabaseService.instance
        .getThemeSeedColorHex();
    AppThemeController.applySavedColor(savedThemeColor);

    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      final event = data.event;
      final session = data.session;
      debugPrint(
        '[AuthState] event=$event session=${session != null} user=${session?.user.email}',
      );
    });
  }

  runApp(MyApp(supabaseConfigured: supabaseConfigured));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, this.supabaseConfigured = false});

  final bool supabaseConfigured;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Color>(
      valueListenable: AppThemeController.seedColor,
      builder: (context, selectedColor, _) {
        final colorScheme = ColorScheme.fromSeed(
          seedColor: selectedColor,
          primary: selectedColor,
        );

        return MaterialApp(
          title: 'Tesseramento Mediterranea',
          debugShowCheckedModeBanner: false,
          locale: const Locale('it', 'IT'),
          supportedLocales: const <Locale>[
            Locale('it', 'IT'),
            Locale('en', 'US'),
          ],
          localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: colorScheme,
            scaffoldBackgroundColor: AppThemeController.scaffoldBackground(
              selectedColor,
            ),
            appBarTheme: const AppBarTheme(
              centerTitle: false,
              backgroundColor: Colors.transparent,
              foregroundColor: Color(0xFF152417),
            ),
            filledButtonTheme: FilledButtonThemeData(
              style: FilledButton.styleFrom(
                backgroundColor: selectedColor,
                foregroundColor: Colors.white,
              ),
            ),
            checkboxTheme: CheckboxThemeData(
              fillColor: WidgetStateProperty.resolveWith<Color?>((states) {
                if (states.contains(WidgetState.selected)) {
                  return selectedColor;
                }
                return null;
              }),
            ),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: selectedColor, width: 1.5),
              ),
            ),
          ),
          initialRoute: '/',
          onGenerateRoute: (settings) {
            switch (settings.name) {
              case '/registration':
                final fixedMembershipNumber = settings.arguments as String?;
                return MaterialPageRoute<void>(
                  builder: (_) => RegistrationPage(
                    supabaseConfigured: supabaseConfigured,
                    fixedMembershipNumber: fixedMembershipNumber,
                  ),
                );
              case '/already-member':
                return MaterialPageRoute<void>(
                  builder: (_) =>
                      AlreadyMemberPage(supabaseConfigured: supabaseConfigured),
                );
              case '/admin':
                return MaterialPageRoute<void>(
                  builder: (_) =>
                      AdminDashboard(supabaseConfigured: supabaseConfigured),
                );
              case '/':
              default:
                return MaterialPageRoute<void>(
                  builder: (_) => const HomeLandingPage(),
                );
            }
          },
        );
      },
    );
  }
}
