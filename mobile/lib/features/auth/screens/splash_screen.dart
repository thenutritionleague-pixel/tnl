import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/theme/theme_colors.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnim;
  late Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200));
    _fadeAnim =
        CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _scaleAnim = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
    _controller.forward();

    // After animation, check session and route accordingly
    Future.delayed(const Duration(milliseconds: 2000), () {
      if (!mounted) return;
      final session = Supabase.instance.client.auth.currentSession;
      if (session != null) {
        context.go('/home');
      } else {
        context.go('/login');
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDarkMode;
    final bgColor = isDark ? Theme.of(context).scaffoldBackgroundColor : AppColors.primary;
    final iconContainerColor = isDark
        ? AppColors.primary.withValues(alpha: 0.15)
        : Colors.white.withValues(alpha: 0.15);
    final titleColor = isDark ? AppColors.primary : Colors.white;
    final subtitleColor = isDark
        ? context.textSecondary
        : Colors.white.withValues(alpha: 0.75);
    final spinnerColor = isDark ? AppColors.primary : Colors.white.withValues(alpha: 0.6);
    final logoContainerColor = isDark
        ? AppColors.primary.withValues(alpha: 0.12)
        : Colors.white.withValues(alpha: 0.15);
    final labelColor = isDark
        ? context.textHint
        : Colors.white.withValues(alpha: 0.6);

    return Scaffold(
      backgroundColor: bgColor,
      body: Stack(
        children: [
          // Centered main content
          Center(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: ScaleTransition(
                scale: _scaleAnim,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        color: iconContainerColor,
                        borderRadius: BorderRadius.circular(28),
                      ),
                      child: const Center(
                        child: Text('🥦', style: TextStyle(fontSize: 52)),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'The Nutrition League',
                      style: TextStyle(
                        color: titleColor,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Build Healthy Habits. Win Together.',
                      style: TextStyle(
                        color: subtitleColor,
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    const SizedBox(height: 48),
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation<Color>(spinnerColor),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Partner logos pinned to bottom
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: FadeTransition(
              opacity: _fadeAnim,
              child: Column(
                children: [
                  Text(
                    'SUPPORTED BY',
                    style: TextStyle(
                      color: labelColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _PartnerLogo(
                        path: 'assets/images/mayur_logo.png',
                        containerColor: logoContainerColor,
                      ),
                      const SizedBox(width: 20),
                      _PartnerLogo(
                        path: 'assets/images/rakesh_logo.png',
                        containerColor: logoContainerColor,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PartnerLogo extends StatelessWidget {
  final String path;

  const _PartnerLogo({required this.path, required Color containerColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Image.asset(
        path,
        height: 40,
        fit: BoxFit.contain,
      ),
    );
  }
}
