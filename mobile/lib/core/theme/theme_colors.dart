import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Theme-aware color accessors on BuildContext.
/// Use these instead of AppColors.* in build() methods.
extension ThemeColors on BuildContext {
  ColorScheme get cs => Theme.of(this).colorScheme;

  Color get surfaceColor   => Theme.of(this).colorScheme.surface;
  Color get bgColor        => Theme.of(this).scaffoldBackgroundColor;
  Color get borderColor    => Theme.of(this).colorScheme.outline;
  Color get textPrimary    => Theme.of(this).colorScheme.onSurface;
  Color get textSecondary  => Theme.of(this).colorScheme.onSurface.withValues(alpha: 0.65);
  Color get textHint       => Theme.of(this).colorScheme.onSurface.withValues(alpha: 0.38);
  Color get primaryColor   => Theme.of(this).colorScheme.primary;
  bool  get isDarkMode     => Theme.of(this).brightness == Brightness.dark;

  /// Elevated surface (cards inside cards)
  Color get surfaceElevated => isDarkMode
      ? const Color(0xFF162E1C)
      : const Color(0xFFF8FAFC);

  // Brand colours that don't change with theme
  Color get success  => AppColors.success;
  Color get error    => AppColors.error;
  Color get pending  => AppColors.pending;
  Color get gold     => AppColors.gold;
  Color get silver   => AppColors.silver;
  Color get bronze   => AppColors.bronze;

  // Points badge
  Color get pointsBadgeBg     => isDarkMode ? const Color(0xFF134E2A) : AppColors.pointsBadge;
  Color get pointsBadgeBorder => isDarkMode ? const Color(0xFF34D399) : AppColors.pointsBadgeBorder;
  Color get pointsText        => isDarkMode ? const Color(0xFF34D399) : AppColors.pointsText;

  // Primary surface (chip / tag bg)
  Color get primarySurface => isDarkMode ? const Color(0xFF134E2A) : AppColors.primarySurface;
  Color get primaryMint    => isDarkMode ? const Color(0xFF1E3D25) : AppColors.primaryMint;
}
