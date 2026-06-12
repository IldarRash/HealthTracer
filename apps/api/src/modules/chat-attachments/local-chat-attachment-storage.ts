import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { CHAT_PROVISIONAL_UPLOAD_MIME_TYPES } from "@health/types";
import {
  assertNotProductionWithoutOptIn,
  resolveSafePath,
} from "../../common/local-storage.js";

export interface ChatAttachmentStorageAdapter {
  store(
    userId: string,
    attachmentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

/**
 * MIME → extension map for all supported chat attachment MIMEs.
 * Covers both image types (jpeg/png/webp) and document file types (pdf/txt/md).
 */
const MIME_EXTENSION: Record<(typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
};

export class LocalChatAttachmentStorageAdapter implements ChatAttachmentStorageAdapter {
  private readonly resolvedRoot: string;

  constructor(
    rootDirectory: string,
    options: { allowInProduction?: boolean; nodeEnv?: string } = {},
  ) {
    assertNotProductionWithoutOptIn("LocalChatAttachmentStorageAdapter", options);
    this.resolvedRoot = resolve(rootDirectory);
  }

  async store(
    userId: string,
    attachmentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension =
      MIME_EXTENSION[mimeType as (typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number]] ??
      "bin";
    const storageKey = join(userId, `${attachmentId}.${extension}`).replace(/\\/g, "/");
    const absolutePath = resolveSafePath(this.resolvedRoot, storageKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);

    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(resolveSafePath(this.resolvedRoot, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(resolveSafePath(this.resolvedRoot, storageKey));
    } catch {
      // Best-effort cleanup for local development storage.
    }
  }
}

export function decodeAttachmentContent(fileContentBase64: string): Buffer {
  return Buffer.from(fileContentBase64, "base64");
}

export function inferAttachmentExtension(filename: string, mimeType: string): string {
  const fromName = extname(filename).replace(/^\./, "");

  if (fromName.length > 0) {
    return fromName;
  }

  return (
    MIME_EXTENSION[mimeType as (typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number]] ?? "bin"
  );
}
