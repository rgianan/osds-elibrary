import type { AskResult, AuditEntry, CurrentUser, DocumentUploadPayload, LibraryDocument, Tag, UserAccount } from '@/types';
import { ADMIN_HOST_EMAIL, isAllowedDomain, roleForEmail } from '@/lib/permissions';
import { normalizeEmail } from '@/lib/utils';

/**
 * In-browser stand-in for the Apps Script backend so `npm run dev` is fully clickable without a
 * spreadsheet. Mirrors the real backend's validation rules (domain check, active-user check,
 * duplicate tag names, uploader-only edits) so the UI behaves the same in both runtimes.
 */

let currentEmail = ADMIN_HOST_EMAIL;

let users: UserAccount[] = [
  { user_id: 'USR-000001', name: 'OSDS Records', email: ADMIN_HOST_EMAIL, active: 'TRUE', role: 'ADMIN' },
  { user_id: 'USR-000002', name: 'Ralph Gianan', email: 'rgianan@ched.gov.ph', active: 'TRUE', role: 'STAFF' },
  { user_id: 'USR-000003', name: 'Maria Santos', email: 'msantos@ched.gov.ph', active: 'TRUE', role: 'STAFF' },
  { user_id: 'USR-000004', name: 'Jose Dela Cruz', email: 'jdelacruz@ched.gov.ph', active: 'FALSE', role: 'STAFF' },
];

let tags: Tag[] = [
  { tag_id: 'TAG-000001', name: 'Office of the Director', description: 'Documents originating from or addressed to the Office of the Director.', created_by: ADMIN_HOST_EMAIL, created_at: '2026-01-05 09:00:00' },
];

let documents: LibraryDocument[] = [
  {
    document_id: 'DOC-000001',
    name: 'CMO No. 01 s. 2026 — Revised Policies on Student Affairs and Services',
    category_path: 'Issuances::CHED Memorandum Orders',
    year: '2026',
    month: '',
    tags: 'Office of the Director',
    remarks: 'Superseded CMO No. 09 s. 2013.',
    file_id: 'mock-file-1',
    file_url: 'https://drive.google.com/file/d/mock-file-1/view',
    file_name: 'CMO-01-s2026.pdf',
    mime_type: 'application/pdf',
    file_size: 862_144,
    uploaded_by: ADMIN_HOST_EMAIL,
    uploaded_by_name: 'OSDS Records',
    date_uploaded: '2026-02-11',
  },
  {
    document_id: 'DOC-000002',
    name: 'CMO No. 02 s. 2026 — Guidelines on Student Organizations',
    category_path: 'Issuances::CHED Memorandum Orders',
    year: '2026',
    month: '',
    tags: '',
    remarks: '',
    file_id: 'mock-file-2',
    file_url: 'https://drive.google.com/file/d/mock-file-2/view',
    file_name: 'CMO-02-s2026.pdf',
    mime_type: 'application/pdf',
    file_size: 1_340_000,
    uploaded_by: 'rgianan@ched.gov.ph',
    uploaded_by_name: 'Ralph Gianan',
    date_uploaded: '2026-03-02',
  },
  {
    document_id: 'DOC-000003',
    name: 'CEB Resolution No. 145 s. 2025',
    category_path: 'CEB Matters',
    year: '2025',
    month: '08',
    tags: 'Office of the Director',
    remarks: 'For reference of the Legal Affairs Service.',
    file_id: 'mock-file-3',
    file_url: 'https://drive.google.com/file/d/mock-file-3/view',
    file_name: 'CEB-Res-145-s2025.pdf',
    mime_type: 'application/pdf',
    file_size: 402_000,
    uploaded_by: 'msantos@ched.gov.ph',
    uploaded_by_name: 'Maria Santos',
    date_uploaded: '2025-09-14',
  },
  {
    document_id: 'DOC-000004',
    name: 'Office Order No. 22 s. 2025 — Designation of OIC',
    category_path: 'Office Order/Memorandum',
    year: '2025',
    month: '',
    tags: 'Office of the Director',
    remarks: '',
    file_id: 'mock-file-4',
    file_url: 'https://drive.google.com/file/d/mock-file-4/view',
    file_name: 'OO-22-s2025.pdf',
    mime_type: 'application/pdf',
    file_size: 210_000,
    uploaded_by: ADMIN_HOST_EMAIL,
    uploaded_by_name: 'OSDS Records',
    date_uploaded: '2025-07-30',
  },
  {
    document_id: 'DOC-000005',
    name: 'Work and Financial Plan CY 1994',
    category_path: 'Work and Financial Plan',
    year: '1994',
    month: '',
    tags: '',
    remarks: 'Archived scan.',
    file_id: 'mock-file-5',
    file_url: 'https://drive.google.com/file/d/mock-file-5/view',
    file_name: 'WFP-1994.pdf',
    mime_type: 'application/pdf',
    file_size: 3_100_000,
    uploaded_by: 'rgianan@ched.gov.ph',
    uploaded_by_name: 'Ralph Gianan',
    date_uploaded: '2024-11-08',
  },
];

