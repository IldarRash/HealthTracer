import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { SupportedLabReportMimeType } from "@health/types";
import {
  assertNotProductionWithoutOptIn,
  resolveSafePath,
} from "../../common/local-storage.js";

export interface LabReportStorageAdapter {
  store(
    userId: string,
    reportId: string,
    content: Buffer,
    mimeType: SupportedLabReportMimeType,
  ): Promise<string>;
  read(storageReference: string): Promise<Buffer>;
  delete(storageReference: string): Promise<void>;
}

export function resolveLabReportExtension(
  mimeType: SupportedLabReportMimeType,
): string {
  return mimeType === "application/pdf" ? "pdf" : "txt";
}

export class LocalLabReportStorageAdapter implements LabReportStorageAdapter {
  private readonly resolvedRoot: string;

  constructor(
    rootDirectory: string,
    options: { allowInProduction?: boolean; nodeEnv?: string } = {},
  ) {
    assertNotProductionWithoutOptIn("LocalLabReportStorageAdapter", options);
    this.resolvedRoot = resolve(rootDirectory);
  }

  async store(
    userId: string,
    reportId: string,
    content: Buffer,
    mimeType: SupportedLabReportMimeType,
  ): Promise<string> {
    const extension = resolveLabReportExtension(mimeType);
    const storageReference = join(userId, `${reportId}.${extension}`).replace(/\\/g, "/");
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
