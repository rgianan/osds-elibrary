import { mockApi } from '@/lib/mockApi';
import { CACHE_KEYS, fetchCached, invalidate } from '@/lib/cache';
import type { CategoryRecord } from '@/lib/categories';
import type { AskResult, AuditPage, CurrentUser, DocumentUploadPayload, IntegrityReport, LibraryDocument, Tag, UserAccount, UserDirectory } from '@/types';

declare global {
  interface Window {
    google?: {
      script?: {
        run: {
          withSuccessHandler: (handler: (result: unknown) => void) => any;
          withFailureHandler: (handler: (error: Error) => void) => any;
        } & Record<string, (...args: unknown[]) => void>;
      };
    };
    APP_CONFIG?: Record<string, unknown>;
  }
}

export function isGasRuntime() {
  return typeof window !== 'undefined' && !!window.google?.script?.run;
}

function runGas<T>(functionName: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    // Normalize the rejection to a real Error with the server's message. The error object
    // google.script.run hands to withFailureHandler comes from the GAS host realm, so it
    // fails `instanceof Error` in this sandboxed iframe — which would otherwise make every
    // caller fall back to a generic message and hide the real server error.
    const fail = (error: unknown) => {
      if (error instanceof Error) return reject(error);
      const message = (error && typeof error === 'object' && 'message' in error && (error as { message?: unknown }).message)
        ? String((error as { message?: unknown }).message)
        : (typeof error === 'string' && error ? error : 'The server request failed. Please try again.');
      reject(new Error(message));
    };
    try {
      const runner = window.google!.script!.run
        .withSuccessHandler((result: unknown) => resolve(result as T))
        .withFailureHandler(fail);
      const fn = runner[functionName];
      if (typeof fn !== 'function') throw new Error(`Server function "${functionName}" is not available. The Apps Script may need to be redeployed.`);
      fn(...args);
    } catch (err) {
      fail(err);
    }
  });
}

function throwIfNotOk(result: { ok: boolean } | null | undefined): { ok: boolean } {
  if (!result || result.ok === false) throw new Error('The server rejected the request.');
  return result;
}

function callDelete(remoteName: string, mockCall: () => Promise<{ ok: boolean }>, ...args: unknown[]): Promise<{ ok: boolean }> {
  const promise = isGasRuntime() ? runGas<{ ok: boolean }>(remoteName, ...args) : mockCall();
  return promise.then(throwIfNotOk);
}

/** A read that is served from memory when it is recent, and re-read in the background when not. */
function cachedRead<T>(key: string, call: () => Promise<T>): Promise<T> {
  return fetchCached<T>(key, call);
}

/**
 * Wraps a write so the lists it affects are re-read.
 *
 * Listed per write rather than clearing everything, because the fan-out is not obvious: renaming a
 * tag rewrites it across every document, and renaming a category refiles them — so both touch the
 * document list as well as their own.
 */
function afterWrite<T>(promise: Promise<T>, ...keys: string[]): Promise<T> {
  return promise.then((result) => {
    invalidate(...keys);
    return result;
  });
}

export type Bootstrap = { user: CurrentUser; categories: CategoryRecord[] };

