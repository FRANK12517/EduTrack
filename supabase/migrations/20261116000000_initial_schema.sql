-- Fresh EduTrack Supabase PostgreSQL baseline. Generated from current runtime DDL and db/schema.sql after union/reconciliation.
-- Fresh database only; no TiDB/MySQL data migration is performed.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS public.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, checksum char(64) NULL, applied_at timestamptz NOT NULL DEFAULT now(), execution_ms integer NOT NULL DEFAULT 0);

CREATE TABLE public.users (
  id VARCHAR(80) PRIMARY KEY,
  email VARCHAR(254) NULL UNIQUE,
  staff_id VARCHAR(120) NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  development_fixture BOOLEAN NOT NULL DEFAULT FALSE,
  hierarchy VARCHAR(80) NULL,
  scope_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  supabase_auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE TABLE public.credentials (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  access_code_hash TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.roles (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.permissions (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.role_permissions (
  role_id VARCHAR(80) NOT NULL,
  permission_id VARCHAR(100) NOT NULL
);

CREATE TABLE public.user_roles (
  user_id VARCHAR(80) NOT NULL,
  role_id VARCHAR(80) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.tenants (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  tenant_type VARCHAR(40) NOT NULL,
  parent_id VARCHAR(80) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.tenant_memberships (
  user_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  scope_json JSONB NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.regions (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  national_tenant_id VARCHAR(80) NOT NULL DEFAULT 'edutrack_national'
);

CREATE TABLE public.districts (
  id VARCHAR(80) PRIMARY KEY,
  region_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.schools (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NULL,
  district_id VARCHAR(80) NULL,
  name VARCHAR(255) NOT NULL,
  ownership_type VARCHAR(32) NOT NULL DEFAULT 'PRIVATE',
  first_term_free_used BOOLEAN NOT NULL DEFAULT FALSE,
  first_term_free_used_at TIMESTAMPTZ NULL,
  sms_credits_balance INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  district_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  district_sync_actor_id VARCHAR(80) NULL,
  district_sync_updated_at TIMESTAMPTZ NULL,
  school_code VARCHAR(120) NULL UNIQUE,
  address VARCHAR(255) NULL,
  contact_phone VARCHAR(80) NULL,
  contact_email VARCHAR(254) NULL,
  registration_metadata JSONB NULL
);

CREATE TABLE public.server_sessions (
  id VARCHAR(80) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  csrf_token_hash CHAR(64) NULL,
  login_scope_json JSONB NULL
);

CREATE TABLE public.audit_events (
  id VARCHAR(80) PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  actor_user_id VARCHAR(80) NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_id VARCHAR(160) NULL,
  ip VARCHAR(80) NULL,
  user_agent VARCHAR(300) NULL,
  metadata_json JSONB NULL
);

CREATE TABLE public.staff (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(80) NULL,
  staff_identifier VARCHAR(120) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(80) NULL,
  email VARCHAR(254) NULL,
  staff_type VARCHAR(80) NOT NULL DEFAULT 'STAFF',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  tenant_id VARCHAR(80) NOT NULL,
  region_id VARCHAR(80) NULL,
  district_id VARCHAR(80) NULL,
  school_id VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.students (
  id VARCHAR(80) PRIMARY KEY,
  admission_number VARCHAR(120) NOT NULL UNIQUE,
  student_identifier VARCHAR(120) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(40) NULL,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NULL,
  admission_date DATE NULL,
  special_needs TEXT NULL,
  emergency_contact VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- The production School cloud client reads and writes the legacy-shaped term
-- result payload through /api/students. Keep that live contract on PostgreSQL
-- while canonical result workflows are adopted by the client.
CREATE TABLE public.term_records (
  id VARCHAR(80) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id VARCHAR(80) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year VARCHAR(32) NOT NULL,
  term VARCHAR(80) NOT NULL,
  class_name VARCHAR(160) NOT NULL,
  form VARCHAR(80) NOT NULL,
  rank_in_class INT NULL,
  index_no VARCHAR(120) NULL,
  total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  subjects_sat INT NOT NULL DEFAULT 0,
  aggregate VARCHAR(40) NULL,
  class_position INT NULL,
  conduct TEXT NULL,
  interest TEXT NULL,
  attitude TEXT NULL,
  ct_remarks TEXT NULL,
  ht_remarks TEXT NULL,
  times_present INT NULL,
  times_absent INT NULL,
  total_school_days INT NULL,
  promotion_status VARCHAR(80) NULL,
  result_date DATE NULL,
  UNIQUE (student_id, academic_year, term)
);

CREATE TABLE public.subject_scores (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  term_record_id VARCHAR(80) NOT NULL REFERENCES public.term_records(id) ON DELETE CASCADE,
  subject VARCHAR(180) NOT NULL,
  class_score NUMERIC(10,2) NULL,
  exam_score NUMERIC(10,2) NULL,
  project NUMERIC(10,2) NULL,
  ce1 NUMERIC(10,2) NULL,
  ce2 NUMERIC(10,2) NULL,
  group_work NUMERIC(10,2) NULL,
  class_test NUMERIC(10,2) NULL,
  total_ca NUMERIC(10,2) NULL,
  ca_50 NUMERIC(10,2) NULL,
  exam_50 NUMERIC(10,2) NULL,
  total_score NUMERIC(10,2) NULL,
  grade VARCHAR(40) NULL,
  remark TEXT NULL,
  UNIQUE (term_record_id, subject)
);

CREATE INDEX term_records_school_scope_idx
  ON public.term_records (school_id, class_name, form, academic_year, term);

CREATE TABLE public.classes (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  academic_config_ref VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.parent_student_relationships (
  parent_user_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  relationship_type VARCHAR(80) NOT NULL DEFAULT 'PARENT',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.staff_school_assignments (
  staff_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.teacher_class_assignments (
  staff_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.signatures (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(80) NOT NULL,
  owner_type VARCHAR(24) NOT NULL,
  owner_id VARCHAR(80) NULL,
  staff_id VARCHAR(80) NULL,
  class_id VARCHAR(80) NULL,
  source VARCHAR(16) NOT NULL,
  processed_storage_ref TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  academic_year_id VARCHAR(80) NULL,
  term_id VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deactivated_at TIMESTAMPTZ NULL
);

CREATE TABLE public.quizzes (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  duration_seconds INT NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.quiz_questions (
  id VARCHAR(80) PRIMARY KEY,
  quiz_id VARCHAR(80) NOT NULL,
  position_no INT NOT NULL,
  prompt TEXT NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  options_json JSONB NULL,
  correct_answer VARCHAR(255) NULL,
  points DECIMAL(8,2) NOT NULL DEFAULT 1
);

CREATE TABLE public.quiz_attempts (
  id VARCHAR(80) PRIMARY KEY,
  quiz_id VARCHAR(80) NOT NULL,
  student_user_id VARCHAR(80) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NULL,
  score DECIMAL(8,2) NULL,
  points_possible DECIMAL(8,2) NULL,
  percentage DECIMAL(8,2) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS'
);

CREATE TABLE public.quiz_responses (
  id VARCHAR(80) PRIMARY KEY,
  attempt_id VARCHAR(80) NOT NULL,
  question_id VARCHAR(80) NOT NULL,
  answer_value VARCHAR(255) NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  points_awarded DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.pending_admission_applications (
  id VARCHAR(80) PRIMARY KEY,
  application_reference VARCHAR(40) NOT NULL UNIQUE,
  admission_type VARCHAR(20) NOT NULL,
  tenant_id VARCHAR(80) NULL,
  region_id VARCHAR(80) NOT NULL,
  district_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  level VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  applicant_json JSONB NOT NULL,
  guardian_json JSONB NOT NULL,
  documents_json JSONB NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  applicant_hash CHAR(64) NOT NULL
);

CREATE TABLE public.communication_campaigns (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NULL,
  scope_json JSONB NULL,
  name VARCHAR(180) NULL,
  channel VARCHAR(20) NOT NULL,
  subject VARCHAR(255) NULL,
  message TEXT NOT NULL,
  audience_json JSONB NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  schedule_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(80) NULL,
  idempotency_key VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.communication_campaign_recipients (
  id VARCHAR(80) PRIMARY KEY,
  campaign_id VARCHAR(80) NOT NULL,
  recipient_user_id VARCHAR(80) NULL,
  recipient_student_id VARCHAR(80) NULL,
  destination VARCHAR(254) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider_reference VARCHAR(160) NULL,
  failure_reason TEXT NULL,
  delivered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.chat_conversations (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NULL,
  participant_a VARCHAR(80) NOT NULL,
  participant_b VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL,
  last_message_at TIMESTAMPTZ NULL
);

CREATE TABLE public.chat_messages (
  id VARCHAR(80) PRIMARY KEY,
  conversation_id VARCHAR(80) NOT NULL,
  sender_id VARCHAR(80) NOT NULL,
  recipient_id VARCHAR(80) NOT NULL,
  body VARCHAR(4000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SENT',
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ NULL,
  read_at TIMESTAMPTZ NULL,
  client_nonce VARCHAR(120) NOT NULL
);

CREATE TABLE public.organization_branding (
  scope_type VARCHAR(30) NOT NULL,
  scope_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NULL,
  display_name VARCHAR(255) NULL,
  logo_url VARCHAR(1000) NULL,
  primary_color VARCHAR(20) NULL,
  accent_color VARCHAR(20) NULL,
  updated_by VARCHAR(80) NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.admission_review_history (
  id VARCHAR(80) PRIMARY KEY,
  application_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  actor_user_id VARCHAR(80) NULL,
  action VARCHAR(80) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_vehicles (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  registration_no VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  capacity INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_routes (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  route_type VARCHAR(30) NOT NULL DEFAULT 'BOTH',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_stops (
  id VARCHAR(80) PRIMARY KEY,
  route_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  stop_order INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.transport_staff_assignments (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  vehicle_id VARCHAR(80) NOT NULL,
  staff_id VARCHAR(80) NOT NULL,
  staff_role VARCHAR(40) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_student_assignments (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  route_id VARCHAR(80) NOT NULL,
  stop_id VARCHAR(80),
  vehicle_id VARCHAR(80),
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_events (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  route_id VARCHAR(80),
  vehicle_id VARCHAR(80),
  event_date DATE NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  event_status VARCHAR(40) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  recorded_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.transport_locations (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  vehicle_id VARCHAR(80) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'SIMULATION',
  recorded_by VARCHAR(80)
);

CREATE TABLE public.transport_audit_events (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(80),
  actor_id VARCHAR(80),
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.payment_intents (
  id VARCHAR(80) PRIMARY KEY,
  reference VARCHAR(120) NOT NULL UNIQUE,
  idempotency_key VARCHAR(120) NOT NULL,
  user_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NULL,
  plan_id VARCHAR(80) NOT NULL,
  school_type VARCHAR(32) NULL,
  term_id VARCHAR(160) NULL,
  academic_year VARCHAR(32) NULL,
  term_number SMALLINT NULL,
  term_start_date DATE NULL,
  term_end_date DATE NULL,
  government_term_reference VARCHAR(160) NULL,
  private_reopening_date DATE NULL,
  private_vacation_date DATE NULL,
  subscription_sequence INT NULL,
  duration_days INT NOT NULL DEFAULT 90,
  active_student_count INT NULL,
  price_per_student DECIMAL(12,2) NULL,
  subscription_amount DECIMAL(12,2) NULL,
  economic_value DECIMAL(12,2) NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(12) NOT NULL,
  payment_provider VARCHAR(40) NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.payment_transactions (
  id VARCHAR(80) PRIMARY KEY,
  reference VARCHAR(120) NOT NULL UNIQUE,
  intent_id VARCHAR(80) NULL,
  user_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NULL,
  plan_id VARCHAR(80) NOT NULL,
  school_type VARCHAR(32) NULL,
  term_id VARCHAR(160) NULL,
  academic_year VARCHAR(32) NULL,
  term_number SMALLINT NULL,
  term_start_date DATE NULL,
  term_end_date DATE NULL,
  government_term_reference VARCHAR(160) NULL,
  private_reopening_date DATE NULL,
  private_vacation_date DATE NULL,
  subscription_sequence INT NULL,
  active_student_count INT NULL,
  price_per_student DECIMAL(12,2) NULL,
  subscription_amount DECIMAL(12,2) NULL,
  economic_value DECIMAL(12,2) NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(12) NOT NULL,
  payment_provider VARCHAR(40) NULL,
  status VARCHAR(32) NOT NULL,
  provider_event_id VARCHAR(160) NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.subscriptions (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NULL,
  plan_id VARCHAR(80) NOT NULL,
  school_type VARCHAR(32) NULL,
  term_id VARCHAR(160) NULL,
  academic_year VARCHAR(32) NULL,
  term_number SMALLINT NULL,
  government_term_reference VARCHAR(160) NULL,
  private_reopening_date DATE NULL,
  private_vacation_date DATE NULL,
  subscription_sequence INT NULL,
  status VARCHAR(32) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  subscription_start_date DATE NULL,
  subscription_end_date DATE NULL,
  active_student_count_at_subscription INT NULL,
  price_per_student DECIMAL(12,2) NULL,
  subscription_amount DECIMAL(12,2) NULL,
  economic_value DECIMAL(12,2) NULL,
  currency VARCHAR(12) NULL,
  payment_status VARCHAR(32) NULL,
  payment_reference VARCHAR(120) NULL,
  payment_provider VARCHAR(40) NULL,
  last_transaction_id VARCHAR(80) NULL,
  renewal_state VARCHAR(32) NOT NULL DEFAULT 'INITIAL',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.payment_events (
  id VARCHAR(80) PRIMARY KEY,
  event_id VARCHAR(160) NOT NULL UNIQUE,
  reference VARCHAR(120) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSONB NULL,
  received_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.password_reset_records (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL
);

CREATE TABLE public.file_records (
  id VARCHAR(80) PRIMARY KEY,
  owner_user_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NULL,
  storage_name VARCHAR(255) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  category VARCHAR(80) NOT NULL,
  associated_entity VARCHAR(160) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.student_status_history (
  id VARCHAR(80) PRIMARY KEY,
  student_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  changed_by VARCHAR(80) NULL,
  reason VARCHAR(160) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.student_population_reconciliations (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(80) NOT NULL,
  academic_year VARCHAR(32) NOT NULL,
  term_number SMALLINT NOT NULL,
  subscription_id VARCHAR(80) NOT NULL,
  subscription_timestamp TIMESTAMPTZ NOT NULL,
  subscription_population INT NOT NULL,
  current_active_population INT NOT NULL,
  newly_admitted_population INT NOT NULL DEFAULT 0,
  withdrawn_population INT NOT NULL DEFAULT 0,
  transferred_population INT NOT NULL DEFAULT 0,
  stopped_population INT NOT NULL DEFAULT 0,
  inactive_population INT NOT NULL DEFAULT 0,
  net_active_difference INT NOT NULL,
  reconciliation_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.subscription_population_checkpoints (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NULL,
  subscription_id VARCHAR(80) NOT NULL,
  academic_year VARCHAR(32) NOT NULL,
  term_number SMALLINT NOT NULL,
  checkpoint_type VARCHAR(24) NOT NULL,
  examination_id VARCHAR(80) NULL,
  report_type VARCHAR(80) NULL,
  checkpoint_timestamp TIMESTAMPTZ NOT NULL,
  subscription_population INT NOT NULL,
  current_active_population INT NOT NULL,
  newly_admitted_population INT NOT NULL DEFAULT 0,
  withdrawn_population INT NOT NULL DEFAULT 0,
  transferred_population INT NOT NULL DEFAULT 0,
  stopped_population INT NOT NULL DEFAULT 0,
  inactive_population INT NOT NULL DEFAULT 0,
  examination_population INT NOT NULL DEFAULT 0,
  report_card_population INT NOT NULL DEFAULT 0,
  net_additional_students INT NOT NULL DEFAULT 0,
  carry_forward_students INT NOT NULL DEFAULT 0,
  active_without_report_cards INT NOT NULL DEFAULT 0,
  report_cards_for_inactive_students INT NOT NULL DEFAULT 0,
  report_cards_outside_school_tenant INT NOT NULL DEFAULT 0,
  population_discrepancy BOOLEAN NOT NULL DEFAULT FALSE,
  class_rows_json JSONB NOT NULL,
  flags_json JSONB NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.subscription_carry_forward_records (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NULL,
  previous_subscription_id VARCHAR(80) NOT NULL,
  previous_baseline_population INT NOT NULL,
  previous_end_population INT NOT NULL,
  verified_carry_forward INT NOT NULL,
  next_subscription_id VARCHAR(80) NULL,
  next_subscription_population INT NULL,
  carry_forward_status VARCHAR(32) NOT NULL DEFAULT 'CALCULATED',
  calculation_timestamp TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.government_academic_calendars (
  id VARCHAR(80) PRIMARY KEY,
  academic_year VARCHAR(32) NOT NULL,
  term_number SMALLINT NOT NULL,
  school_type VARCHAR(32) NOT NULL DEFAULT 'government',
  reopening_date DATE NOT NULL,
  vacation_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  effective_date DATE NOT NULL,
  created_by VARCHAR(80) NULL,
  updated_by VARCHAR(80) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.private_subscription_year_controls (
  school_id VARCHAR(80) NOT NULL,
  academic_year VARCHAR(32) NOT NULL,
  private_subscription_count_for_academic_year SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.academic_configurations (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  academic_year VARCHAR(32) NOT NULL,
  term VARCHAR(64) NOT NULL,
  week INT NULL,
  opening_date DATE NOT NULL,
  closing_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  metadata_json JSONB NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.subjects (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  metadata_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.school_subjects (
  school_id VARCHAR(80) NOT NULL,
  subject_id VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.teacher_subject_assignments (
  staff_id VARCHAR(80) NOT NULL,
  subject_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.attendance_registers (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NULL,
  attendance_date DATE NOT NULL,
  register_type VARCHAR(32) NOT NULL DEFAULT 'STUDENT',
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.student_attendance_records (
  id VARCHAR(80) PRIMARY KEY,
  register_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  status VARCHAR(24) NOT NULL,
  note VARCHAR(255) NULL,
  recorded_by VARCHAR(80) NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.qr_attendance_identities (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  entity_type VARCHAR(16) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_suffix CHAR(8) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_by VARCHAR(80) NULL
);

CREATE TABLE public.qr_attendance_events (
  id VARCHAR(80) PRIMARY KEY,
  identity_id VARCHAR(80) NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  entity_type VARCHAR(16) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  attendance_date DATE NOT NULL,
  scan_timestamp TIMESTAMPTZ NOT NULL,
  attendance_method VARCHAR(16) NOT NULL DEFAULT 'QR',
  sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCHRONIZED',
  scan_result VARCHAR(24) NOT NULL,
  scanned_by VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  metadata_json JSONB NULL
);

CREATE TABLE public.teacher_attendance_records (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  staff_id VARCHAR(80) NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL,
  sign_in TIME NULL,
  sign_out TIME NULL,
  note VARCHAR(255) NULL,
  recorded_by VARCHAR(80) NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.examination_types (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE public.examinations (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NOT NULL,
  examination_type_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  publication_status VARCHAR(32) NOT NULL DEFAULT 'UNPUBLISHED',
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.examination_components (
  id VARCHAR(80) PRIMARY KEY,
  examination_id VARCHAR(80) NOT NULL,
  subject_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  maximum_score DECIMAL(8,2) NOT NULL,
  position_no INT NOT NULL DEFAULT 1
);

CREATE TABLE public.scores (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  subject_id VARCHAR(80) NOT NULL,
  examination_id VARCHAR(80) NOT NULL,
  component_id VARCHAR(80) NOT NULL,
  raw_score DECIMAL(8,2) NOT NULL,
  maximum_score DECIMAL(8,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  entered_by VARCHAR(80) NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.published_results (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NOT NULL,
  examination_id VARCHAR(80) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  result_json JSONB NOT NULL,
  publication_status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  published_by VARCHAR(80) NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.result_slips (
  id VARCHAR(80) PRIMARY KEY,
  published_result_id VARCHAR(80) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NULL
);

CREATE TABLE public.broadsheets (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NOT NULL,
  examination_id VARCHAR(80) NOT NULL,
  format_code VARCHAR(8) NOT NULL DEFAULT 'A',
  snapshot_json JSONB NOT NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.school_fees (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NULL,
  school_id VARCHAR(80) NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NULL,
  term VARCHAR(40) NULL,
  academic_year VARCHAR(20) NULL,
  scope VARCHAR(30) NOT NULL DEFAULT 'school',
  scope_class VARCHAR(120) NULL,
  scope_student VARCHAR(120) NULL,
  publication_status VARCHAR(20) NOT NULL DEFAULT 'UNPUBLISHED',
  published_by VARCHAR(80) NULL,
  published_at TIMESTAMPTZ NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.school_fee_payments (
  id VARCHAR(80) PRIMARY KEY,
  fee_id VARCHAR(80) NULL,
  tenant_id VARCHAR(80) NULL,
  school_id VARCHAR(80) NULL,
  student_id VARCHAR(80) NOT NULL,
  receipt_no VARCHAR(120) NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
  paid_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(80) NULL
);

CREATE TABLE public.promotion_records (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  source_class_id VARCHAR(80) NOT NULL,
  destination_class_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NOT NULL,
  decision VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  decided_by VARCHAR(80) NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.mock_examinations (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  class_id VARCHAR(80) NOT NULL,
  academic_config_id VARCHAR(80) NOT NULL,
  label VARCHAR(64) NOT NULL,
  format_code VARCHAR(8) NOT NULL DEFAULT 'B',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  publication_status VARCHAR(32) NOT NULL DEFAULT 'UNPUBLISHED',
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.mock_components (
  id VARCHAR(80) PRIMARY KEY,
  mock_examination_id VARCHAR(80) NOT NULL,
  subject_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  maximum_score DECIMAL(8,2) NOT NULL
);

CREATE TABLE public.mock_scores (
  id VARCHAR(80) PRIMARY KEY,
  mock_examination_id VARCHAR(80) NOT NULL,
  component_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  raw_score DECIMAL(8,2) NOT NULL,
  maximum_score DECIMAL(8,2) NOT NULL,
  entered_by VARCHAR(80) NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.academic_report_snapshots (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NULL,
  class_id VARCHAR(80) NULL,
  report_type VARCHAR(80) NOT NULL,
  filter_json JSONB NULL,
  snapshot_json JSONB NOT NULL,
  created_by VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.district_sports_records (
  id VARCHAR(80) PRIMARY KEY,
  district_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  record_type VARCHAR(32) NOT NULL,
  payload_json JSONB NOT NULL,
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.hostels (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.hostel_blocks (
  id VARCHAR(80) PRIMARY KEY,
  hostel_id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  floors INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.hostel_rooms (
  id VARCHAR(80) PRIMARY KEY,
  block_id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  capacity INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.hostel_beds (
  id VARCHAR(80) PRIMARY KEY,
  room_id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.hostel_assignments (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  hostel_id VARCHAR(80) NOT NULL,
  block_id VARCHAR(80),
  room_id VARCHAR(80),
  bed_id VARCHAR(80),
  assigned_at TIMESTAMPTZ NOT NULL,
  vacated_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  assigned_by VARCHAR(80),
  reason VARCHAR(255)
);

CREATE TABLE public.hostel_roll_calls (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  student_id VARCHAR(80) NOT NULL,
  session_name VARCHAR(80) NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  recorded_by VARCHAR(80),
  recorded_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'ONLINE'
);

CREATE TABLE public.hostel_audit_events (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  school_id VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(80),
  actor_id VARCHAR(80),
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.credentials ADD CONSTRAINT credentials_credentials_user_unique UNIQUE (user_id);
ALTER TABLE public.credentials ADD CONSTRAINT credentials_credentials_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_permissions_role_fk FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_permissions_permission_fk FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_roles_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_roles_role_fk FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_tenants_parent_fk FOREIGN KEY (parent_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (user_id, tenant_id);
ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_memberships_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_memberships_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.regions ADD CONSTRAINT regions_regions_national_fk FOREIGN KEY (national_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.districts ADD CONSTRAINT districts_district_region_name UNIQUE (region_id, name);
ALTER TABLE public.districts ADD CONSTRAINT districts_districts_region_fk FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT;
ALTER TABLE public.schools ADD CONSTRAINT schools_schools_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE public.schools ADD CONSTRAINT schools_schools_district_fk FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE public.schools ADD CONSTRAINT schools_schools_sync_actor_fk FOREIGN KEY (district_sync_actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.server_sessions ADD CONSTRAINT server_sessions_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_audit_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_user_unique UNIQUE (user_id);
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_region_fk FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_district_fk FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD CONSTRAINT staff_staff_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD CONSTRAINT students_students_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.students ADD CONSTRAINT students_students_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.classes ADD CONSTRAINT classes_class_school_name UNIQUE (school_id,name);
ALTER TABLE public.classes ADD CONSTRAINT classes_classes_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.classes ADD CONSTRAINT classes_classes_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.parent_student_relationships ADD CONSTRAINT parent_student_relationships_pkey PRIMARY KEY (parent_user_id,student_id);
ALTER TABLE public.parent_student_relationships ADD CONSTRAINT parent_student_relationships_ps_parent_fk FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.parent_student_relationships ADD CONSTRAINT parent_student_relationships_ps_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE public.staff_school_assignments ADD CONSTRAINT staff_school_assignments_pkey PRIMARY KEY (staff_id,school_id);
ALTER TABLE public.staff_school_assignments ADD CONSTRAINT staff_school_assignments_ssa_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE public.staff_school_assignments ADD CONSTRAINT staff_school_assignments_ssa_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_class_assignments ADD CONSTRAINT teacher_class_assignments_pkey PRIMARY KEY (staff_id,class_id);
ALTER TABLE public.teacher_class_assignments ADD CONSTRAINT teacher_class_assignments_tca_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_class_assignments ADD CONSTRAINT teacher_class_assignments_tca_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public.signatures ADD CONSTRAINT signatures_signature_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.signatures ADD CONSTRAINT signatures_signature_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;
ALTER TABLE public.signatures ADD CONSTRAINT signatures_signature_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS signatures_signature_active_scope ON public.signatures (school_id,owner_type,owner_id,class_id,active);
CREATE INDEX IF NOT EXISTS quizzes_quiz_scope ON public.quizzes (tenant_id,school_id,status);
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_qq_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE;
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_qq_position UNIQUE (quiz_id,position_no);
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_quiz_attempt_once UNIQUE (quiz_id,student_user_id);
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_qa_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE;
ALTER TABLE public.quiz_responses ADD CONSTRAINT quiz_responses_qr_once UNIQUE (attempt_id,question_id);
ALTER TABLE public.quiz_responses ADD CONSTRAINT quiz_responses_qr_attempt_fk FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE;
ALTER TABLE public.quiz_responses ADD CONSTRAINT quiz_responses_qr_question_fk FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE;
ALTER TABLE public.pending_admission_applications ADD CONSTRAINT pending_admission_applications_pending_duplicate UNIQUE (school_id,admission_type,applicant_hash,status);
CREATE INDEX IF NOT EXISTS pending_admission_applications_pending_school_status ON public.pending_admission_applications (school_id,status);
ALTER TABLE public.communication_campaigns ADD CONSTRAINT communication_campaigns_communication_idempotency UNIQUE (created_by,idempotency_key);
CREATE INDEX IF NOT EXISTS communication_campaigns_communication_scope_status ON public.communication_campaigns (tenant_id,status);
ALTER TABLE public.communication_campaign_recipients ADD CONSTRAINT communication_campaign_recipients_communication_r_9427145f UNIQUE (campaign_id,destination);
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_chat_pair UNIQUE (school_id,participant_a,participant_b);
CREATE INDEX IF NOT EXISTS chat_conversations_chat_participant_a ON public.chat_conversations (participant_a,last_message_at);
CREATE INDEX IF NOT EXISTS chat_conversations_chat_participant_b ON public.chat_conversations (participant_b,last_message_at);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_chat_message_dedupe UNIQUE (conversation_id,sender_id,client_nonce);
CREATE INDEX IF NOT EXISTS chat_messages_chat_messages_page ON public.chat_messages (conversation_id,sent_at);
ALTER TABLE public.organization_branding ADD CONSTRAINT organization_branding_pkey PRIMARY KEY(scope_type,scope_id);
CREATE INDEX IF NOT EXISTS admission_review_history_arh_application ON public.admission_review_history (application_id,created_at);
ALTER TABLE public.transport_vehicles ADD CONSTRAINT transport_vehicles_transport_vehicle_reg UNIQUE (school_id,registration_no);
ALTER TABLE public.transport_routes ADD CONSTRAINT transport_routes_transport_route_name UNIQUE (school_id,name);
ALTER TABLE public.transport_stops ADD CONSTRAINT transport_stops_transport_stop_order UNIQUE (route_id,stop_order);
CREATE INDEX IF NOT EXISTS transport_staff_assignments_transport_staff_active ON public.transport_staff_assignments (vehicle_id,status);
ALTER TABLE public.transport_student_assignments ADD CONSTRAINT transport_student_assignments_transport_student_one_active UNIQUE (student_id,status);
CREATE INDEX IF NOT EXISTS transport_student_assignments_transport_student_active ON public.transport_student_assignments (student_id,status);
ALTER TABLE public.transport_events ADD CONSTRAINT transport_events_transport_event_unique UNIQUE (student_id,event_date,event_status);
CREATE INDEX IF NOT EXISTS transport_locations_transport_location_latest ON public.transport_locations (vehicle_id,recorded_at);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_payment_intent_user_key UNIQUE (user_id,idempotency_key);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_payment_intent_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_payment_intent_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_intents_payment_intent_school ON public.payment_intents (school_id);
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_payment_tx_event UNIQUE (provider_event_id);
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_payment_tx_intent_fk FOREIGN KEY (intent_id) REFERENCES payment_intents(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_payment_tx_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_payment_tx_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_transactions_payment_tx_user ON public.payment_transactions (user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_payment_tx_school_status ON public.payment_transactions (school_id,status);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_subscription_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_subscription_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_subscription_tx_fk FOREIGN KEY (last_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS subscriptions_subscription_user_status ON public.subscriptions (user_id,status);
CREATE INDEX IF NOT EXISTS subscriptions_subscription_school_status ON public.subscriptions (school_id,status);
CREATE INDEX IF NOT EXISTS subscriptions_subscription_expiry ON public.subscriptions (expires_at);
ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_payment_event_tx_fk FOREIGN KEY (reference) REFERENCES payment_transactions(reference) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS payment_events_payment_event_reference ON public.payment_events (reference);
ALTER TABLE public.password_reset_records ADD CONSTRAINT password_reset_records_reset_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS password_reset_records_reset_user_expiry ON public.password_reset_records (user_id,expires_at);
ALTER TABLE public.file_records ADD CONSTRAINT file_records_file_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public.file_records ADD CONSTRAINT file_records_file_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS file_records_file_owner ON public.file_records (owner_user_id);
CREATE INDEX IF NOT EXISTS file_records_file_school ON public.file_records (school_id);
ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_student_status_history_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_student_status_history_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_student_status_history_actor_fk FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS student_status_history_student_status_history_student ON public.student_status_history (student_id,changed_at);
CREATE INDEX IF NOT EXISTS student_status_history_student_status_history_school ON public.student_status_history (school_id,changed_at);
ALTER TABLE public.student_population_reconciliations ADD CONSTRAINT student_population_reconciliations_reconciliation_65db62d3 FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_population_reconciliations ADD CONSTRAINT student_population_reconciliations_reconciliation_fad8b09b FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS student_population_reconciliations_reconciliation_a64bb4ef ON public.student_population_reconciliations (subscription_id,reconciliation_timestamp);
CREATE INDEX IF NOT EXISTS student_population_reconciliations_reconciliation_6978e815 ON public.student_population_reconciliations (school_id,academic_year,term_number);
ALTER TABLE public.subscription_population_checkpoints ADD CONSTRAINT subscription_population_checkpoints_subscription__7d06e767 UNIQUE (subscription_id,checkpoint_type,checkpoint_timestamp);
ALTER TABLE public.subscription_population_checkpoints ADD CONSTRAINT subscription_population_checkpoints_checkpoint_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_population_checkpoints ADD CONSTRAINT subscription_population_checkpoints_checkpoint_su_09ec6f61 FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_population_checkpoints ADD CONSTRAINT subscription_population_checkpoints_checkpoint_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS subscription_population_checkpoints_checkpoint_school_term ON public.subscription_population_checkpoints (school_id,academic_year,term_number,checkpoint_type);
ALTER TABLE public.subscription_carry_forward_records ADD CONSTRAINT subscription_carry_forward_records_carry_forward__b651efac UNIQUE (previous_subscription_id);
ALTER TABLE public.subscription_carry_forward_records ADD CONSTRAINT subscription_carry_forward_records_carry_forward_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_carry_forward_records ADD CONSTRAINT subscription_carry_forward_records_carry_forward__f6c651b8 FOREIGN KEY (previous_subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_carry_forward_records ADD CONSTRAINT subscription_carry_forward_records_carry_forward_next_fk FOREIGN KEY (next_subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.subscription_carry_forward_records ADD CONSTRAINT subscription_carry_forward_records_carry_forward__a8addb20 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS subscription_carry_forward_records_carry_forward_school ON public.subscription_carry_forward_records (school_id,calculation_timestamp);
ALTER TABLE public.government_academic_calendars ADD CONSTRAINT government_academic_calendars_government_calendar_ed01aa7f UNIQUE (academic_year,term_number,version);
ALTER TABLE public.government_academic_calendars ADD CONSTRAINT government_academic_calendars_government_calendar_7900c044 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.government_academic_calendars ADD CONSTRAINT government_academic_calendars_government_calendar_c47541ff FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.government_academic_calendars ADD CONSTRAINT government_academic_calendars_check CHECK (school_type='government');
ALTER TABLE public.government_academic_calendars ADD CONSTRAINT government_academic_calendars_valid_dates_check CHECK (vacation_date>reopening_date);
CREATE INDEX IF NOT EXISTS government_academic_calendars_government_calendar_active ON public.government_academic_calendars (academic_year,term_number,status,effective_date);
ALTER TABLE public.private_subscription_year_controls ADD CONSTRAINT private_subscription_year_controls_pkey PRIMARY KEY (school_id,academic_year);
ALTER TABLE public.private_subscription_year_controls ADD CONSTRAINT private_subscription_year_controls_private_year_c_7a6edea6 FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.private_subscription_year_controls ADD CONSTRAINT private_subscription_year_controls_check CHECK (private_subscription_count_for_academic_year BETWEEN 0 AND 3);
ALTER TABLE public.academic_configurations ADD CONSTRAINT academic_configurations_academic_config_unique UNIQUE (school_id,academic_year,term);
ALTER TABLE public.academic_configurations ADD CONSTRAINT academic_configurations_acad_cfg_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.academic_configurations ADD CONSTRAINT academic_configurations_acad_cfg_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.academic_configurations ADD CONSTRAINT academic_configurations_acad_cfg_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.academic_configurations ADD CONSTRAINT academic_configurations_check CHECK (closing_date >= opening_date);
ALTER TABLE public.subjects ADD CONSTRAINT subjects_subject_school_code UNIQUE (school_id,code);
ALTER TABLE public.subjects ADD CONSTRAINT subjects_subjects_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_subjects_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.school_subjects ADD CONSTRAINT school_subjects_pkey PRIMARY KEY (school_id,subject_id);
ALTER TABLE public.school_subjects ADD CONSTRAINT school_subjects_school_subject_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.school_subjects ADD CONSTRAINT school_subjects_school_subject_subject_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_subject_assignments ADD CONSTRAINT teacher_subject_assignments_pkey PRIMARY KEY (staff_id,subject_id,class_id);
ALTER TABLE public.teacher_subject_assignments ADD CONSTRAINT teacher_subject_assignments_tsa_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_subject_assignments ADD CONSTRAINT teacher_subject_assignments_tsa_subject_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_subject_assignments ADD CONSTRAINT teacher_subject_assignments_tsa_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_attendance_register_unique UNIQUE (class_id,attendance_date,register_type);
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_ar_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_ar_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_ar_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_ar_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_registers ADD CONSTRAINT attendance_registers_ar_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_attendance_records ADD CONSTRAINT student_attendance_records_student_attendance_unique UNIQUE (register_id,student_id);
ALTER TABLE public.student_attendance_records ADD CONSTRAINT student_attendance_records_sar_register_fk FOREIGN KEY (register_id) REFERENCES attendance_registers(id) ON DELETE CASCADE;
ALTER TABLE public.student_attendance_records ADD CONSTRAINT student_attendance_records_sar_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.student_attendance_records ADD CONSTRAINT student_attendance_records_sar_recorder_fk FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.qr_attendance_identities ADD CONSTRAINT qr_attendance_identities_qai_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.qr_attendance_identities ADD CONSTRAINT qr_attendance_identities_qai_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.qr_attendance_identities ADD CONSTRAINT qr_attendance_identities_qai_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS qr_attendance_identities_qr_entity_active ON public.qr_attendance_identities (entity_type,entity_id,active);
CREATE INDEX IF NOT EXISTS qr_attendance_identities_qr_school_active ON public.qr_attendance_identities (school_id,active);
ALTER TABLE public.qr_attendance_events ADD CONSTRAINT qr_attendance_events_qr_event_unique UNIQUE (entity_type,entity_id,attendance_date);
ALTER TABLE public.qr_attendance_events ADD CONSTRAINT qr_attendance_events_qae_identity_fk FOREIGN KEY (identity_id) REFERENCES qr_attendance_identities(id) ON DELETE RESTRICT;
ALTER TABLE public.qr_attendance_events ADD CONSTRAINT qr_attendance_events_qae_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.qr_attendance_events ADD CONSTRAINT qr_attendance_events_qae_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.qr_attendance_events ADD CONSTRAINT qr_attendance_events_qae_scanner_fk FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.teacher_attendance_records ADD CONSTRAINT teacher_attendance_records_teacher_attendance_unique UNIQUE (staff_id,attendance_date);
ALTER TABLE public.teacher_attendance_records ADD CONSTRAINT teacher_attendance_records_tar_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_attendance_records ADD CONSTRAINT teacher_attendance_records_tar_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_attendance_records ADD CONSTRAINT teacher_attendance_records_tar_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_attendance_records ADD CONSTRAINT teacher_attendance_records_tar_recorder_fk FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.examination_types ADD CONSTRAINT examination_types_examination_type_school_name UNIQUE (school_id,name);
ALTER TABLE public.examination_types ADD CONSTRAINT examination_types_et_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.examination_types ADD CONSTRAINT examination_types_et_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_examination_school_name UNIQUE (school_id,class_id,academic_config_id,name);
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_type_fk FOREIGN KEY (examination_type_id) REFERENCES examination_types(id) ON DELETE RESTRICT;
ALTER TABLE public.examinations ADD CONSTRAINT examinations_exam_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.examination_components ADD CONSTRAINT examination_components_exam_component_unique UNIQUE (examination_id,subject_id,name);
ALTER TABLE public.examination_components ADD CONSTRAINT examination_components_ec_exam_fk FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE;
ALTER TABLE public.examination_components ADD CONSTRAINT examination_components_ec_subject_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
ALTER TABLE public.examination_components ADD CONSTRAINT examination_components_check CHECK (maximum_score > 0);
ALTER TABLE public.scores ADD CONSTRAINT scores_score_unique UNIQUE (student_id,component_id);
ALTER TABLE public.scores ADD CONSTRAINT scores_score_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_subject_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_exam_fk FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_component_fk FOREIGN KEY (component_id) REFERENCES examination_components(id) ON DELETE RESTRICT;
ALTER TABLE public.scores ADD CONSTRAINT scores_score_enterer_fk FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.scores ADD CONSTRAINT scores_check CHECK (raw_score >= 0 AND raw_score <= maximum_score);
ALTER TABLE public.published_results ADD CONSTRAINT published_results_published_result_unique UNIQUE (student_id,examination_id,version_no);
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_exam_fk FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE RESTRICT;
ALTER TABLE public.published_results ADD CONSTRAINT published_results_pr_publisher_fk FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.result_slips ADD CONSTRAINT result_slips_rs_result_fk FOREIGN KEY (published_result_id) REFERENCES published_results(id) ON DELETE CASCADE;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_broadsheet_unique UNIQUE (class_id,examination_id,format_code);
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE RESTRICT;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_exam_fk FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE RESTRICT;
ALTER TABLE public.broadsheets ADD CONSTRAINT broadsheets_bs_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.school_fees ADD CONSTRAINT school_fees_fee_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS school_fees_fee_school_publication ON public.school_fees (school_id,publication_status);
ALTER TABLE public.school_fee_payments ADD CONSTRAINT school_fee_payments_fee_payment_fee_fk FOREIGN KEY (fee_id) REFERENCES school_fees(id) ON DELETE SET NULL;
ALTER TABLE public.school_fee_payments ADD CONSTRAINT school_fee_payments_fee_payment_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS school_fee_payments_fee_payment_student ON public.school_fee_payments (student_id);
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promotion_unique UNIQUE (student_id,academic_config_id);
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_source_fk FOREIGN KEY (source_class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_dest_fk FOREIGN KEY (destination_class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_records ADD CONSTRAINT promotion_records_promo_decider_fk FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_exam_unique UNIQUE (class_id,academic_config_id,label);
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_config_fk FOREIGN KEY (academic_config_id) REFERENCES academic_configurations(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_examinations ADD CONSTRAINT mock_examinations_mock_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.mock_components ADD CONSTRAINT mock_components_mock_component_unique UNIQUE (mock_examination_id,subject_id,name);
ALTER TABLE public.mock_components ADD CONSTRAINT mock_components_mc_mock_fk FOREIGN KEY (mock_examination_id) REFERENCES mock_examinations(id) ON DELETE CASCADE;
ALTER TABLE public.mock_components ADD CONSTRAINT mock_components_mc_subject_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_mock_score_unique UNIQUE (student_id,component_id);
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_ms_mock_fk FOREIGN KEY (mock_examination_id) REFERENCES mock_examinations(id) ON DELETE CASCADE;
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_ms_component_fk FOREIGN KEY (component_id) REFERENCES mock_components(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_ms_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_ms_enterer_fk FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.mock_scores ADD CONSTRAINT mock_scores_check CHECK (raw_score >= 0 AND raw_score <= maximum_score);
ALTER TABLE public.academic_report_snapshots ADD CONSTRAINT academic_report_snapshots_ars_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.academic_report_snapshots ADD CONSTRAINT academic_report_snapshots_ars_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE public.academic_report_snapshots ADD CONSTRAINT academic_report_snapshots_ars_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE public.academic_report_snapshots ADD CONSTRAINT academic_report_snapshots_ars_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS academic_report_snapshots_academic_report_scope ON public.academic_report_snapshots (tenant_id,school_id,class_id,report_type,created_at);
ALTER TABLE public.district_sports_records ADD CONSTRAINT district_sports_records_dsr_district_fk FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;
ALTER TABLE public.district_sports_records ADD CONSTRAINT district_sports_records_dsr_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE public.district_sports_records ADD CONSTRAINT district_sports_records_dsr_actor_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS district_sports_records_district_sports_scope ON public.district_sports_records (district_id,school_id,record_type);
ALTER TABLE public.hostels ADD CONSTRAINT hostels_hostel_school_name UNIQUE (school_id,name);
ALTER TABLE public.hostel_blocks ADD CONSTRAINT hostel_blocks_hostel_block_name UNIQUE (hostel_id,name);
ALTER TABLE public.hostel_rooms ADD CONSTRAINT hostel_rooms_hostel_room_name UNIQUE (block_id,name);
ALTER TABLE public.hostel_beds ADD CONSTRAINT hostel_beds_hostel_bed_name UNIQUE (room_id,name);
CREATE INDEX IF NOT EXISTS hostel_assignments_hostel_assignment_student ON public.hostel_assignments (student_id,status);
CREATE INDEX IF NOT EXISTS hostel_assignments_hostel_assignment_school ON public.hostel_assignments (school_id,status);
ALTER TABLE public.hostel_roll_calls ADD CONSTRAINT hostel_roll_calls_hostel_rollcall_unique UNIQUE (school_id,student_id,session_name,attendance_date);
