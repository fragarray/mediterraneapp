import 'package:flutter/material.dart';

class AppThemeOption {
  const AppThemeOption({required this.label, required this.color});

  final String label;
  final Color color;
}

class AppThemeController {
  AppThemeController._();

  static const Color defaultSeed = Color(0xFF2E7D32);

  static final ValueNotifier<Color> seedColor = ValueNotifier<Color>(
    defaultSeed,
  );

  static String colorToHex(Color color) {
    final argb = color.toARGB32();
    return '#${argb.toRadixString(16).padLeft(8, '0').toUpperCase()}';
  }

  static Color? colorFromHex(String? value) {
    if (value == null) {
      return null;
    }

    final normalized = value.trim().replaceFirst('#', '');
    if (normalized.length != 6 && normalized.length != 8) {
      return null;
    }

    final parsed = int.tryParse(normalized, radix: 16);
    if (parsed == null) {
      return null;
    }

    return Color(normalized.length == 6 ? (0xFF000000 | parsed) : parsed);
  }

  static void applySavedColor(String? value) {
    final parsedColor = colorFromHex(value);
    if (parsedColor != null) {
      setSeedColor(parsedColor);
    }
  }

  static const List<AppThemeOption> options = <AppThemeOption>[
    AppThemeOption(label: 'Verde', color: Color(0xFF2E7D32)),
    AppThemeOption(label: 'Blu', color: Color(0xFF1565C0)),
    AppThemeOption(label: 'Viola', color: Color(0xFF6A1B9A)),
    AppThemeOption(label: 'Bordeaux', color: Color(0xFF9C2748)),
    AppThemeOption(label: 'Arancio', color: Color(0xFFEF6C00)),
  ];

  static void setSeedColor(Color color) {
    if (seedColor.value == color) {
      return;
    }
    seedColor.value = color;
  }

  static Color scaffoldBackground(Color color) {
    return Color.alphaBlend(
      color.withValues(alpha: 0.05),
      const Color(0xFFF7F8F6),
    );
  }
}
