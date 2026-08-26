export type Role = 'ADMIN' | 'STAFF';

export type CurrentUser = {
  email: string;
  name: string;
  role: Role;
};

export type LibraryDocument = {
  document_id: string;
  name: string;
  /** Slash-joined category path, e.g. "Issuances/CHED Memorandum Orders". Year/month live in their own fields. */
  category_path: string;
  year: string;
  /** Two-digit month ("01".."12"). Only categories with a month level use it. */
  month: string;
  /** Comma-separated tag names, mirroring how the Sheet stores them. */
  tags: string;
  remarks: string;
  file_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size: number | string;
  uploaded_by: string;
  uploaded_by_name: string;
  date_uploaded: string;
  created_at?: string;
  updated_at?: string;
};

/** What the upload dialog sends: the document fields plus the base64 payload of the chosen file. */
export type DocumentUploadPayload = Partial<LibraryDocument> & {
  file_base64?: string;
};

export type IntegrityProblem = {
  document_id: string;
  name: string;
  /** NO_FILE | DELETED | TRASHED | MOVED */
  issue: string;
  detail: string;
};

export type IntegrityReport = {
  ok: boolean;
  checked: number;
  problems: IntegrityProblem[];
  message: string;
};

export type Tag = {
  tag_id: string;
  name: string;
  description: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Result of an Ask query. `ok: false` is an expected, non-exceptional outcome — no API key
 * configured, or the provider's quota tripped — and the UI falls back to keyword search.
 */
export type AskResult =
  | { ok: true; answer: string; document_ids: string[]; provider: string }
  | { ok: false; reason: 'NO_KEY' | 'UNAVAILABLE' | 'RATE_LIMITED'; message: string };

export type AuditEntry = {
  audit_id: string;
  timestamp: string;
  actor_email: string;
  /** Recorded at the time of the action; may be blank for entries written before this was stored. */
  actor_name: string;
  /** e.g. CREATE_DOCUMENT, UPDATE_USER, DELETE_TAG, ASK */
  action: string;
  sheet_name: string;
  record_id: string;
  details: string;
};

/** One page of the audit trail, newest first, plus the total row count for paging. */
export type AuditPage = {
  entries: AuditEntry[];
  total: number;
};

export type UserAccount = {
  /** Empty for accounts that come from the Office Management System — those have no local row. */
  user_id: string;
  name: string;
  email: string;
  /** 'TRUE' | 'FALSE' — stored as a string because Sheets round-trips booleans inconsistently. */
  active: string;
  /** Where the account came from. OMS rows are managed in the Office Management System. */
  source?: 'OMS' | 'LOCAL';
  role?: Role;
  created_at?: string;
  updated_at?: string;
};

/** Health of the link to the Office Management System's user directory. */
export type OmsDirectoryStatus = {
  configured: boolean;
  ok: boolean;
  /** True when the list came from cache after a failed refresh. */
  stale: boolean;
  reason: string;
  count: number;
};

export type UserDirectory = {
  users: UserAccount[];
  oms: OmsDirectoryStatus;
};
