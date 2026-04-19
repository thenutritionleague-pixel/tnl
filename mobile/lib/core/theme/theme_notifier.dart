import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kThemeKey = 'theme_mode';

/// Global theme mode notifier — persists selection across app restarts.
final themeNotifier = ValueNotifier<ThemeMode>(ThemeMode.dark);

/// Call once at startup (after WidgetsFlutterBinding.ensureInitialized).
Future<void> loadSavedTheme() async {
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString(_kThemeKey);
  if (saved == 'light') {
    themeNotifier.value = ThemeMode.light;
  } else {
    themeNotifier.value = ThemeMode.dark;
  }
}

Future<void> toggleTheme() async {
  final next = themeNotifier.value == ThemeMode.light
      ? ThemeMode.dark
      : ThemeMode.light;
  themeNotifier.value = next;
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_kThemeKey, next == ThemeMode.light ? 'light' : 'dark');
}

bool get isDark => themeNotifier.value == ThemeMode.dark;
