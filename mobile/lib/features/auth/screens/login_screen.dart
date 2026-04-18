import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
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

  int _step = 1; // 1 = email, 2 = OTP
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
          _error = 'You are not invited. Contact your organization admin.';
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
      // Focus first OTP field
      Future.delayed(const Duration(milliseconds: 200), () {
        if (mounted) _otpFocusNodes[0].requestFocus();
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to send OTP. Please try again.';
        _loading = false;
      });
    }
  }

  Future<void> _handleVerifyOtp() async {
    final code = _otpControllers.map((c) => c.text).join();
    if (code.length < 6) {
      setState(() => _error = 'Please enter the full 6-digit code.');
      return;
    }
    setState(() { _loading = true; _error = ''; });

    try {
      final response = await AuthService.verifyOtp(_emailForOtp, code);
      if (response.session == null) {
        setState(() {
          _error = 'Invalid or expired code. Please try again.';
          _loading = false;
        });
        return;
      }

      // Check if profile exists; if not → signup flow
      final authId = response.user?.id;
      if (authId == null) {
        setState(() { _error = 'Authentication error.'; _loading = false; });
        return;
      }

      // 1. MUST BE WHITELISTED: The invitation is the master switch
      final invite = await ProfileService.getInvite(_emailForOtp);
      
      if (invite == null) {
        // Not in whitelist = NO ACCESS (even if they have an old profile)
        if (mounted) {
          setState(() {
            _error = 'Access Denied. Your email is not whitelisted for this league.';
            _loading = false;
          });
        }
        return;
      }

      // 2. CHECK PROFILE: If whitelisted, check if they've finished setup
      final profile = await ProfileService.getProfile(authId);
      
      if (profile == null || profile['org_id'] == null) {
        // Whitelisted BUT no profile yet -> Go to signup
        if (mounted) {
          context.go('/signup', extra: {
            'email': _emailForOtp,
            'orgId': invite['org_id'],
            'inviteId': invite['id'],
            'teamId': invite['team_id'],
          });
        }
      } else {
        // Whitelisted AND has profile -> Welcome back!
        if (mounted) context.go('/home');
      }
    } catch (e) {
      setState(() {
        _error = 'Invalid or expired code. Please try again.';
        _loading = false;
      });
    }
  }

  void _onOtpChanged(int index, String value) {
    if (value.length == 1 && index < 5) {
      _otpFocusNodes[index + 1].requestFocus();
    }
    if (value.isEmpty && index > 0) {
      _otpFocusNodes[index - 1].requestFocus();
    }
    // Auto-submit when all 6 digits entered
    final code = _otpControllers.map((c) => c.text).join();
    if (code.length == 6) _handleVerifyOtp();
  }

  void _onOtpPaste(String pasted) {
    final digits = pasted.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 6) {
      for (int i = 0; i < 6; i++) {
        _otpControllers[i].text = digits[i];
      }
      _otpFocusNodes[5].requestFocus();
      _handleVerifyOtp();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primaryMint,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),

              // Logo
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Center(
                        child: Text('🥦', style: TextStyle(fontSize: 24))),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('The Nutrition League 2.0',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: context.textPrimary)),
                      Text('Wellness Challenge',
                          style: TextStyle(
                              fontSize: 12,
                              color: context.textPrimary.withValues(alpha: 0.6))),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 40),

              Text(
                'Build Healthy\nHabits.',
                style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                    height: 1.15),
              ),
              const SizedBox(height: 4),
              const Text(
                'Win Together.',
                style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                    height: 1.15),
              ),

              const SizedBox(height: 32),

              Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 24,
                        offset: const Offset(0, 8)),
                  ],
                ),
                padding: const EdgeInsets.all(24),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  child: _step == 1 ? _buildEmailStep() : _buildOtpStep(),
                ),
              ),

              if (_error.isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline_rounded,
                          color: AppColors.error, size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(_error,
                            style: const TextStyle(
                                color: AppColors.error,
                                fontSize: 13,
                                fontWeight: FontWeight.w500)),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmailStep() {
    return Column(
      key: const ValueKey('email'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Sign In',
            style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: context.textPrimary)),
        const SizedBox(height: 4),
        Text('Enter your email to receive a sign-in code.',
            style: TextStyle(fontSize: 13, color: context.textSecondary)),
        const SizedBox(height: 24),
        Text('Email address',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: context.textPrimary)),
        const SizedBox(height: 8),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _handleSendOtp(),
          decoration: const InputDecoration(hintText: 'you@example.com'),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _loading ? null : _handleSendOtp,
          child: _loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Text('Send Code'),
        ),
      ],
    );
  }

  Widget _buildOtpStep() {
    return Column(
      key: const ValueKey('otp'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => setState(() { _step = 1; _error = ''; }),
              icon: Icon(Icons.arrow_back_rounded,
                  color: context.textPrimary),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
            const SizedBox(width: 8),
            Text('Check your inbox',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: context.textPrimary)),
          ],
        ),
        const SizedBox(height: 4),
        Text('We sent a 6-digit code to\n$_emailForOtp',
            style: TextStyle(
                fontSize: 13, color: context.textSecondary, height: 1.5)),
        const SizedBox(height: 28),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(6, (i) => _OtpBox(
            controller: _otpControllers[i],
            focusNode: _otpFocusNodes[i],
            onChanged: (v) => _onOtpChanged(i, v),
            onPaste: _onOtpPaste,
          )),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _loading ? null : _handleVerifyOtp,
          child: _loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Text('Verify Code'),
        ),
        const SizedBox(height: 16),
        Center(
          child: TextButton(
            onPressed: _loading ? null : _handleSendOtp,
            child: const Text('Resend code',
                style: TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w500,
                    fontSize: 14)),
          ),
        ),
      ],
    );
  }
}

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
      width: 44,
      height: 52,
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength: 1,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: TextStyle(
            fontSize: 20, fontWeight: FontWeight.w700, color: context.textPrimary),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled: true,
          fillColor: AppColors.primarySurface,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: context.borderColor, width: 1.5),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
        onChanged: onChanged,
      ),
    );
  }
}
