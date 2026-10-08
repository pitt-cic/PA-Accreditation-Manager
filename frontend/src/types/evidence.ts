/**
 * TypeScript types matching backend Pydantic models
 */

export type EvidenceStatus = 'found' | 'partial' | 'not_found' | 'on_site';
export type ProcessingStatus = 'unprocessed' | 'analyzing' | 'analysis_complete' | 'reevaluating' | 'error';
export type ReadinessLevel = 'ready' | 'mostly_ready' | 'needs_work' | 'not_ready' | 'no_guidance' | 'no_courses_found' | 'not_applicable';
export type HumanReviewStatus = 'needs_review' | 'review_in_progress' | 'human_verified' | 'needs_revision';

export interface EvidenceExcerpt {
  document_name: string;
  page_numbers: number[];
  excerpt: string;
  explanation: string;
  score?: number;
  is_manual: boolean;
}

export interface AttachedFile {
  name: string;
  size: string;
  added_by: string;
  added_at: string;
}

export interface Comment {
  comment_id: string;
  author: string;
  initials: string;
  time: string;
  text: string;
}

export interface OnSiteInfo {
  description: string;
  preparation_tips: string[];
}

export interface EssentialEvidenceItem {
  id: number;
  item_text: string;
  status: EvidenceStatus;
  evidence: EvidenceExcerpt[];
  gap_analysis?: string;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  resolved_note?: string;
  attached_files: AttachedFile[];
  comments: Comment[];
  suggestions: string[];
  on_site_info?: OnSiteInfo;
}

export interface FocusedQuestionItem {
  question: string;
  status: EvidenceStatus;
  answer_evidence: EvidenceExcerpt[];
  suggested_answer?: string;
  comments?: Comment[];
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  resolved_note?: string;
}

export interface RequirementEvidence {
  requirement_id: string;
  requirement_text: string;
  sub_requirement_text?: string;
  essential_evidence: EssentialEvidenceItem[];
  focused_questions: FocusedQuestionItem[];
  compliance_notes: string[];
  essential_evidence_found: number;
  essential_evidence_total: number;
  questions_answerable: number;
  questions_total: number;
  overall_readiness: ReadinessLevel;
  summary: string;
  is_resolved: boolean;
  human_review_status?: HumanReviewStatus;
  human_readiness_assessment?: ReadinessLevel;
  human_reviewed_by?: string;
  human_reviewed_at?: string;
  human_review_note?: string;
  comments?: Comment[];
}

export interface StandardItem {
  standard_id: string;
  section_id: string;
  requirement_text: string;
  sub_requirement_text?: string;
  status: ProcessingStatus;
  status_updated_at: string;
  error_message?: string;
  evidence_data?: RequirementEvidence;
  comments?: Comment[];
  last_processed_at?: string;
  compliance_guidance?: {
    essential_evidence?: string[];
    focused_questions?: string[];
    notes?: string[];
  };
  // Summary fields returned by list API (without full evidence_data)
  overall_readiness?: ReadinessLevel;
  human_review_status?: HumanReviewStatus;
  human_readiness_assessment?: ReadinessLevel;
  essential_evidence_found?: number;
  essential_evidence_total?: number;
  // WF5 linked mapping status flag (set when LinkedStandardsTable has a record)
  linked_mapping_status?: 'complete';
  // Cross-reference indexes populated by get_standards from LinkedStandard data
  comp_ids?: string[];
  course_codes?: string[];
  course_evidence_map?: CourseEvidenceEntry[];
  // WF5 full linked data (returned by detail endpoint only)
  linked_data?: LinkedStandard;
  // Audit year fields (frozen snapshots from Work Unit A)
  audit_year?: string;
  is_frozen?: boolean;
  // Reviewer file attachments (returned by detail endpoint only)
  attachments?: ReviewAttachment[];
}

// API Response types
export interface StandardsListResponse {
  standards: StandardItem[];
  status_summary: {
    queued: number;
    processing: number;
    processed: number;
    error: number;
    total: number;
  };
  readiness_summary: {
    ready: number;
    mostly_ready: number;
    needs_work: number;
    not_ready: number;
    no_guidance: number;
  };
}

