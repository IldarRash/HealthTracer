import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface DocumentStorageAdapter {
  store(userId: string, documentId: string, content: Buffer, mimeType: string): Promise<string>;
  read(storageReference: string): Promise<Buffer>;
  delete(storageReference: string): Promise<void>;
}

export class LocalDocumentStorageAdapter implements DocumentStorageAdapter {
  constructor(private readonly rootDirectory: string) {}

  private resolvePath(storageReference: string): string {
    return join(this.rootDirectory, storageReference);
  }

  async store(
    userId: string,
    documentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension = mimeType === "text/plain" ? "txt" : "bin";
    const storageReference = join(userId, `${documentId}.${extension}`);
    const absolutePath = this.resolvePath(storageReference);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);

    return storageReference.replace(/\\/g, "/");
  }

  async read(storageReference: string): Promise<Buffer> {
    return readFile(this.resolvePath(storageReference));
  }

  async delete(storageReference: string): Promise<void> {
    try {
      await unlink(this.resolvePath(storageReference));
    } catch {
      // Best-effort cleanup for local development storage.
    }
  }
}
