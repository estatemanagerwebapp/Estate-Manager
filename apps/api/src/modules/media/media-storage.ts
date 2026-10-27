import { AppError } from '../../lib/errors.js';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Media storage implementations keep the database's relative key stable, so
 * the local development backend and private Cloudflare R2 bucket share URLs.
 */

export interface MediaUploadResult {
  id: string;
  /** Public URL (relative to the API base) for the stored file. */
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredMedia {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaAccess {
  organizationId: string;
  userId: string;
  canManageUsers: boolean;
}

export interface MediaStorage {
  readonly publicBase: string;
  save(input: {
    organizationId: string;
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
    uploadedById?: string | null;
  }): Promise<MediaUploadResult>;
  get(relativePath: string, access: MediaAccess): Promise<StoredMedia | null>;
}

export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly prisma: PrismaClient,
    /** Absolute path to the uploads root on disk. */
    private readonly root: string,
    /** Public base URL prefix for served files, e.g. `/api/v1/media`. */
    public readonly publicBase = '/api/v1/media',
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
    const relativePath = path.posix.join(input.organizationId, id);
    await fs.mkdir(orgDir, { recursive: true });
    await fs.writeFile(targetPath, input.buffer);
    try {
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
    } catch (error) {
      await fs.rm(targetPath, { force: true });
      throw error;
    }

    return {
      id,
      publicUrl: `${this.publicBase}/${relativePath}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    };
  }

  async get(relativePath: string, access: MediaAccess): Promise<StoredMedia | null> {
    const row = await findAuthorizedMediaRecord(this.prisma, this.publicBase, relativePath, access);
    if (!row) return null;
    const candidate = resolveSafePath(this.root, relativePath);
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) return null;
      return {
        buffer: await fs.readFile(candidate),
        mimeType: row.mimeType,
        sizeBytes: stat.size,
      };
    } catch {
      return null;
    }
  }
}

export interface R2MediaStorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBase?: string;
}

/** Private, durable object storage backed by a Cloudflare R2 S3-compatible bucket. */
export class R2MediaStorage implements MediaStorage {
  private readonly client: S3Client;
  readonly publicBase: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: R2MediaStorageOptions,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    this.publicBase = options.publicBase ?? '/api/v1/media';
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucketName, Key: relativePath }),
    );
    await this.prisma.mediaFile.deleteMany({ where: { relativePath } });
  }

  async save(input: {
    organizationId: string;
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
    uploadedById?: string | null;
  }): Promise<MediaUploadResult> {
    const id = randomUUID();
    const relativePath = path.posix.join(input.organizationId, id);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucketName,
        Key: relativePath,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );
    try {
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
    } catch (error) {
      await this.client
        .send(new DeleteObjectCommand({ Bucket: this.options.bucketName, Key: relativePath }))
        .catch(() => undefined);
      throw error;
    }

    return {
      id,
      publicUrl: `${this.publicBase}/${relativePath}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    };
  }

  async get(relativePath: string, access: MediaAccess): Promise<StoredMedia | null> {
    const row = await findAuthorizedMediaRecord(this.prisma, this.publicBase, relativePath, access);
    if (!row) return null;
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucketName, Key: relativePath }),
      );
      if (!object.Body) return null;
      const bytes = await object.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);
      return {
        buffer,
        mimeType: row.mimeType,
        sizeBytes: object.ContentLength ?? buffer.length,
      };
    } catch (error) {
      if (isObjectNotFound(error)) return null;
      throw error;
    }
  }
}

async function findAuthorizedMediaRecord(
  prisma: PrismaClient,
  publicBase: string,
  relativePath: string,
  access: MediaAccess,
) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(relativePath)) return null;
  const row = await prisma.mediaFile.findFirst({
    where: { relativePath, organizationId: access.organizationId },
  });
  if (!row) return null;
  if (access.canManageUsers || row.uploadedById === access.userId) return row;
  const residentOwnsDocument = await prisma.residentOnboarding.findFirst({
    where: {
      organizationId: access.organizationId,
      userId: access.userId,
      idDocumentUrl: `${publicBase}/${relativePath}`,
    },
    select: { id: true },
  });
  return residentOwnsDocument ? row : null;
}

function resolveSafePath(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const candidate = path.resolve(normalizedRoot, relativePath);
  const relative = path.relative(normalizedRoot, candidate);
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid media path');
  }
  return candidate;
}

function isObjectNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
