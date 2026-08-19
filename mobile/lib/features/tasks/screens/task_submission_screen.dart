import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';
import '../../../core/theme/theme_colors.dart';
import '../../../core/utils/org_date_utils.dart';

class TaskSubmissionScreen extends StatefulWidget {
  final Map<String, dynamic> task;

  const TaskSubmissionScreen({super.key, required this.task});

  @override
  State<TaskSubmissionScreen> createState() => _TaskSubmissionScreenState();
}

class _TaskSubmissionScreenState extends State<TaskSubmissionScreen> {
  XFile? _selectedImage;     // also reused for picked video file
  Uint8List? _imageBytes;
  Uint8List? _videoBytes;    // web: video bytes read at pick time (blob can expire before submit)
  bool _isVideoPicked = false;
  double? _compressProgress; // 0–100 during video compression
  double? _uploadProgress;   // 0.0–1.0 during Bunny upload
  bool _submitting = false;
  bool _done = false;
  int? _selectedTierIndex;
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
  String  get _orgTimezone  => widget.task['orgTimezone']  as String? ?? 'UTC';
  bool    get _isResubmit   => widget.task['isResubmit']   as bool?   ?? false;
  /// Original submitted_date from Task History — null means use today.
  String? get _submittedDate => widget.task['submittedDate'] as String?;

  bool get _isLocked => isInSubmissionLockout(_orgTimezone);

  /// 'image' | 'video' — from the task config (defaults to image).
  String get _proofType => (_taskData['proof_type'] as String?) ?? 'image';
  bool get _isVideoTask => _proofType == 'video';
  int get _maxVideoSeconds => (_taskData['max_video_seconds'] as int?) ?? 90;
  /// null = this task has no minimum, so the check does not run.
  int? get _minVideoSeconds => _taskData['min_video_seconds'] as int?;