export const api = {
  getBootstrap: (): Promise<Bootstrap> =>
    isGasRuntime() ? runGas<Bootstrap>('getBootstrap') : mockApi.getBootstrap(),

  listCategories: (): Promise<CategoryRecord[]> =>
    cachedRead(CACHE_KEYS.categories, () =>
      isGasRuntime() ? runGas<CategoryRecord[]>('listCategories') : mockApi.listCategories()),
  saveCategory: (payload: Partial<CategoryRecord>): Promise<CategoryRecord> =>
    afterWrite(
      isGasRuntime() ? runGas<CategoryRecord>('saveCategory', payload) : mockApi.saveCategory(payload),
      CACHE_KEYS.categories,
      CACHE_KEYS.documents,
    ),
  deleteCategory: (categoryId: string): Promise<{ ok: boolean }> =>
    afterWrite(
      callDelete('deleteCategory', () => mockApi.deleteCategory(categoryId), categoryId),
      CACHE_KEYS.categories,
    ),

  listDocuments: (): Promise<LibraryDocument[]> =>
    cachedRead(CACHE_KEYS.documents, () =>
      isGasRuntime() ? runGas<LibraryDocument[]>('listDocuments') : mockApi.listDocuments()),
  saveDocument: (payload: DocumentUploadPayload): Promise<LibraryDocument> =>
    afterWrite(
      isGasRuntime() ? runGas<LibraryDocument>('saveDocument', payload) : mockApi.saveDocument(payload),
      CACHE_KEYS.documents,
    ),
  moveDocument: (documentId: string, categoryPath: string, year: string, month: string): Promise<LibraryDocument> =>
    afterWrite(
      isGasRuntime()
        ? runGas<LibraryDocument>('moveDocument', documentId, categoryPath, year, month)
        : mockApi.moveDocument(documentId, categoryPath, year, month),
      CACHE_KEYS.documents,
    ),

  deleteDocument: (documentId: string): Promise<{ ok: boolean }> =>
    afterWrite(
      callDelete('deleteDocument', () => mockApi.deleteDocument(documentId), documentId),
      CACHE_KEYS.documents,
    ),

  checkLibraryIntegrity: (): Promise<IntegrityReport> =>
    isGasRuntime() ? runGas<IntegrityReport>('checkLibraryIntegrity') : mockApi.checkLibraryIntegrity(),

  askLibrary: (question: string): Promise<AskResult> =>
    isGasRuntime() ? runGas<AskResult>('askLibrary', question) : mockApi.askLibrary(question),

  listTags: (): Promise<Tag[]> =>
    cachedRead(CACHE_KEYS.tags, () => (isGasRuntime() ? runGas<Tag[]>('listTags') : mockApi.listTags())),
  saveTag: (payload: Partial<Tag>): Promise<Tag> =>
    afterWrite(
      isGasRuntime() ? runGas<Tag>('saveTag', payload) : mockApi.saveTag(payload),
      CACHE_KEYS.tags,
      CACHE_KEYS.documents,
    ),
  deleteTag: (tagId: string): Promise<{ ok: boolean }> =>
    afterWrite(
      callDelete('deleteTag', () => mockApi.deleteTag(tagId), tagId),
      CACHE_KEYS.tags,
      CACHE_KEYS.documents,
    ),

  syncLibraryAccess: (): Promise<{ ok: boolean; message: string }> =>
    isGasRuntime() ? runGas<{ ok: boolean; message: string }>('syncLibraryFolderAccess') : mockApi.syncLibraryAccess(),

  listAuditLog: (limit?: number, offset?: number): Promise<AuditPage> =>
    isGasRuntime() ? runGas<AuditPage>('listAuditLog', limit, offset) : mockApi.listAuditLog(limit, offset),

  listUsers: (): Promise<UserDirectory> =>
    cachedRead(CACHE_KEYS.users, () => (isGasRuntime() ? runGas<UserDirectory>('listUsers') : mockApi.listUsers())),
  saveUser: (payload: Partial<UserAccount>): Promise<UserAccount> =>
    afterWrite(
      isGasRuntime() ? runGas<UserAccount>('saveUser', payload) : mockApi.saveUser(payload),
      CACHE_KEYS.users,
    ),
  deleteUser: (userId: string): Promise<{ ok: boolean }> =>
    afterWrite(
      callDelete('deleteUser', () => mockApi.deleteUser(userId), userId),
      CACHE_KEYS.users,
    ),

  // Dev-only account switcher. Never reaches the Apps Script backend. The cache is deliberately
  // NOT cleared here: clearing it wakes every mounted page into an immediate re-read while the
  // switch is still in flight, so those reads would resolve against the outgoing account. The
  // re-bootstrap that follows clears it once the new identity is in place.
  switchMockUser: (email: string): Promise<Bootstrap> => mockApi.switchMockUser(email),
  listMockUserEmails: (): Promise<string[]> => mockApi.listMockUserEmails(),
};
