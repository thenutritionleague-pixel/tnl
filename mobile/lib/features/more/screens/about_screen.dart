import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/theme/theme_colors.dart';

const String _appVersion = '2.0.0';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About')),
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
              Text('Powered by Supabase ⚡',
                  style: TextStyle(fontSize: 12, color: context.textHint)),
            ],
          ),
        ),
      ),
    );
  }
}
