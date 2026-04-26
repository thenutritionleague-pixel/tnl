import 'dart:math';
import 'dart:typed_data';
import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';
import '../../../core/theme/theme_colors.dart';

class TaskSubmissionScreen extends StatefulWidget {
  final Map<String, dynamic> task;

  const TaskSubmissionScreen({super.key, required this.task});

  @override
  State<TaskSubmissionScreen> createState() => _TaskSubmissionScreenState();
}

class _TaskSubmissionScreenState extends State<TaskSubmissionScreen> {
  XFile? _selectedImage;
  Uint8List? _imageBytes;
  bool _submitting = false;
  bool _done = false;
  final _noteController = TextEditingController();

  late final ConfettiController _confettiCtrl =
      ConfettiController(duration: const Duration(seconds: 4));

  @override
  void dispose() {
    _confettiCtrl.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Map<String, dynamic> get _taskData =>
      widget.task['task'] as Map<String, dynamic>? ?? widget.task;
  String  get _profileId    => widget.task['profileId']    as String? ?? '';
  String  get _orgId        => widget.task['orgId']        as String? ?? '';
  bool    get _isResubmit   => widget.task['isResubmit']   as bool?   ?? false;
  /// Original submitted_date from Task History — null means use today.
  String? get _submittedDate => widget.task['submittedDate'] as String?;

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 82);
    if (picked != null && mounted) {
      final bytes = await picked.readAsBytes();
      setState(() { _selectedImage = picked; _imageBytes = bytes; });
    }
  }

  Future<void> _submit() async {
    if (_selectedImage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select or take a photo first.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    final taskId = _taskData['id'] as String? ?? '';
    final challengeId = _taskData['challenge_id'] as String? ?? '';

    setState(() => _submitting = true);

    try {
      await TaskService.submitTaskImage(
        taskId: taskId,
        challengeId: challengeId,
        userId: _profileId,
        orgId: _orgId,
        imageFile: _selectedImage!,
        submittedDate: _submittedDate,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
      );
      if (mounted) {
        setState(() { _submitting = false; _done = true; });
        _confettiCtrl.play();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final task  = _taskData;
    final title  = task['title']       as String? ?? 'Task';
    final desc   = task['description'] as String? ?? '';
    final points = task['points']      as int?    ?? 0;
    final icon   = task['icon']        as String? ?? '📋';

    // ── Success state ──────────────────────────────────────────────────────
    if (_done) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            // ── Confetti from top-center ───────────────────────────────────
            Align(
              alignment: Alignment.topCenter,
              child: ConfettiWidget(
                confettiController: _confettiCtrl,
                blastDirectionality: BlastDirectionality.explosive,
                numberOfParticles: 28,
                gravity: 0.25,
                emissionFrequency: 0.06,
                maxBlastForce: 20,
                minBlastForce: 8,
                colors: const [
                  Color(0xFF059669), Color(0xFF34D399), Color(0xFFF59E0B),
                  Color(0xFFFBBF24), Color(0xFF6EE7B7), Color(0xFF10B981),
                ],
                createParticlePath: (size) {
                  final path = Path();
                  // mix of circles and squares
                  if (Random().nextBool()) {
                    path.addOval(Rect.fromCircle(
                        center: Offset(size.width / 2, size.height / 2),
                        radius: size.width / 2));
                  } else {
                    path.addRect(Rect.fromLTWH(0, 0, size.width, size.height));
                  }
                  return path;
                },
              ),
            ),
            // ── Success content ────────────────────────────────────────────
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Pulsing icon
                    _PulseIcon(),
                    const SizedBox(height: 28),
                    Text(
                      'Submitted!',
                      style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Your proof photo is waiting for\nadmin approval.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: context.textSecondary,
                          fontSize: 14,
                          height: 1.6),
                    ),
                    const SizedBox(height: 44),
                    GestureDetector(
                      onTap: () => context.go('/tasks'),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.35),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: Text(
                            'Back to Tasks',
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    // ── Main submission screen ─────────────────────────────────────────────
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(_isResubmit ? 'Resubmit Proof' : 'Submit Proof'),
        elevation: 0,
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Task header card ──────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Theme.of(context).colorScheme.outline),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52, height: 52,
                    decoration: BoxDecoration(
                      color: context.primarySurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Center(child: Text(icon, style: const TextStyle(fontSize: 28))),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: context.textPrimary)),
                        if (desc.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(desc, style: TextStyle(fontSize: 13, color: context.textSecondary, height: 1.4)),
                        ],
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: context.primarySurface,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: context.primaryMint),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('🥦', style: TextStyle(fontSize: 13)),
                              const SizedBox(width: 4),
                              Text('$points',
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // ── Photo upload area ──────────────────────────────────────────
            Text(
              'Upload Your Proof Photo',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              'Take a photo or pick from your gallery as evidence.',
              style: TextStyle(fontSize: 12, color: context.textSecondary),
            ),
            const SizedBox(height: 12),

            // Photo preview / upload area
            GestureDetector(
              onTap: () => _pickImage(ImageSource.gallery),
              child: Container(
                height: 220,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: _selectedImage != null
                        ? AppColors.primary
                        : Theme.of(context).colorScheme.outline,
                    width: _selectedImage != null ? 2 : 1,
                  ),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
                ),
                clipBehavior: Clip.antiAlias,
                child: _selectedImage != null
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.memory(_imageBytes!, fit: BoxFit.cover),
                          Positioned(
                            top: 10, right: 10,
                            child: GestureDetector(
                              onTap: () => setState(() { _selectedImage = null; _imageBytes = null; }),
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
                              ),
                            ),
                          ),
                          Positioned(
                            bottom: 10, right: 10,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Text('Change', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 60, height: 60,
                            decoration: BoxDecoration(
                              color: context.primarySurface,
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: const Icon(Icons.add_photo_alternate_outlined, size: 30, color: AppColors.primary),
                          ),
                          const SizedBox(height: 12),
                          Text('Tap to upload from gallery', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: context.textPrimary)),
                          const SizedBox(height: 4),
                          Text('or use the camera button below', style: TextStyle(fontSize: 12, color: context.textSecondary)),
                        ],
                      ),
              ),
            ),

            const SizedBox(height: 12),

            // Camera button alternative
            if (_selectedImage == null)
              GestureDetector(
                onTap: () => _pickImage(ImageSource.camera),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Theme.of(context).colorScheme.outline),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.camera_alt_outlined, color: AppColors.primary, size: 20),
                      SizedBox(width: 8),
                      Text('Take a Photo', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 14)),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 24),

            // ── Optional note ──────────────────────────────────────────────
            Text(
              'Add a note',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              'Optional — anything you want the admin to know.',
              style: TextStyle(fontSize: 12, color: context.textSecondary),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _noteController,
              maxLines: 3,
              minLines: 3,
              maxLength: 200,
              textCapitalization: TextCapitalization.sentences,
              style: TextStyle(fontSize: 14, color: context.textPrimary),
              decoration: InputDecoration(
                hintText: 'e.g. Completed 10km run this morning...',
                hintStyle: TextStyle(fontSize: 13, color: context.textHint),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surface,
                counterStyle: TextStyle(fontSize: 11, color: context.textHint),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: Theme.of(context).colorScheme.outline),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: Theme.of(context).colorScheme.outline),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
                ),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),

            const SizedBox(height: 24),

            // Submit button
            GestureDetector(
              onTap: _submitting ? null : _submit,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  color: _submitting
                      ? AppColors.primary.withValues(alpha: 0.6)
                      : (_selectedImage != null ? AppColors.primary : Theme.of(context).colorScheme.outline),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Center(
                  child: _submitting
                      ? const SizedBox(
                          height: 20, width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text(
                          'Submit Proof',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                ),
              ),
            ),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}

// ── Pulsing success icon ─────────────────────────────────────────────────────

class _PulseIcon extends StatefulWidget {
  @override
  State<_PulseIcon> createState() => _PulseIconState();
}

class _PulseIconState extends State<_PulseIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  late final Animation<double> _scale =
      Tween<double>(begin: 1.0, end: 1.08).animate(
    CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
  );

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScaleTransition(
        scale: _scale,
        child: Container(
          width: 110,
          height: 110,
          decoration: BoxDecoration(
            color: context.primarySurface,
            shape: BoxShape.circle,
            border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.35), width: 2.5),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.18),
                blurRadius: 24,
                spreadRadius: 4,
              ),
            ],
          ),
          child: const Center(
            child: Text('🎉', style: TextStyle(fontSize: 52)),
          ),
        ),
      );
}