// Append-only in the real backend, so the seed is ordered oldest-first like the sheet.
let auditLog: AuditEntry[] = [
  { audit_id: 'AUD-000001', timestamp: '2026-02-11 09:14:02', actor_email: ADMIN_HOST_EMAIL, actor_name: 'OSDS Records', action: 'CREATE_DOCUMENT', sheet_name: 'Documents', record_id: 'DOC-000001', details: 'Issuances::CHED Memorandum Orders 2026' },
  { audit_id: 'AUD-000002', timestamp: '2026-03-02 11:40:55', actor_email: 'rgianan@ched.gov.ph', actor_name: 'Ralph Gianan', action: 'CREATE_DOCUMENT', sheet_name: 'Documents', record_id: 'DOC-000002', details: 'Issuances::CHED Memorandum Orders 2026' },
  { audit_id: 'AUD-000003', timestamp: '2026-03-04 08:02:11', actor_email: ADMIN_HOST_EMAIL, actor_name: 'OSDS Records', action: 'CREATE_USER', sheet_name: 'Users', record_id: 'USR-000003', details: 'msantos@ched.gov.ph' },
  { audit_id: 'AUD-000004', timestamp: '2026-03-09 15:22:47', actor_email: 'msantos@ched.gov.ph', actor_name: 'Maria Santos', action: 'CREATE_TAG', sheet_name: 'Tags', record_id: 'TAG-000002', details: 'Legal Affairs Service' },
  { audit_id: 'AUD-000005', timestamp: '2026-03-12 10:05:30', actor_email: ADMIN_HOST_EMAIL, actor_name: 'OSDS Records', action: 'UPDATE_USER', sheet_name: 'Users', record_id: 'USR-000004', details: 'jdelacruz@ched.gov.ph FALSE' },
  { audit_id: 'AUD-000006', timestamp: '2026-03-15 13:47:19', actor_email: 'rgianan@ched.gov.ph', actor_name: 'Ralph Gianan', action: 'ASK', sheet_name: 'Documents', record_id: '', details: 'what issuances cover student organizations' },
  { audit_id: 'AUD-000007', timestamp: '2026-03-18 16:31:08', actor_email: ADMIN_HOST_EMAIL, actor_name: 'OSDS Records', action: 'DELETE_DOCUMENT', sheet_name: 'Documents', record_id: 'DOC-000009', details: 'Superseded draft' },
];

/**
 * Mirrors audit_() in Code.gs so the Audit Log page shows real activity in dev. Without it a move
 * or delete looks unrecorded here while production logs it — exactly the sort of gap that makes
 * dev testing misleading.
 */
function recordAudit(action: string, sheet: string, recordId: string, details: string) {
  const actor = users.find((row) => normalizeEmail(row.email) === normalizeEmail(currentEmail));
  auditLog = [...auditLog, {
    audit_id: nextId('AUD'),
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    actor_email: normalizeEmail(currentEmail),
    actor_name: actor?.name || '',
    action,
    sheet_name: sheet,
    record_id: recordId,
    details,
  }];
}

