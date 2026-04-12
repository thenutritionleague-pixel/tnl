import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../constants/app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      fontFamily: GoogleFonts.instrumentSans().fontFamily,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        primary: AppColors.primary,
        surface: AppColors.surface,
        onPrimary: Colors.white,
        secondary: AppColors.secondary,
        onSurface: AppColors.textPrimary,
        outline: AppColors.border,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: AppColors.background,
      textTheme: TextTheme(
        // Instrument Serif — display & headline (playful, editorial)
        displayLarge: GoogleFonts.instrumentSerif(fontSize: 57, color: AppColors.textPrimary),
        displayMedium: GoogleFonts.instrumentSerif(fontSize: 45, color: AppColors.textPrimary),
        displaySmall: GoogleFonts.instrumentSerif(fontSize: 36, color: AppColors.textPrimary),
        headlineLarge: GoogleFonts.instrumentSerif(fontSize: 32, color: AppColors.textPrimary),
        headlineMedium: GoogleFonts.instrumentSerif(fontSize: 28, color: AppColors.textPrimary),
        headlineSmall: GoogleFonts.instrumentSerif(fontSize: 24, color: AppColors.textPrimary),
        titleLarge: GoogleFonts.instrumentSerif(fontSize: 22, color: AppColors.textPrimary),
        // Instrument Sans — title medium down (clean, readable)
        titleMedium: GoogleFonts.instrumentSans(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
        titleSmall: GoogleFonts.instrumentSans(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
        bodyLarge: GoogleFonts.instrumentSans(fontSize: 16, fontWeight: FontWeight.w400, color: AppColors.textPrimary),
        bodyMedium: GoogleFonts.instrumentSans(fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.textSecondary),
        bodySmall: GoogleFonts.instrumentSans(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textHint),
        labelLarge: GoogleFonts.instrumentSans(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
        labelMedium: GoogleFonts.instrumentSans(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSecondary),
        labelSmall: GoogleFonts.instrumentSans(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textHint),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.instrumentSerif(
          fontSize: 22,
          color: AppColors.textPrimary,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primarySurface,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.primary, size: 22);
          }
          return const IconThemeData(color: AppColors.textHint, size: 22);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return GoogleFonts.instrumentSans(
              fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.primary,
            );
          }
          return GoogleFonts.instrumentSans(
            fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textHint,
          );
        }),
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 0,
          textStyle: GoogleFonts.instrumentSans(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          textStyle: GoogleFonts.instrumentSans(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.error),
        ),
        hintStyle: GoogleFonts.instrumentSans(color: AppColors.textHint, fontSize: 14),
        labelStyle: GoogleFonts.instrumentSans(color: AppColors.textSecondary, fontSize: 14),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      dividerTheme: const DividerThemeData(color: AppColors.divider, thickness: 1),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.primarySurface,
        labelStyle: GoogleFonts.instrumentSans(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
    );
  }
}
