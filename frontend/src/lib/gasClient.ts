import { mockApi } from '@/lib/mockApi';
import type { AskResult, AuditPage, CurrentUser, DocumentUploadPayload, IntegrityReport, LibraryDocument, Tag, UserAccount } from '@/types';

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

export type Bootstrap = { user: CurrentUser };

export const api = {
  getBootstrap: (): Promise<Bootstrap> =>
    isGasRuntime() ? runGas<Bootstrap>('getBootstrap') : mockApi.getBootstrap(),

  listDocuments: (): Promise<LibraryDocument[]> =>
    isGasRuntime() ? runGas<LibraryDocument[]>('listDocuments') : mockApi.listDocuments(),
  saveDocument: (payload: DocumentUploadPayload): Promise<LibraryDocument> =>
    isGasRuntime() ? runGas<LibraryDocument>('saveDocument', payload) : mockApi.saveDocument(payload),
  moveDocument: (documentId: string, categoryPath: string, year: string, month: string): Promise<LibraryDocument> =>
    isGasRuntime()
      ? runGas<LibraryDocument>('moveDocument', documentId, categoryPath, year, month)
      : mockApi.moveDocument(documentId, categoryPath, year, month),

  deleteDocument: (documentId: string): Promise<{ ok: boolean }> =>
    callDelete('deleteDocument', () => mockApi.deleteDocument(documentId), documentId),

  checkLibraryIntegrity: (): Promise<IntegrityReport> =>
    isGasRuntime() ? runGas<IntegrityReport>('checkLibraryIntegrity') : mockApi.checkLibraryIntegrity(),

  askLibrary: (question: string): Promise<AskResult> =>
    isGasRuntime() ? runGas<AskResult>('askLibrary', question) : mockApi.askLibrary(question),

  listTags: (): Promise<Tag[]> => (isGasRuntime() ? runGas<Tag[]>('listTags') : mockApi.listTags()),
  saveTag: (payload: Partial<Tag>): Promise<Tag> =>
    isGasRuntime() ? runGas<Tag>('saveTag', payload) : mockApi.saveTag(payload),
  deleteTag: (tagId: string): Promise<{ ok: boolean }> =>
    callDelete('deleteTag', () => mockApi.deleteTag(tagId), tagId),

  syncLibraryAccess: (): Promise<{ ok: boolean; message: string }> =>
    isGasRuntime() ? runGas<{ ok: boolean; message: string }>('syncLibraryFolderAccess') : mockApi.syncLibraryAccess(),

  listAuditLog: (limit?: number, offset?: number): Promise<AuditPage> =>
    isGasRuntime() ? runGas<AuditPage>('listAuditLog', limit, offset) : mockApi.listAuditLog(limit, offset),

  listUsers: (): Promise<UserAccount[]> => (isGasRuntime() ? runGas<UserAccount[]>('listUsers') : mockApi.listUsers()),
  saveUser: (payload: Partial<UserAccount>): Promise<UserAccount> =>
    isGasRuntime() ? runGas<UserAccount>('saveUser', payload) : mockApi.saveUser(payload),
  deleteUser: (userId: string): Promise<{ ok: boolean }> =>
    callDelete('deleteUser', () => mockApi.deleteUser(userId), userId),

  // Dev-only account switcher. Never reaches the Apps Script backend.
  switchMockUser: (email: string): Promise<Bootstrap> => mockApi.switchMockUser(email),
  listMockUserEmails: (): Promise<string[]> => mockApi.listMockUserEmails(),
};