let sequence = 100;
function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 120));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function requireCurrentUser(): CurrentUser {
  const email = normalizeEmail(currentEmail);
  if (!isAllowedDomain(email)) throw new Error(`Access denied. The E-Library is limited to @ched.gov.ph accounts: ${email}`);
  const account = users.find((row) => normalizeEmail(row.email) === email);
  if (!account) throw new Error(`Access denied. ${email} is not in the E-Library user list. Ask the Administrator to add your account.`);
  if (String(account.active).toUpperCase() !== 'TRUE') throw new Error(`Access denied. The account ${email} is inactive.`);
  return { email, name: account.name || email, role: roleForEmail(email) };
}

function isAdmin() {
  return requireCurrentUser().role === 'ADMIN';
}

function assertAdmin() {
  if (!isAdmin()) throw new Error('Administrator access required.');
}

function assertCanModifyDocument(existing: LibraryDocument) {
  const me = requireCurrentUser();
  if (me.role === 'ADMIN') return;
  if (normalizeEmail(existing.uploaded_by) !== normalizeEmail(me.email)) {
    throw new Error('You can only edit or delete documents you uploaded.');
  }
}

export const mockApi = {
  getBootstrap: async () => delay({ user: requireCurrentUser() }),

  /** Dev-only: lets the developer preview the app as any seeded account. Not exposed in GAS. */
  switchMockUser: async (email: string) => {
    currentEmail = email;
    return delay({ user: requireCurrentUser() });
  },
  listMockUserEmails: async () => delay(users.map((row) => row.email)),

  listDocuments: async () => {
    requireCurrentUser();
    return delay(clone(documents));
  },

  saveDocument: async (payload: DocumentUploadPayload) => {
    const me = requireCurrentUser();
    if (!String(payload.name || '').trim()) throw new Error('Missing required fields: name');
    if (!String(payload.category_path || '').trim()) throw new Error('Missing required fields: category');
    if (!String(payload.year || '').trim()) throw new Error('Missing required fields: year');

    const { file_base64, ...fields } = payload;
    if (fields.document_id) {
      const existing = documents.find((row) => row.document_id === fields.document_id);
      if (!existing) throw new Error('Document not found.');
      assertCanModifyDocument(existing);
      const updated: LibraryDocument = { ...existing, ...fields, updated_at: todayStamp() } as LibraryDocument;
      documents = documents.map((row) => (row.document_id === updated.document_id ? updated : row));
      recordAudit('UPDATE_DOCUMENT', 'Documents', updated.document_id, `${updated.category_path} ${updated.year}`);
      return delay(clone(updated));
    }

    if (!file_base64) throw new Error('Select a file to upload.');
    const created: LibraryDocument = {
      document_id: nextId('DOC'),
      name: String(fields.name),
      category_path: String(fields.category_path),
      year: String(fields.year),
      month: String(fields.month || ''),
      tags: String(fields.tags || ''),
      remarks: String(fields.remarks || ''),
      file_id: `mock-${Date.now()}`,
      file_url: '#',
      file_name: String(fields.file_name || 'document.pdf'),
      mime_type: String(fields.mime_type || 'application/pdf'),
      file_size: Number(fields.file_size || 0),
      uploaded_by: me.email,
      uploaded_by_name: me.name,
      date_uploaded: todayStamp(),
      created_at: todayStamp(),
    };
    documents = [...documents, created];
    recordAudit('CREATE_DOCUMENT', 'Documents', created.document_id, `${created.category_path} ${created.year}`);
    return delay(clone(created));
  },

  moveDocument: async (documentId: string, categoryPath: string, year: string, month: string) => {
    requireCurrentUser();
    const existing = documents.find((row) => row.document_id === documentId);
    if (!existing) throw new Error('Document not found.');
    assertCanModifyDocument(existing);
    if (!categoryPath) throw new Error('Unknown category: ' + categoryPath);
    if (!/^\d{4}$/.test(String(year))) throw new Error('Year is required.');
    const moved: LibraryDocument = { ...existing, category_path: categoryPath, year, month: month || '', updated_at: todayStamp() };
    documents = documents.map((row) => (row.document_id === documentId ? moved : row));
    const where = (d: LibraryDocument) => [d.category_path.split('::').join(' > '), d.year, d.month].filter(Boolean).join(' / ');
    recordAudit('MOVE_DOCUMENT', 'Documents', documentId, `${where(existing)} -> ${where(moved)}`);
    return delay(clone(moved));
  },

  checkLibraryIntegrity: async () => {
    assertAdmin();
    // No Drive in dev, so every document is reported as correctly filed.
    return delay({
      ok: true,
      checked: documents.length,
      problems: [],
      message: `All ${documents.length} documents are present and correctly filed. (mock — no Drive calls made)`,
    });
  },

  deleteDocument: async (documentId: string) => {
    const existing = documents.find((row) => row.document_id === documentId);
    if (existing) assertCanModifyDocument(existing);
    documents = documents.filter((row) => row.document_id !== documentId);
    if (existing) recordAudit('DELETE_DOCUMENT', 'Documents', documentId, existing.name);
    return delay({ ok: true });
  },

  /**
   * Dev stand-in for the Gemini call. There is no API key in `npm run dev`, so rather than always
   * returning NO_KEY (which would make the Ask panel unreviewable), this synthesizes an answer from
   * a plain keyword match and labels itself the "mock" provider. Type `quota` or `nokey` in the
   * question to exercise the two failure paths.
   */
  askLibrary: async (question: string): Promise<AskResult> => {
    requireCurrentUser();
    const asked = String(question || '').trim();
    if (!asked) throw new Error('Ask a question first.');
    if (/nokey/i.test(asked)) {
      return delay({ ok: false, reason: 'NO_KEY', message: 'No AI provider key is configured.' } as AskResult);
    }
    if (/quota/i.test(asked)) {
      return delay({ ok: false, reason: 'UNAVAILABLE', message: 'The AI provider is unavailable or out of quota.' } as AskResult);
    }
    if (/ratelimit/i.test(asked)) {
      return delay({
        ok: false,
        reason: 'RATE_LIMITED',
        message: 'You have reached the limit of 5 questions per minute. Your question was run as a keyword search instead.',
      } as AskResult);
    }

    // Answered locally, so it is not attributed to a provider — mirrors askLibrary in Code.gs.
    if (documents.length === 0) {
      return delay({ ok: true, provider: 'none', document_ids: [], answer: 'The library has no documents to search yet.' } as AskResult);
    }

    const terms = asked.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const hits = documents.filter((doc) =>
      terms.some((term) => `${doc.name} ${doc.tags} ${doc.remarks} ${doc.category_path} ${doc.year}`.toLowerCase().includes(term)),
    );
    return delay({
      ok: true,
      provider: 'mock',
      document_ids: hits.map((doc) => doc.document_id),
      answer: hits.length
        ? `Found ${hits.length} document${hits.length === 1 ? '' : 's'} whose details match your question. The most relevant is "${hits[0].name}" (${hits[0].category_path.split('::').join(' > ')}, ${hits[0].year}).`
        : 'No document in the library has details matching that question.',
    } as AskResult);
  },

  listTags: async () => {
    requireCurrentUser();
    return delay(clone(tags));
  },

  saveTag: async (payload: Partial<Tag>) => {
    requireCurrentUser();
    // Creating is open to all staff; renaming rewrites the tag across every document, so it is
    // Admin-only — mirroring saveTag in apps-script/Code.gs.
    if (payload.tag_id) assertAdmin();
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('Missing required fields: name');
    const duplicate = tags.find(
      (row) => row.name.trim().toLowerCase() === name.toLowerCase() && row.tag_id !== payload.tag_id,
    );
    if (duplicate) throw new Error(`A tag named "${name}" already exists.`);

    if (payload.tag_id) {
      const existing = tags.find((row) => row.tag_id === payload.tag_id);
      if (!existing) throw new Error('Tag not found.');
      const previousName = existing.name;
      const updated: Tag = { ...existing, ...payload, name, updated_at: todayStamp() };
      tags = tags.map((row) => (row.tag_id === updated.tag_id ? updated : row));
      // Keep the denormalized tag strings on documents in sync with the rename.
      if (previousName !== name) {
        documents = documents.map((doc) => ({
          ...doc,
          tags: doc.tags
            .split(',')
            .map((tag) => (tag.trim().toLowerCase() === previousName.toLowerCase() ? name : tag.trim()))
            .filter(Boolean)
            .join(', '),
        }));
      }
      return delay(clone(updated));
    }

    const created: Tag = {
      tag_id: nextId('TAG'),
      name,
      description: String(payload.description || ''),
      created_by: currentEmail,
      created_at: todayStamp(),
    };
    tags = [...tags, created];
    return delay(clone(created));
  },

  deleteTag: async (tagId: string) => {
    assertAdmin();
    const existing = tags.find((row) => row.tag_id === tagId);
    tags = tags.filter((row) => row.tag_id !== tagId);
    if (existing) {
      documents = documents.map((doc) => ({
        ...doc,
        tags: doc.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag && tag.toLowerCase() !== existing.name.toLowerCase())
          .join(', '),
      }));
    }
    return delay({ ok: true });
  },

  syncLibraryAccess: async () => {
    assertAdmin();
    const active = users.filter((row) => String(row.active).toUpperCase() === 'TRUE').length;
    return delay({ ok: true, message: `Library folder access synced: ${active} allowed, 0 added, 0 removed. (mock — no Drive calls made)` });
  },

  listAuditLog: async (limit?: number, offset?: number) => {
    assertAdmin();
    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const skip = Math.max(Number(offset) || 0, 0);
    const total = auditLog.length;
    // Seeded oldest-first like the sheet, so page 0 is the block at the end.
    const end = Math.max(total - skip, 0);
    const start = Math.max(end - pageSize, 0);
    return delay({ entries: clone(auditLog.slice(start, end).reverse()), total });
  },

  listUsers: async () => {
    assertAdmin();
    return delay(clone(users));
  },

  saveUser: async (payload: Partial<UserAccount>) => {
    assertAdmin();
    const email = normalizeEmail(payload.email || '');
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('Missing required fields: name');
    if (!email) throw new Error('Missing required fields: email');
    if (!isAllowedDomain(email)) throw new Error('Only @ched.gov.ph email addresses may be added.');
    const duplicate = users.find((row) => normalizeEmail(row.email) === email && row.user_id !== payload.user_id);
    if (duplicate) throw new Error(`A user with the email ${email} already exists.`);

    const active = String(payload.active || 'TRUE').toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
    if (email === ADMIN_HOST_EMAIL && active === 'FALSE') throw new Error('The Administrator account cannot be deactivated.');

    if (payload.user_id) {
      const existing = users.find((row) => row.user_id === payload.user_id);
      if (!existing) throw new Error('User not found.');
      const updated: UserAccount = { ...existing, name, email, active, role: roleForEmail(email), updated_at: todayStamp() };
      users = users.map((row) => (row.user_id === updated.user_id ? updated : row));
      return delay(clone(updated));
    }

    const created: UserAccount = {
      user_id: nextId('USR'),
      name,
      email,
      active,
      role: roleForEmail(email),
      created_at: todayStamp(),
    };
    users = [...users, created];
    return delay(clone(created));
  },

  deleteUser: async (userId: string) => {
    assertAdmin();
    const existing = users.find((row) => row.user_id === userId);
    if (existing && normalizeEmail(existing.email) === ADMIN_HOST_EMAIL) {
      throw new Error('The Administrator account cannot be deleted.');
    }
    users = users.filter((row) => row.user_id !== userId);
    return delay({ ok: true });
  },
};