export interface StandardDetailResponse extends StandardItem {}

export interface StatusResponse {
  standard_id: string;
  status: ProcessingStatus;
  status_updated_at: string;
  error_message?: string;
}

export interface RerunResponse {
  queued: number;
  standard_ids: string[];
}

export interface S3File {
  name: string;
  key: string;
  size: number;
  last_modified: string;
}

export interface S3FilesResponse {
  files: S3File[];
  bucket: string;
}

export type CommentTargetType = 'evidence' | 'question' | 'standard' | 'linked_ee' | 'linked_course' | 'linked_clo' | 'linked_ct';
export type ResolveTargetType = 'evidence' | 'question';

export interface AddCommentRequest {
  target_type: CommentTargetType;
  target_index: number | null;
  text: string;
}

export interface ResolveItemRequest {
  target_type: ResolveTargetType;
  target_index: number;
  resolved_note: string;
  unresolve?: boolean;
}

export interface AddCommentResponse {
  comment: Comment;
}

export interface DeleteCommentResponse {
  deleted: boolean;
  comment_id: string;
}

export interface UpdateHumanReviewRequest {
  human_review_status: HumanReviewStatus;
  human_readiness_assessment?: ReadinessLevel;
  human_review_note?: string;
}

export interface UpdateHumanReviewResponse extends StandardItem {}

export interface UpdateLinkedReviewRequest {
  human_review_status: HumanReviewStatus;
  human_readiness_status?: ReadinessLevel;
  human_review_note?: string;
}

export interface ReviewAttachment {
  attachment_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  s3_key: string;
  uploader: string;
  uploaded_at: string;
  note?: string;
  target_type: 'standard' | 'linked_ee';
  target_path?: string;
  is_linked: boolean;
}

export interface PostAttachmentRequest {
  file_name: string;
  file_size: number;
  content_type: string;
  target_type: 'standard' | 'linked_ee';
  target_path?: string;
  note?: string;
  existing_s3_key?: string;
}

export interface PostAttachmentResponse {
  attachment_id: string;
  upload_url: string;
  s3_key: string;
}

// Grouped standards for hierarchical display
export interface CourseEvidenceTopic {
  topic_id: string;
  topic_name: string;
}

export interface CourseEvidenceCLO {
  clo_id: string;
  clo_text: string;
  topics: CourseEvidenceTopic[];
}

export interface CourseEvidenceItem {
  ee_id: string;
  ee_text: string;
  map_reason: string;
  clos: CourseEvidenceCLO[];
}

export interface CourseEvidenceEntry {
  course_code: string;
  course_name: string;
  evidence_items: CourseEvidenceItem[];
}

export interface StandardGroup {
  section_id: string;
  section_title: string;
  standards: StandardItem[];
}

// =============================================================================
// Linked Standards (WF5 output from LinkedStandardsTable)
// =============================================================================

export interface LinkedCourseIO {
  id: string;
  text: string;
  relevance_reason: string;
  is_manual: boolean;
}

export interface LinkedCourseGoal {
  id: string;
  text: string;
  relevance_reason: string;
  is_manual: boolean;
}

export interface LinkedCourseCompetency {
  id: string;
  text: string;
  relevance_reason: string;
  is_manual: boolean;
}

export interface LinkedCourseAssessment {
  id: string;
  name: string;
  type: string;
  relevance_reason: string;
  is_manual: boolean;
}

export interface LinkedCourseTopicMetadata {
  id: string;
  name: string;
  relevance_summary: string;
  is_manual: boolean;
}

export interface LinkedCourseTopic {
  topic_metadata: LinkedCourseTopicMetadata;
  ios: LinkedCourseIO[];
  goals: LinkedCourseGoal[];
  comps: LinkedCourseCompetency[];
  assessments: LinkedCourseAssessment[];
  comments?: Comment[];
}

export interface LinkedCourseCLO {
  clo_id: string;
  clo_text: string;
  is_manual: boolean;
  topics: LinkedCourseTopic[];
  comments?: Comment[];
}

