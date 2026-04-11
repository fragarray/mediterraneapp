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
