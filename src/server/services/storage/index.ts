import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

/**
 * Object storage abstraction.
 *
 * The local driver is the default and needs no configuration, which keeps
 * development working out of the box. Swapping in S3 or Supabase Storage is a
 * driver change, not a change to any calling code.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Uploads live outside `public/`, so nothing is ever served unauthenticated. */
class LocalDiskDriver implements StorageDriver {
  /**
   * Resolved lazily at call time, not at module load. The turbopackIgnore hint
   * tells the bundler not to trace this path: the storage directory is runtime
   * configuration, not something to be traced into the deployment bundle.
   */
  private get root(): string {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_LOCAL_DIR);
  }

  /**
   * Resolves a storage key to an absolute path, refusing anything that escapes
   * the storage root. Keys are generated server-side, but this holds even if a
   * caller is ever changed to pass one through.
   */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    const rel = path.relative(this.root, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Refusing to access a path outside the storage root");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/**
 * Not implemented yet. Selecting a driver that cannot work throws at startup
 * rather than silently dropping a student's uploads.
 */
class UnimplementedDriver implements StorageDriver {
  constructor(private readonly name: string) {}
  private fail(): never {
    throw new Error(
      `STORAGE_DRIVER=${this.name} is not implemented yet. Use "local" for development, ` +
        `or implement the ${this.name} driver in src/server/services/storage before deploying.`,
    );
  }
  async put(): Promise<void> {
    this.fail();
  }
  async get(): Promise<Buffer> {
    this.fail();
  }
  async delete(): Promise<void> {
    this.fail();
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === "local" ? new LocalDiskDriver() : new UnimplementedDriver(env.STORAGE_DRIVER);

/** Storage keys are generated, never derived from the user-supplied filename. */
export function buildStorageKey(projectId: string, extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9.]/gi, "").slice(0, 10);
  return path.posix.join("projects", projectId, `${randomUUID()}${safeExt}`);
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
