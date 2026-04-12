import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';

class TaskSubmissionScreen extends StatefulWidget {
  final Map<String, dynamic> task;

  const TaskSubmissionScreen({super.key, required this.task});

  @override
  State<TaskSubmissionScreen> createState() => _TaskSubmissionScreenState();
}

class _TaskSubmissionScreenState extends State<TaskSubmissionScreen> {
  final _textController = TextEditingController();
  bool _useImage = false;
  File? _selectedImage;
  bool _submitting = false;
  bool _done = false;

  Map<String, dynamic> get _taskData => widget.task['task'] as Map<String, dynamic>? ?? widget.task;
  String get _profileId => widget.task['profileId'] as String? ?? '';
  String get _orgId => widget.task['orgId'] as String? ?? '';

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked != null) {
      setState(() => _selectedImage = File(picked.path));
    }
  }

  Future<void> _submit() async {
    final taskId = _taskData['id'] as String? ?? '';
    final challengeId = _taskData['challenge_id'] as String? ?? '';

    if (_useImage && _selectedImage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an image.'), backgroundColor: AppColors.error),
      );
      return;
    }
    if (!_useImage && _textController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please describe your task completion.'), backgroundColor: AppColors.error),
      );
      return;
    }

    setState(() => _submitting = true);

    try {
      if (_useImage) {
        await TaskService.submitTaskImage(
          taskId: taskId,
          challengeId: challengeId,
          userId: _profileId,
          orgId: _orgId,
          imageFile: _selectedImage!,
        );
      } else {
        await TaskService.submitTaskText(
          taskId: taskId,
          challengeId: challengeId,
          userId: _profileId,
          orgId: _orgId,
          text: _textController.text.trim(),
        );
      }
      setState(() { _submitting = false; _done = true; });
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Submission failed: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final task = _taskData;
    final title = task['title'] as String? ?? 'Task';
    final desc = task['description'] as String? ?? '';
    final points = task['points'] as int? ?? 0;
    final icon = task['icon'] as String? ?? '📋';

    if (_done) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🎉', style: TextStyle(fontSize: 64)),
              const SizedBox(height: 20),
              const Text('Submitted!',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
              const SizedBox(height: 8),
              const Text('Waiting for admin approval.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 15)),
              const SizedBox(height: 36),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: ElevatedButton(
                  onPressed: () => context.go('/tasks'),
                  child: const Text('Back to Tasks'),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Submit Task'),
        backgroundColor: AppColors.surface,
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Task header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.primarySurface,
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
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.textPrimary)),
                        if (desc.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(desc, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                        ],
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.pointsBadge,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.pointsBadgeBorder),
                          ),
                          child: Text('🥦 $points pts',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.pointsText)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Proof type toggle
            const Text('Proof Type',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _useImage = false),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: !_useImage ? AppColors.primary : AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: !_useImage ? AppColors.primary : AppColors.border,
                        ),
                      ),
                      child: Center(
                        child: Text('📝 Text',
                            style: TextStyle(
                                color: !_useImage ? Colors.white : AppColors.textSecondary,
                                fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _useImage = true),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _useImage ? AppColors.primary : AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _useImage ? AppColors.primary : AppColors.border,
                        ),
                      ),
                      child: Center(
                        child: Text('📸 Photo',
                            style: TextStyle(
                                color: _useImage ? Colors.white : AppColors.textSecondary,
                                fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            if (_useImage) ...[
              GestureDetector(
                onTap: _pickImage,
                child: Container(
                  height: 200,
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: _selectedImage != null ? AppColors.primary : AppColors.border,
                      style: _selectedImage == null ? BorderStyle.solid : BorderStyle.solid,
                    ),
                  ),
                  child: _selectedImage != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.file(_selectedImage!, fit: BoxFit.cover, width: double.infinity),
                        )
                      : const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate_outlined, size: 40, color: AppColors.textHint),
                            SizedBox(height: 8),
                            Text('Tap to select a photo',
                                style: TextStyle(color: AppColors.textHint, fontSize: 14)),
                          ],
                        ),
                ),
              ),
            ] else ...[
              TextField(
                controller: _textController,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: 'Describe how you completed this task...',
                  alignLabelWithHint: true,
                ),
              ),
            ],

            const SizedBox(height: 32),

            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Submit Proof'),
            ),
          ],
        ),
      ),
    );
  }
}
