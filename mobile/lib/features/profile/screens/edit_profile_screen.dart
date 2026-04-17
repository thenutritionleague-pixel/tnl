import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/widgets/user_avatar.dart';

class EditProfileScreen extends StatefulWidget {
  final Map<String, dynamic> profile;
  const EditProfileScreen({super.key, required this.profile});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final TextEditingController _nameCtrl;
  bool _saving = false;
  bool _nameDirty = false;
  bool _uploadingAvatar = false;
  String? _avatarUrl;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.profile['name'] as String? ?? '');
    _avatarUrl = widget.profile['avatar_url'] as String?;
    _nameCtrl.addListener(() {
      final dirty = _nameCtrl.text.trim() != (widget.profile['name'] as String? ?? '').trim();
      if (dirty != _nameDirty) setState(() => _nameDirty = dirty);
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined, color: AppColors.primary),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: AppColors.primary),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return;

    final picked = await ImagePicker().pickImage(source: source, imageQuality: 80);
    if (picked == null || !mounted) return;

    setState(() => _uploadingAvatar = true);
    try {
      final newUrl = await ProfileService.uploadAvatar(
          widget.profile['id'] as String, File(picked.path));
      if (mounted) setState(() { _avatarUrl = newUrl; _uploadingAvatar = false; });
    } catch (e) {
      if (mounted) {
        setState(() => _uploadingAvatar = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _saveName() async {
    if (!_nameDirty || _saving) return;
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ProfileService.updateName(widget.profile['id'] as String, name);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Name updated'), backgroundColor: AppColors.primary),
        );
        context.pop(true); // return true → caller reloads profile
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _openEmailChange() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EmailChangeSheet(
        profileId: widget.profile['id'] as String,
        currentEmail: widget.profile['email'] as String? ?? '',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.profile['name'] as String? ?? '';
    final email = widget.profile['email'] as String? ?? '';
    final avatarColor = widget.profile['avatar_color'] as String?;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Edit Profile',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                ),
              ),
            )
          else
            TextButton(
              onPressed: _nameDirty ? _saveName : null,
              child: Text(
                'Save',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: _nameDirty ? AppColors.primary : AppColors.textHint,
                ),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Avatar
          Center(
            child: GestureDetector(
              onTap: _uploadingAvatar ? null : _pickAvatar,
              child: Stack(
                children: [
                  UserAvatar(
                    name: name,
                    avatarColor: avatarColor,
                    avatarUrl: _avatarUrl,
                    radius: 40,
                  ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: _uploadingAvatar ? AppColors.border : AppColors.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: _uploadingAvatar
                          ? const Padding(
                              padding: EdgeInsets.all(6),
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 15),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 28),

          // Name field
          _FieldLabel(label: 'Full Name'),
          const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: TextField(
              controller: _nameCtrl,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
              decoration: const InputDecoration(
                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: InputBorder.none,
                hintText: 'Enter your name',
                hintStyle: TextStyle(color: AppColors.textHint),
              ),
              textCapitalization: TextCapitalization.words,
            ),
          ),
          const SizedBox(height: 20),

          // Email field (read-only + change button)
          _FieldLabel(label: 'Email'),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(email,
                      style: const TextStyle(fontSize: 15, color: AppColors.textSecondary)),
                ),
                GestureDetector(
                  onTap: _openEmailChange,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.primarySurface,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Change',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'A verification code will be sent to your new email.',
            style: TextStyle(fontSize: 11, color: AppColors.textHint),
          ),
        ],
      ),
    );
  }
}

// ── Email Change Bottom Sheet ─────────────────────────────────────────────────

class _EmailChangeSheet extends StatefulWidget {
  final String profileId;
  final String currentEmail;
  const _EmailChangeSheet({required this.profileId, required this.currentEmail});

  @override
  State<_EmailChangeSheet> createState() => _EmailChangeSheetState();
}

class _EmailChangeSheetState extends State<_EmailChangeSheet> {
  final _emailCtrl = TextEditingController();
  final List<TextEditingController> _otpCtrl =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _otpFocus = List.generate(6, (_) => FocusNode());

  int _step = 1; // 1 = enter new email, 2 = enter OTP
  bool _loading = false;
  String? _error;
  String _pendingEmail = '';

  @override
  void dispose() {
    _emailCtrl.dispose();
    for (final c in _otpCtrl) c.dispose();
    for (final f in _otpFocus) f.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailCtrl.text.trim().toLowerCase();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Please enter a valid email address.');
      return;
    }
    if (email == widget.currentEmail.toLowerCase()) {
      setState(() => _error = 'This is already your current email.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.sendEmailChangeOtp(email);
      _pendingEmail = email;
      if (mounted) {
        setState(() { _step = 2; _loading = false; });
        Future.delayed(const Duration(milliseconds: 200),
            () { if (mounted) _otpFocus[0].requestFocus(); });
      }
    } catch (e) {
      if (mounted) setState(() { _error = 'Failed to send code. Try again.'; _loading = false; });
    }
  }

  Future<void> _verify() async {
    final code = _otpCtrl.map((c) => c.text).join();
    if (code.length < 6) {
      setState(() => _error = 'Please enter the full 6-digit code.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.verifyEmailChange(_pendingEmail, code);
      await ProfileService.updateEmail(widget.profileId, _pendingEmail);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Email updated successfully'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() { _error = 'Invalid code. Please try again.'; _loading = false; });
    }
  }

  void _onOtpChanged(int index, String value) {
    if (value.length == 1 && index < 5) _otpFocus[index + 1].requestFocus();
    if (value.isEmpty && index > 0) _otpFocus[index - 1].requestFocus();
    final code = _otpCtrl.map((c) => c.text).join();
    if (code.length == 6) _verify();
  }

  void _onOtpPaste(String pasted) {
    final digits = pasted.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 6) {
      for (int i = 0; i < 6; i++) _otpCtrl[i].text = digits[i];
      _otpFocus[5].requestFocus();
      _verify();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(24, 20, 24, 24 + bottom),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          Text(
            _step == 1 ? 'Change Email' : 'Verify New Email',
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 4),
          Text(
            _step == 1
                ? 'Enter your new email address. We\'ll send a verification code.'
                : 'Enter the 6-digit code sent to $_pendingEmail',
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 24),

          if (_step == 1) ...[
            Container(
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                style: const TextStyle(fontSize: 15, color: AppColors.textPrimary),
                decoration: const InputDecoration(
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  border: InputBorder.none,
                  hintText: 'New email address',
                  hintStyle: TextStyle(color: AppColors.textHint),
                ),
              ),
            ),
          ] else ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (i) => _OtpBox(
                controller: _otpCtrl[i],
                focusNode: _otpFocus[i],
                onChanged: (v) => _onOtpChanged(i, v),
                onPaste: _onOtpPaste,
              )),
            ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: _loading ? null : () => setState(() { _step = 1; _error = null; }),
              child: const Text('← Back to email',
                  style: TextStyle(fontSize: 12, color: AppColors.primary)),
            ),
          ],

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(fontSize: 12, color: AppColors.error)),
          ],

          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _loading ? null : (_step == 1 ? _sendCode : _verify),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(
                      _step == 1 ? 'Send Verification Code' : 'Verify & Update Email',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Reusable OTP box ──────────────────────────────────────────────────────────

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
        style: const TextStyle(
            fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled: true,
          fillColor: AppColors.primarySurface,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border, width: 1.5),
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

// ── Field label ───────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String label;
  const _FieldLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(label,
        style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.textSecondary,
            letterSpacing: 0.3));
  }
}
