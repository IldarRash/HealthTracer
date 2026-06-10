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
 * MIME → extension map scoped to the image-only chat attachment contract.
 * Derived from CHAT_PROVISIONAL_UPLOAD_MIME_TYPES so there is one source of truth.
 * PDF and text are intentionally absent — document upload is a separate explicit
 * profile feature, not a chat attachment.
 */
const IMAGE_MIME_EXTENSION: Record<(typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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
      IMAGE_MIME_EXTENSION[mimeType as (typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number]] ??
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
    IMAGE_MIME_EXTENSION[mimeType as (typeof CHAT_PROVISIONAL_UPLOAD_MIME_TYPES)[number]] ?? "bin"
  );
}
