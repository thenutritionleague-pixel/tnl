import 'package:flutter/material.dart';

/// Global theme mode notifier — a single source of truth for light/dark.
final themeNotifier = ValueNotifier<ThemeMode>(ThemeMode.light);

void toggleTheme() {
  themeNotifier.value = themeNotifier.value == ThemeMode.light
      ? ThemeMode.dark
      : ThemeMode.light;
}

bool get isDark => themeNotifier.value == ThemeMode.dark;
