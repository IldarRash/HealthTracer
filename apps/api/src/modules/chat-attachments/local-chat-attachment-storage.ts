import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

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

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

export class LocalChatAttachmentStorageAdapter implements ChatAttachmentStorageAdapter {
  constructor(private readonly rootDirectory: string) {}

  private resolvePath(storageKey: string): string {
    return join(this.rootDirectory, storageKey);
  }

  async store(
    userId: string,
    attachmentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension = MIME_EXTENSION[mimeType] ?? "bin";
    const storageKey = join(userId, `${attachmentId}.${extension}`).replace(/\\/g, "/");
    const absolutePath = this.resolvePath(storageKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);

    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolvePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolvePath(storageKey));
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

  return MIME_EXTENSION[mimeType] ?? "bin";
}
