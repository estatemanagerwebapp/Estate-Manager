import { AppError } from '../../lib/errors.js';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/**
 * Local-disk media storage. Files land under `<root>/<organizationId>/<id>`
 * and are served back as a static public URL (relative path recorded on the
 * row so a future R2 migration can rewrite only the URL, not the model).
 */

export interface MediaUploadResult {
  id: string;
  /** Public URL (relative to the API base) for the stored file. */
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export class LocalMediaStorage {
  constructor(
    private readonly prisma: PrismaClient,
    /** Absolute path to the uploads root on disk. */
    private readonly root: string,
    /** Public base URL prefix for served files, e.g. `/media`. */
    public readonly publicBase = '/media',
  ) {}

  async save(input: {
    organizationId: string;
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
    uploadedById?: string | null;
  }): Promise<MediaUploadResult> {
    const id = randomUUID();
    const orgDir = path.join(this.root, input.organizationId);
    const targetPath = path.join(orgDir, `${id}`);
    await fs.mkdir(orgDir, { recursive: true });
    await fs.writeFile(targetPath, input.buffer);

    const relativePath = path.posix.join(input.organizationId, id);
    await this.prisma.mediaFile.create({
      data: {
        organizationId: input.organizationId,
        relativePath,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        originalName: input.originalName ?? null,
        uploadedById: input.uploadedById ?? null,
      },
    });

    return {
      id,
      publicUrl: `${this.publicBase}/${relativePath}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    };
  }

  /** Resolve a stored relative path to an absolute on-disk file. */
  async resolve(relativePath: string): Promise<string | null> {
    const candidate = path.resolve(this.root, relativePath);
    if (!candidate.startsWith(path.resolve(this.root))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid media path');
    }
    try {
      const stat = await fs.stat(candidate);
      return stat.isFile() ? candidate : null;
    } catch {
      return null;
    }
  }

  /** Absolute path to serve a file statically from disk. */
  static diskPathFor(relativePath: string, root: string): string {
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(path.resolve(root))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid media path');
    }
    return candidate;
  }
}
