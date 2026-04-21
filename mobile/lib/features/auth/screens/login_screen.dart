import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/theme/theme_colors.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final List<TextEditingController> _otpControllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _otpFocusNodes =
      List.generate(6, (_) => FocusNode());

  int _step = 1;
  bool _loading = false;
  String _error = '';
  String _emailForOtp = '';

  @override
  void dispose() {
    _emailController.dispose();
    for (final c in _otpControllers) c.dispose();
    for (final f in _otpFocusNodes) f.dispose();
    super.dispose();
  }

  Future<void> _handleSendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Please enter your email address.');
      return;
    }
    setState(() { _loading = true; _error = ''; });

    try {
      final access = await AuthService.checkAccess(email);
      if (access == null) {
        setState(() {
          _error = 'This email is not invited. Contact your admin.';
          _loading = false;
        });
        return;
      }
      await AuthService.sendOtp(email);
      setState(() {
        _emailForOtp = email;
        _step = 2;
        _loading = false;
      });
      Future.delayed(const Duration(milliseconds: 200), () {
        if (mounted) _otpFocusNodes[0].requestFocus();
      });
    } catch (e) {
      debugPrint('[LoginScreen] sendOtp error: $e');
      setState(() {
        _error = 'Failed to send code. Please try again.';
        _loading = false;
      });
    }
  }

  Future<void> _handleVerifyOtp() async {
    final code = _otpControllers.map((c) => c.text).join();
    if (code.length < 6) {
      setState(() => _error = 'Enter the full 6-digit code.');
      return;
    }
    setState(() { _loading = true; _error = ''; });

    try {
      final response = await AuthService.verifyOtp(_emailForOtp, code);
      if (response.session == null) {
        setState(() { _error = 'Invalid or expired code.'; _loading = false; });
        return;
      }

      final authId = response.user?.id;
      if (authId == null) {
        setState(() { _error = 'Authentication error.'; _loading = false; });
        return;
      }

      final invite = await ProfileService.getInvite(_emailForOtp);
      if (invite == null) {
        if (mounted) setState(() { _error = 'Access denied. Contact your admin.'; _loading = false; });
        return;
      }

      final profile = await ProfileService.getProfile(authId);
      if (profile == null || profile['org_id'] == null) {
        if (mounted) {
          context.go('/signup', extra: {
            'email': _emailForOtp,
            'orgId': invite['org_id'],
            'inviteId': invite['id'],
            'teamId': invite['team_id'],
          });
        }
      } else {
        if (mounted) context.go('/home');
      }
    } catch (e) {
      setState(() { _error = 'Invalid or expired code.'; _loading = false; });
    }
  }

  void _onOtpChanged(int index, String value) {
    if (value.length == 1 && index < 5) _otpFocusNodes[index + 1].requestFocus();
    if (value.isEmpty && index > 0) _otpFocusNodes[index - 1].requestFocus();
    if (_otpControllers.map((c) => c.text).join().length == 6) _handleVerifyOtp();
  }

  void _onOtpPaste(String pasted) {
    final digits = pasted.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 6) {
      for (int i = 0; i < 6; i++) {
        _otpControllers[i].text = digits[i];
        _otpControllers[i].selection = TextSelection.fromPosition(
          TextPosition(offset: 1),
        );
      }
      _otpFocusNodes[5].requestFocus();
      _handleVerifyOtp();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.primaryMint,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Top bar ───────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: _step == 1 ? _buildLogoBar() : _buildBackBar(),
                ),
              ),

              const SizedBox(height: 48),

              // ── Headline ──────────────────────────────────────────────
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.06),
                      end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: _step == 1
                    ? _buildEmailHeadline()
                    : _buildOtpHeadline(),
              ),

              const Spacer(),

              // ── Form ──────────────────────────────────────────────────
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                transitionBuilder: (child, anim) =>
                    FadeTransition(opacity: anim, child: child),
                child: _step == 1 ? _buildEmailForm() : _buildOtpForm(),
              ),

              // ── Error ─────────────────────────────────────────────────
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: AppColors.error, size: 15),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        _error,
                        style: const TextStyle(
                            color: AppColors.error,
                            fontSize: 13,
                            fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  // ── Logo bar (step 1) ────────────────────────────────────────────────────
  Widget _buildLogoBar() {
    return Row(
      key: const ValueKey('logo'),
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Center(child: Text('🥦', style: TextStyle(fontSize: 18))),
        ),
        const SizedBox(width: 10),
        Text(
          'The Nutrition League',
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.85)),
        ),
      ],
    );
  }

  // ── Back bar (step 2) ────────────────────────────────────────────────────
  Widget _buildBackBar() {
    return GestureDetector(
      key: const ValueKey('back'),
      onTap: () => setState(() { _step = 1; _error = ''; }),
      child: Row(
        children: [
          Icon(Icons.arrow_back_rounded,
              color: Colors.white.withValues(alpha: 0.8), size: 20),
          const SizedBox(width: 8),
          Text('Back',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.8))),
        ],
      ),
    );
  }

  // ── Email headline ────────────────────────────────────────────────────────
  Widget _buildEmailHeadline() {
    return Column(
      key: const ValueKey('h-email'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Build Healthy\nHabits.',
          style: GoogleFonts.instrumentSerif(
            fontSize: 54,
            fontStyle: FontStyle.italic,
            color: Colors.white,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Win Together.',
          style: GoogleFonts.instrumentSerif(
            fontSize: 54,
            fontStyle: FontStyle.italic,
            color: Colors.white.withValues(alpha: 0.45),
            height: 1.05,
          ),
        ),
      ],
    );
  }

  // ── OTP headline ─────────────────────────────────────────────────────────
  Widget _buildOtpHeadline() {
    return Column(
      key: const ValueKey('h-otp'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Check your\ninbox.',
          style: GoogleFonts.instrumentSerif(
            fontSize: 54,
            fontStyle: FontStyle.italic,
            color: Colors.white,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 12),
        RichText(
          text: TextSpan(
            style: TextStyle(
                fontSize: 14, color: Colors.white.withValues(alpha: 0.6)),
            children: [
              const TextSpan(text: 'Code sent to '),
              TextSpan(
                text: _emailForOtp,
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Frosted input decoration ──────────────────────────────────────────────
  InputDecoration _frostedInput(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 15),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.10),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.5), width: 1.5),
        ),
      );

  // ── White pill button ─────────────────────────────────────────────────────
  Widget _whiteButton({required String label, required VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedOpacity(
        opacity: onTap == null ? 0.5 : 1.0,
        duration: const Duration(milliseconds: 150),
        child: Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Center(
            child: _loading
                ? const SizedBox(
                    height: 20, width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: AppColors.primary))
                : Text(
                    label,
                    style: GoogleFonts.instrumentSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF0A1A10),
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  // ── Email form ────────────────────────────────────────────────────────────
  Widget _buildEmailForm() {
    return Column(
      key: const ValueKey('f-email'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _handleSendOtp(),
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: _frostedInput('you@example.com'),
        ),
        const SizedBox(height: 14),
        _whiteButton(
          label: 'Continue',
          onTap: _loading ? null : _handleSendOtp,
        ),
      ],
    );
  }

  // ── OTP form ──────────────────────────────────────────────────────────────
  Widget _buildOtpForm() {
    return Column(
      key: const ValueKey('f-otp'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(6, (i) => _OtpBox(
            controller: _otpControllers[i],
            focusNode: _otpFocusNodes[i],
            onChanged: (v) => _onOtpChanged(i, v),
            onPaste: _onOtpPaste,
          )),
        ),
        const SizedBox(height: 20),
        _whiteButton(
          label: 'Verify Code',
          onTap: _loading ? null : _handleVerifyOtp,
        ),
        const SizedBox(height: 16),
        Center(
          child: GestureDetector(
            onTap: _loading ? null : _handleSendOtp,
            child: Text(
              'Resend code',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.6),
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── OTP box ───────────────────────────────────────────────────────────────────
class _OtpBox extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final void Function(String) onChanged;
  final void Function(String) onPaste;

  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onPaste,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 54,
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: context.textPrimary),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled: true,
          fillColor: Theme.of(context).colorScheme.surface,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(
                color: Theme.of(context).colorScheme.outline, width: 1.5),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
        onChanged: (v) {
          if (v.length > 1) {
            onPaste(v);
          } else {
            onChanged(v);
          }
        },
      ),
    );
  }
}
