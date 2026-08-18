import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// The single source of truth for what a member is told about a submission.
///
/// Before this, status was a bare String compared against literals across seven
/// screens, which is how `ai_status = 'needs_review'` stayed invisible: the row
/// keeps `status = 'pending'`, so a submission a human still has to look at was
/// indistinguishable from one the AI was mid-way through. Members saw "Pending"
/// for hours and assumed the app was broken.
///
/// Deriving it in one place means new copy lands everywhere at once.
enum SubmissionState {
  /// No submission for this task today.
  notSubmitted,

  /// Uploaded, AI is looking at it. Resolves in well under a minute.
  checking,

  /// The AI could not decide on its own, so a person will. This is NOT an
  /// accusation — most cases are simply an unclear face or an odd camera angle.
  inReview,

  approved,
  rejected,

  /// A TEAM task a teammate has already submitted. One entry counts for the
  /// whole team, so this member has nothing to do -- and must not be allowed to
  /// waste an upload the database would reject anyway.
  doneByTeammate,
}

SubmissionState submissionStateFrom(String? status, String? aiStatus) {
  switch (status) {
    case 'approved':
      return SubmissionState.approved;
    case 'rejected':
      return SubmissionState.rejected;
    case 'pending':
      return aiStatus == 'needs_review'
          ? SubmissionState.inReview
          : SubmissionState.checking;
    default:
      return SubmissionState.notSubmitted;
  }
}

extension SubmissionStateDisplay on SubmissionState {
  /// Short label for a chip or row. Kept to one or two words so it fits the
  /// existing task-card layout without wrapping.
  String get label => switch (this) {
        SubmissionState.approved => 'Done',
        SubmissionState.checking => 'Checking',
        SubmissionState.inReview => 'In Review',
        SubmissionState.rejected => 'Resubmit',
        SubmissionState.doneByTeammate => 'Team done',
        SubmissionState.notSubmitted => 'Submit',
      };

  /// One sentence explaining what is happening and what (if anything) the
  /// member should do. "In Review" is the one that matters: it must reassure
  /// rather than alarm, because the member has usually done nothing wrong.
  String get detail => switch (this) {
        SubmissionState.approved => 'Approved',
        SubmissionState.checking =>
          'We\'re checking your submission — this usually takes under a minute.',
        SubmissionState.inReview =>
          'Our AI couldn\'t auto-approve this one, so a person is checking it. '
              'Nothing needed from you — your points land as soon as it\'s approved.',
        SubmissionState.rejected => 'Tap Resubmit to send a new proof.',
        SubmissionState.doneByTeammate =>
          'Your team has already submitted this one \u2014 it only needs one entry per team.',
        SubmissionState.notSubmitted => '',
      };

  IconData get icon => switch (this) {
        SubmissionState.approved => Icons.check_circle_outline_rounded,
        SubmissionState.checking => Icons.schedule_rounded,
        SubmissionState.inReview => Icons.visibility_outlined,
        SubmissionState.rejected => Icons.refresh_rounded,
        SubmissionState.doneByTeammate => Icons.groups_rounded,
        SubmissionState.notSubmitted => Icons.add_rounded,
      };

  Color get color => switch (this) {
        SubmissionState.approved => AppColors.success,
        SubmissionState.checking => AppColors.pending,
        SubmissionState.inReview => AppColors.pending,
        SubmissionState.rejected => AppColors.rejected,
        SubmissionState.doneByTeammate => AppColors.success,
        SubmissionState.notSubmitted => AppColors.primary,
      };

  /// Whether the member can submit (or resubmit) right now.
  bool get canSubmit =>
      this == SubmissionState.notSubmitted || this == SubmissionState.rejected;

  /// Whether this counts toward "tasks done" progress.
  bool get countsAsDone =>
      this == SubmissionState.approved || this == SubmissionState.doneByTeammate;

  /// Whether it is worth polling for a change.
  ///
  /// `checking` resolves in seconds, so polling is useful. `inReview` waits on a
  /// human and can sit for hours — re-arming a 30s timer for it across ~1,000
  /// members is pure battery and network waste for a state that will not move.
  bool get worthPolling => this == SubmissionState.checking;
}
