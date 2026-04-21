import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/theme/theme_colors.dart';

const String _appVersion = '1.0.0';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('About', style: GoogleFonts.instrumentSerif(fontSize: 36)),
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: context.primarySurface,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Center(child: Text('🥦', style: TextStyle(fontSize: 44))),
              ),
              const SizedBox(height: 20),
              Text(
                'The Nutrition League',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: context.textPrimary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Build Healthy Habits. Win Together.',
                style: TextStyle(fontSize: 14, color: context.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Version', style: TextStyle(color: context.textSecondary, fontSize: 14)),
                    const SizedBox(width: 10),
                    Text(_appVersion,
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: context.textPrimary)),
                  ],
                ),
              ),
              const SizedBox(height: 40),

              // Brandhero credit
              Divider(color: context.borderColor),
              const SizedBox(height: 20),
              Text(
                'DESIGNED & DEVELOPED BY',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: context.textHint,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset(
                      'assets/images/brandhero_logo.png',
                      width: 44,
                      height: 44,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Brandhero',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Brand strategy, design & storytelling —\nyour dedicated design & marketing arm.',
                        style: TextStyle(fontSize: 12, color: context.textSecondary, height: 1.4),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
