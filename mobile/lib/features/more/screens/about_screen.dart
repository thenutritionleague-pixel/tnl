import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';

const String _appVersion = '2.0.0';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('About'), backgroundColor: AppColors.surface),
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
                  color: AppColors.primarySurface,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Center(child: Text('🥦', style: TextStyle(fontSize: 44))),
              ),
              const SizedBox(height: 20),
              const Text(
                'Yi Nutrition League',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              const Text(
                'Build Healthy Habits. Win Together.',
                style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Version', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                    SizedBox(width: 10),
                    Text(_appVersion,
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              const Text('Powered by Supabase ⚡',
                  style: TextStyle(fontSize: 12, color: AppColors.textHint)),
            ],
          ),
        ),
      ),
    );
  }
}
