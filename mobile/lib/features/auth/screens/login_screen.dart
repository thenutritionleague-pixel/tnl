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
      for (int i = 0; i < 6; i++) _otpControllers[i].text = digits[i];
      _otpFocusNodes[5].requestFocus();
      _handleVerifyOtp();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.primaryMint,
      body: SafeArea(
        child: Column(
          children: [
            // ── Top bar ──────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: _step == 1 ? _buildLogoBar() : _buildBackBar(),
              ),
            ),

            // ── Hero headline ────────────────────────────────────────────
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Spacer(flex: 2),

                    // Serif headline — changes per step
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

                    const SizedBox(height: 32),

                    // ── Form ─────────────────────────────────────────────
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: child,
                      ),
                      child: _step == 1
                          ? _buildEmailForm()
                          : _buildOtpForm(),
                    ),

                    // ── Error ─────────────────────────────────────────────
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 12),
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

                    const Spacer(flex: 3),
                  ],
                ),
              ),
            ),
          ],
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
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Center(child: Text('🥦', style: TextStyle(fontSize: 19))),
        ),
        const SizedBox(width: 10),
        Text(
          'The Nutrition League',
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.textPrimary),
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
          Icon(Icons.arrow_back_rounded, color: context.textPrimary, size: 20),
          const SizedBox(width: 8),
          Text('Back',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: context.textPrimary)),
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
            fontSize: 52,
            fontStyle: FontStyle.italic,
            color: context.textPrimary,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Win Together.',
          style: GoogleFonts.instrumentSerif(
            fontSize: 52,
            fontStyle: FontStyle.italic,
            color: AppColors.primary,
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
            fontSize: 52,
            fontStyle: FontStyle.italic,
            color: context.textPrimary,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 10),
        RichText(
          text: TextSpan(
            style: TextStyle(fontSize: 14, color: context.textSecondary),
            children: [
              const TextSpan(text: 'Code sent to '),
              TextSpan(
                text: _emailForOtp,
                style: TextStyle(
                    color: context.textPrimary,
                    fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Email form ────────────────────────────────────────────────────────────
  Widget _buildEmailForm() {
    return Column(
      key: const ValueKey('f-email'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Email address',
          style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: context.textSecondary,
              letterSpacing: 0.4),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _handleSendOtp(),
          decoration: const InputDecoration(hintText: 'you@example.com'),
        ),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _loading ? null : _handleSendOtp,
          child: _loading
              ? const SizedBox(
                  height: 20, width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Send Code'),
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
        ElevatedButton(
          onPressed: _loading ? null : _handleVerifyOtp,
          child: _loading
              ? const SizedBox(
                  height: 20, width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Verify Code'),
        ),
        const SizedBox(height: 12),
        Center(
          child: TextButton(
            onPressed: _loading ? null : _handleSendOtp,
            child: const Text(
              'Resend code',
              style: TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w500,
                  fontSize: 14),
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
        maxLength: 1,
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
        onChanged: onChanged,
      ),
    );
  }
}
