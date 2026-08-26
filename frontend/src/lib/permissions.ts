import type { CurrentUser, Role } from '@/types';

/** The host account. It is the only ADMIN and is the account that owns Settings. */
export const ADMIN_HOST_EMAIL = 'osdsrecords@ched.gov.ph';

/** Staff accounts must belong to this Google Workspace domain. */
export const ALLOWED_EMAIL_DOMAIN = 'ched.gov.ph';

export function isAllowedDomain(email: string) {
  return String(email || '').trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function roleForEmail(email: string): Role {
  return String(email || '').trim().toLowerCase() === ADMIN_HOST_EMAIL ? 'ADMIN' : 'STAFF';
}

export type Permissions = {
  /** Every active staff account may upload, tag, and browse. */
  uploadDocuments: boolean;
  /** Uploader or Admin may edit/delete a document. */
  manageAllDocuments: boolean;
  /** Creating a tag is offered inline in the upload dialog, so it is open to all staff. */
  createTags: boolean;
  /** Renaming or deleting a tag rewrites it across every document, so it stays with the Admin. */
  manageTags: boolean;
  manageUsers: boolean;
  /** The trail names who touched what — Admin only. */
  viewAuditLog: boolean;
  /** Reconciling the library against Drive — Admin only. */
  viewLibraryHealth: boolean;
  /** Editing the filing tree itself — Admin only. */
  manageCategories: boolean;
  openSettings: boolean;
};

export function getPermissions(user: CurrentUser): Permissions {
  const admin = user.role === 'ADMIN';
  return {
    uploadDocuments: true,
    manageAllDocuments: admin,
    createTags: true,
    manageTags: admin,
    manageUsers: admin,
    viewAuditLog: admin,
    viewLibraryHealth: admin,
    manageCategories: admin,
    openSettings: admin,
  };
}

/** Staff may modify only their own uploads; the Admin may modify any. */
export function canModifyDocument(user: CurrentUser, uploadedBy: string) {
  if (user.role === 'ADMIN') return true;
  return String(uploadedBy || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase();
}