export interface LinkedCourse {
  course_id: string;
  course_name: string;
  course_code: string;
  is_manual: boolean;
  map_reason: string;
  clos: LinkedCourseCLO[];
  comments?: Comment[];
}

export interface LinkedArtifact {
  artifact_id: string;
  name: string;
  type: string;
  reason?: string;
}

export interface EvidenceItemMetadata {
  id: string;
  text: string;
  support_summary: string;
}

export interface EvidenceItemReviewData {
  review_status: string;
  reviewer?: string;
  review_date?: string;
  review_notes?: string;
}

export interface SlimLinkedCourse {
  course_id: string;
  course_code: string;
  course_name: string;
  map_reason: string;
  is_manual: boolean;
  comments?: Comment[];
}

export interface EssentialEvidenceLinked {
  evidence_metadata: EvidenceItemMetadata;
  evidence_review_data: EvidenceItemReviewData;
  /** Slim per-EE course refs. Full CLO/topic/IO data lives in LinkedStandard.course_details. */
  linked_courses: SlimLinkedCourse[];
  linked_artifacts: LinkedArtifact[];
  comments?: Comment[];
  attachments?: ReviewAttachment[];
}

export interface StandardMetadataLinked {
  id: string;
  section: string;
  standard_desc: string;
  arc_pa_version?: string;
  effective_date?: string;
  standard_evidence_summary?: string;
}

export interface StandardReviewData {
  machine_review_status: string;
  machine_readiness_status: string;
  human_review_status: string;
  human_readiness_status?: string;
  reviewer?: string;
  review_date?: string;
  review_notes?: string;
}

export interface LinkedStandard {
  standard_id: string;
  standard_metadata: StandardMetadataLinked;
  standard_review_data: StandardReviewData;
  essential_evidences: EssentialEvidenceLinked[];
  /** Deduplicated full CLO/topic/IO data keyed by course_id. Absent on legacy items. */
  course_details?: Record<string, LinkedCourse>;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Courses (from CoursesTable, WF2/3 output)
// =============================================================================

export interface CourseAssessmentAPI {
  id: string;
  name: string;
  info?: string;
}

export interface CourseTopicAPI {
  id: string;
  name: string;
  ios: string[];
  assessment_ids: string[];
}

export interface CourseLearningOutcomeAPI {
  id: string;
  name: string;
  topic_ids: string[];
  assessment_ids: string[];
}

export interface CourseGoalAPI {
  id: string;
  name: string;
  clo_ids: string[];
}

export interface CourseCompetencyAPI {
  id: string;
  name: string;
  clo_ids: string[];
  topic_ids: string[];
}

export interface CourseAPI {
  course_id: string;
  course_name: string;
  course_code: string;
  description?: string;
  clos: CourseLearningOutcomeAPI[];
  cts: CourseTopicAPI[];
  assessments: CourseAssessmentAPI[];
  goals: CourseGoalAPI[];
  competencies: CourseCompetencyAPI[];
}

export interface CoursesListResponse {
  courses: CourseAPI[];
}

// =============================================================================
// Goals (from GoalsTable)
// =============================================================================

export interface MappedTopicForGoal {
  id: string;
  name: string;
}

export interface MappedCloForGoal {
  id: string;
  name: string;
  topics: MappedTopicForGoal[];
}

export interface MappedCourseForGoal {
  course_id: string;
  course_code: string;
  clos: MappedCloForGoal[];
}

export interface ProgramGoalAPI {
  id: string;
  name: string;
  mapped_courses: MappedCourseForGoal[];
}

export interface GoalsListResponse {
  goals: ProgramGoalAPI[];
}

export interface MappedTopicForCompetency {
  id: string;
  name: string;
}

export interface MappedCloForCompetency {
  id: string;
  name: string;
  topics: MappedTopicForCompetency[];
}

export interface MappedCourseForCompetency {
  course_id: string;
  course_code: string;
  clos: MappedCloForCompetency[];
}

export interface ProgramCompetencyAPI {
  id: string;
  name: string;
  mapped_courses: MappedCourseForCompetency[];
}

export interface CompetenciesListResponse {
  competencies: ProgramCompetencyAPI[];
}