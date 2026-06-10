import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveUploadExtension } from "./document-processing.js";
import type { SupportedHealthDocumentMimeType } from "@health/types";
import {
  assertNotProductionWithoutOptIn,
  resolveSafePath,
} from "../../common/local-storage.js";

export interface DocumentStorageAdapter {
  store(userId: string, documentId: string, content: Buffer, mimeType: string): Promise<string>;
  read(storageReference: string): Promise<Buffer>;
  delete(storageReference: string): Promise<void>;
}

export class LocalDocumentStorageAdapter implements DocumentStorageAdapter {
  private readonly resolvedRoot: string;

  constructor(
    rootDirectory: string,
    options: { allowInProduction?: boolean; nodeEnv?: string } = {},
  ) {
    assertNotProductionWithoutOptIn("LocalDocumentStorageAdapter", options);
    this.resolvedRoot = resolve(rootDirectory);
  }

  async store(
    userId: string,
    documentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension = resolveUploadExtension(mimeType as SupportedHealthDocumentMimeType);
    const storageReference = join(userId, `${documentId}.${extension}`).replace(/\\/g, "/");
    const absolutePath = resolveSafePath(this.resolvedRoot, storageReference);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);

    return storageReference;
  }

  async read(storageReference: string): Promise<Buffer> {
    return readFile(resolveSafePath(this.resolvedRoot, storageReference));
  }

  async delete(storageReference: string): Promise<void> {
    try {
      await unlink(resolveSafePath(this.resolvedRoot, storageReference));
    } catch {
      // Best-effort cleanup for local development storage.
    }
  }
}