  Future<void> _pickImage(ImageSource source) async {
    // Cap proof photo at 1280×1280 + JPEG quality 82. Plenty for admin review
    // and AI analysis; brings typical 4MB iPhone photos down to ~200KB.
    final picked = await ImagePicker().pickImage(
      source: source,
      imageQuality: 82,
      maxWidth: 1280,
      maxHeight: 1280,
    );
    if (picked != null && mounted) {
      // Reject any non-image file extension (videos, audio, docs). image_picker
      // shouldn't allow these via pickImage, but be defensive against edge
      // cases where the picker passes through a non-image MIME.
      final lowerName = picked.name.toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
      final hasAllowedExt = allowedExts.any(lowerName.endsWith);
      if (!hasAllowedExt) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Only photos are accepted. Got "${lowerName.split('.').last}".'),
            backgroundColor: AppColors.error,
          ),
        );
        return;
      }

      final bytes = await picked.readAsBytes();
      // After resize+quality, proofs are typically <500KB. Anything >5MB is
      // suspicious (HEIC bypass, RAW, etc.) — reject with a clear message.
      if (bytes.lengthInBytes > 5 * 1024 * 1024) {
        final sizeMb = (bytes.lengthInBytes / (1024 * 1024)).toStringAsFixed(1);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Photo is $sizeMb MB which is too big. Please use a smaller photo (under 5 MB).',
            ),
            backgroundColor: AppColors.error,
          ),
        );
        return;
      }
      setState(() { _selectedImage = picked; _imageBytes = bytes; _isVideoPicked = false; });
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    // Picker enforces maxDuration only when source is the camera. For gallery
    // we validate duration after pick in task_service.dart.
    final picked = await ImagePicker().pickVideo(
      source: source,
      maxDuration: Duration(seconds: _maxVideoSeconds),
    );
    if (picked == null || !mounted) return;

    // Defensive extension allow-list — picker should return a video format.
    final lowerName = picked.name.toLowerCase();
    const allowed = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.3gp'];
    if (!allowed.any(lowerName.endsWith)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Only videos are accepted. Got "${lowerName.split('.').last}".'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // On web the picker hands us a temporary blob reference that the browser can
    // evict before Submit (large file, delay while adding a note, or a restrictive
    // in-app browser) → "Could not load Blob". Read the bytes NOW, while the blob
    // is fresh, and submit from memory instead.
    Uint8List? preloaded;
    if (kIsWeb) {
      try {
        preloaded = await picked.readAsBytes();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not read that video. Please open the app in Chrome or Safari '
              '(not inside WhatsApp/Instagram) and try again.',
            ),
            backgroundColor: AppColors.error,
            duration: Duration(seconds: 6),
          ),
        );
        return;
      }
    }
    if (!mounted) return;

    setState(() {
      _selectedImage = picked;
      _imageBytes = null;
      _videoBytes = preloaded;
      _isVideoPicked = true;
    });
  }

  List<Map<String, dynamic>> get _tiers {
    final raw = _taskData['points_tiers'];
    if (raw == null) return [];
    return List<Map<String, dynamic>>.from(raw as List);
  }

  bool get _hasTiers => _tiers.isNotEmpty;

  bool get _canSubmit =>
      _selectedImage != null && (!_hasTiers || _selectedTierIndex != null);

  Future<void> _submit() async {
    if (_isLocked) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🕐  Task submission opens at 4:00 AM. Try again then!',
              style: TextStyle(color: AppColors.surface, fontWeight: FontWeight.w600)),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }
    if (_selectedImage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isVideoTask
              ? 'Please record or select a video first.'
              : 'Please select or take a photo first.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    if (_hasTiers && _selectedTierIndex == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select your achievement tier first.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    final taskId = _taskData['id'] as String? ?? '';
    // Never hand an empty string to a uuid column: the member would see a raw
    // "invalid input syntax for type uuid" from Postgres. If this ever fires,
    // the task was opened without its id rather than anything the member did.
    if (taskId.isEmpty) {
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Couldn\'t open this task properly. Please go back to Tasks and try again.'),
          backgroundColor: AppColors.error,
          duration: Duration(seconds: 6),
        ),
      );
      return;
    }
    final rawChallengeId = _taskData['challenge_id'] as String?;
    final challengeId = (rawChallengeId != null && rawChallengeId.isNotEmpty) ? rawChallengeId : null;

    setState(() => _submitting = true);

    try {
      if (_isVideoTask) {
        await TaskService.submitTaskVideo(
          taskId: taskId,
          task: _taskData,
          challengeId: challengeId,
          userId: _profileId,
          orgId: _orgId,
          videoFile: _selectedImage!,
          preloadedBytes: _videoBytes,
          maxDurationSeconds: _maxVideoSeconds,
          minDurationSeconds: _minVideoSeconds,
          submittedDate: _submittedDate,
          orgTimezone: _orgTimezone,
          note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
          selectedTierIndex: _selectedTierIndex,
          onCompressProgress: (p) {
            if (mounted) setState(() => _compressProgress = p);
          },
          onUploadProgress: (p) {
            if (mounted) setState(() => _uploadProgress = p);
          },
        );
      } else {
        await TaskService.submitTaskImage(
          taskId: taskId,
          task: _taskData,
          challengeId: challengeId,
          userId: _profileId,
          orgId: _orgId,
          imageFile: _selectedImage!,
          submittedDate: _submittedDate,
          orgTimezone: _orgTimezone,
          note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
          selectedTierIndex: _selectedTierIndex,
        );
      }
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; _done = true; });
        _confettiCtrl.play();
      }
    } on VideoResolutionTooHighException catch (e) {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; _selectedImage = null; _imageBytes = null; _videoBytes = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error, duration: const Duration(seconds: 8)),
        );
      }
    } on VideoTooLongException catch (e) {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; _selectedImage = null; _imageBytes = null; _videoBytes = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error, duration: const Duration(seconds: 6)),
        );
      }
    } on VideoTooShortException catch (e) {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; _selectedImage = null; _imageBytes = null; _videoBytes = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error, duration: const Duration(seconds: 8)),
        );
      }
    } on VideoCompressionFailedException catch (e) {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error),
        );
      }
    } on AlreadySubmittedTodayException {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('You have already submitted this task today.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } on UnsupportedImageFormatException catch (e) {
      // HEIC / HEIF (image task) or unsupported video format — drop selection
      if (mounted) {
        setState(() {
          _submitting = false;
          _compressProgress = null; _uploadProgress = null;
          _selectedImage = null;
          _imageBytes = null;
          _videoBytes = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: AppColors.error,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    } on AuthException {
      // Session expired — sign out (fire & forget) and navigate to login
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; });
        Supabase.instance.client.auth.signOut();
        context.go('/login');
      }
    } on SubmissionQueuedException catch (e) {
      // Proof uploaded + saved on-device; it will auto-complete on next open.
      // Reassure (not an error) and return to Tasks — nothing is lost.
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: AppColors.secondary,
            duration: const Duration(seconds: 6),
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() { _submitting = false; _compressProgress = null; _uploadProgress = null; });
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
    final task   = _taskData;
    final title  = task['title']       as String? ?? 'Task';
    final desc   = task['description'] as String? ?? '';
    final icon   = task['icon']        as String? ?? '📋';
    final tiers  = _tiers;
    final hasTiers = _hasTiers;
    final basePoints = task['points'] as int? ?? 0;
    final displayPoints = hasTiers && _selectedTierIndex != null
        ? (tiers[_selectedTierIndex!]['points'] as int? ?? basePoints)
        : basePoints;
    final pointsLabel = hasTiers && _selectedTierIndex == null
        ? (tiers.isNotEmpty
            ? '${tiers.first['points']}–${tiers.last['points']}'
            : '$basePoints')
        : '$displayPoints';

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
                      _isVideoTask
                          ? 'We\'re checking your video now.\nThis usually takes under a minute.'
                          : 'We\'re checking your photo now.\nThis usually takes under a minute.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: context.textSecondary,
                          fontSize: 14,
                          height: 1.6),
                    ),
                    const SizedBox(height: 44),
                    GestureDetector(
                      onTap: () => context.pop(),
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
    // Block back nav + system pop while a submission is uploading — leaving
    // mid-upload aborts the video and wastes the user's time. iOS/Android/web
    // system back all funnel through this canPop guard.
    return PopScope(
      canPop: !_submitting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _submitting) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Upload in progress — please wait. Closing now would cancel your submission.'),
              backgroundColor: AppColors.error,
              duration: Duration(seconds: 3),
            ),
          );
        }
      },
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(_isResubmit ? 'Resubmit Proof' : 'Submit Proof'),
        elevation: 0,
        leading: BackButton(onPressed: () {
          if (_submitting) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Upload in progress — please wait. Do not close.'),
                backgroundColor: AppColors.error,
              ),
            );
            return;
          }
          context.pop();
        }),
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Icon + title + points row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Container(
                        width: 48, height: 48,
                        decoration: BoxDecoration(
                          color: context.primarySurface,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Center(child: Text(icon, style: const TextStyle(fontSize: 26))),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(title,
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: context.textPrimary)),
                      ),
                      const SizedBox(width: 8),
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
                            Text(pointsLabel,
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  // Description — each paragraph on its own line
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Divider(color: Theme.of(context).colorScheme.outline, height: 1),
                    const SizedBox(height: 12),
                    ...desc.split('\n').where((p) => p.trim().isNotEmpty).map((paragraph) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        paragraph.trim(),
                        style: TextStyle(fontSize: 13, color: context.textSecondary, height: 1.5),
                      ),
                    )),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 24),

            // ── Tier selector ──────────────────────────────────────────────
            if (hasTiers) ...[
              Text(
                'Select your achievement',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
              ),
              const SizedBox(height: 10),
              ...List.generate(tiers.length, (i) {
                final tier = tiers[i];
                final label = tier['label'] as String? ?? 'Tier ${i + 1}';
                final tierDesc = tier['description'] as String? ?? '';
                final tierPts = tier['points'] as int? ?? 0;
                final selected = _selectedTierIndex == i;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GestureDetector(
                    onTap: () => setState(() => _selectedTierIndex = i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: selected ? context.primarySurface : Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: selected ? AppColors.primary : Theme.of(context).colorScheme.outline,
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 22, height: 22,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: selected ? AppColors.primary : Colors.transparent,
                              border: Border.all(
                                color: selected ? AppColors.primary : Theme.of(context).colorScheme.outline,
                                width: 2,
                              ),
                            ),
                            child: selected
                                ? const Icon(Icons.check_rounded, color: Colors.white, size: 13)
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(label,
                                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: context.textPrimary)),
                                if (tierDesc.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(tierDesc, style: TextStyle(fontSize: 12, color: context.textSecondary)),
                                ],
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: selected ? AppColors.primary : context.primarySurface,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('🥦', style: TextStyle(fontSize: 12)),
                                const SizedBox(width: 4),
                                Text('$tierPts',
                                    style: TextStyle(
                                      fontSize: 12, fontWeight: FontWeight.w700,
                                      color: selected ? Colors.white : AppColors.primary,
                                    )),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 14),
            ],

            // ── Proof upload area — branches on task.proof_type ───────────
            Text(
              _isVideoTask ? 'Upload Your Proof Video' : 'Upload Your Proof Photo',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              _isVideoTask
                  ? 'Record or pick a video (max ${_maxVideoSeconds}s) as evidence.'
                  : 'Take a photo or pick from your gallery as evidence.',
              style: TextStyle(fontSize: 12, color: context.textSecondary),
            ),
            const SizedBox(height: 12),

            // Picker tile
            GestureDetector(
              onTap: () => _isVideoTask
                  ? _pickVideo(ImageSource.gallery)
                  : _pickImage(ImageSource.gallery),
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
                          if (_isVideoPicked)
                            // Video preview placeholder (avoid pulling video_player on every screen)
                            Container(
                              color: Colors.black,
                              alignment: Alignment.center,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.play_circle_outline, color: Colors.white, size: 56),
                                  const SizedBox(height: 8),
                                  Text(
                                    p.basename(_selectedImage!.name),
                                    style: const TextStyle(color: Colors.white, fontSize: 12),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            )
                          else
                            Image.memory(_imageBytes!, fit: BoxFit.cover),
                          Positioned(
                            top: 10, right: 10,
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _selectedImage = null;
                                _imageBytes = null;
                                _videoBytes = null;
                                _isVideoPicked = false;
                              }),
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
                            child: Icon(
                              _isVideoTask
                                  ? Icons.video_library_outlined
                                  : Icons.add_photo_alternate_outlined,
                              size: 30,
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _isVideoTask
                                ? 'Tap to pick a video from gallery'
                                : 'Tap to upload from gallery',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: context.textPrimary),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _isVideoTask
                                ? 'or record one with the button below'
                                : 'or use the camera button below',
                            style: TextStyle(fontSize: 12, color: context.textSecondary),
                          ),
                        ],
                      ),
              ),
            ),

            const SizedBox(height: 12),

            // Camera/record button alternative
            if (_selectedImage == null)
              GestureDetector(
                onTap: () => _isVideoTask
                    ? _pickVideo(ImageSource.camera)
                    : _pickImage(ImageSource.camera),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Theme.of(context).colorScheme.outline),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _isVideoTask ? Icons.videocam_outlined : Icons.camera_alt_outlined,
                        color: AppColors.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isVideoTask ? 'Record a Video' : 'Take a Photo',
                        style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),

            // Compression progress (video tasks only)
            if (_compressProgress != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: (_compressProgress! / 100).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor: Theme.of(context).colorScheme.outline.withValues(alpha: 0.3),
                        valueColor: const AlwaysStoppedAnimation(AppColors.primary),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Compressing ${_compressProgress!.toStringAsFixed(0)}%',
                    style: TextStyle(fontSize: 11, color: context.textSecondary),
                  ),
                ],
              ),
            ],

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

            // ── Lockout banner ─────────────────────────────────────────────
            if (_isLocked) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.secondary,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  children: [
                    Text('🕐', style: TextStyle(fontSize: 20)),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Submissions closed',
                            style: TextStyle(color: AppColors.surface, fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Task for next day opens at 4:00 AM.',
                            style: TextStyle(color: AppColors.surface, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Submit button
            GestureDetector(
              onTap: (_submitting || _isLocked) ? null : _submit,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  color: _submitting
                      ? AppColors.primary.withValues(alpha: 0.6)
                      : (_isLocked
                          ? Theme.of(context).colorScheme.outline
                          : (_canSubmit ? AppColors.primary : Theme.of(context).colorScheme.outline)),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Center(
                  child: _submitting
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              height: 20, width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _uploadProgress != null
                                  ? 'Uploading ${(_uploadProgress! * 100).clamp(0, 100).toStringAsFixed(0)}%…'
                                  : (_compressProgress != null
                                      ? 'Compressing ${_compressProgress!.clamp(0, 100).toStringAsFixed(0)}%…'
                                      : 'Uploading… please do not close'),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                            ),
                          ],
                        )
                      : Text(
                          _isLocked ? 'Opens at 4:00 AM 🕐' : 'Submit Proof',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                ),
              ),
            ),

            // Prominent "don't close" warning banner while uploading
            if (_submitting) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your video is uploading. Please keep this screen open — closing or navigating away will cancel the submission.',
                        style: TextStyle(fontSize: 12.5, color: AppColors.error, fontWeight: FontWeight.w600),
                      ),
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
