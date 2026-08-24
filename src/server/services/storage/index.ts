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
 * Supabase Storage, over its REST endpoints.
 *
 * Not the SDK. Three operations against three documented URLs did not justify
 * another dependency in the supply chain of an app that handles payments, and
 * `@supabase/storage-js` deals in Blobs where this interface deals in Buffers,
 * so the SDK would have bought a conversion rather than saved one.
 *
 * Authenticated with the SERVICE-ROLE key, which bypasses row-level security.
 * That is deliberate and it is safe here for one reason: nothing reaches this
 * driver un-authorised. Ownership is settled by the calling code long before a
 * storage key is resolved, and the bucket is private, so there is no path from
 * a browser to an object. The key is server-only and has no `NEXT_PUBLIC_`
 * twin — in Next.js that prefix is the difference between a secret and a
 * published one.
 */
class SupabaseStorageDriver implements StorageDriver {
  private config() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
          "Set both, or use STORAGE_DRIVER=local for development.",
      );
    }
    return { url: url.replace(/\/+$/, ""), key, bucket: env.SUPABASE_STORAGE_BUCKET };
  }

  /**
   * The object's URL.
   *
   * Each path segment is encoded separately: the slashes in a key like
   * `projects/<id>/<uuid>.docx` are part of the object's name and must survive
   * as slashes, while anything inside a segment must not be able to alter the
   * path it sits in.
   */
  private endpoint(key: string): string {
    const { url, bucket } = this.config();
    const path = key.split("/").map(encodeURIComponent).join("/");
    return `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
  }

  private headers(): Record<string, string> {
    const { key } = this.config();
    // Both. The gateway routes on `apikey` and Storage authorises on the
    // bearer token; sending one without the other fails in a way that reads
    // like a permissions problem rather than a missing header.
    return { apikey: key, Authorization: `Bearer ${key}` };
  }

  /** Turns a failed response into an error that says which operation failed. */
  private async fail(what: string, key: string, response: Response): Promise<never> {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Supabase Storage ${what} failed for "${key}" (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await fetch(this.endpoint(key), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": contentType || "application/octet-stream",
        // Keys carry a UUID, so a collision means a retry of the same write
        // rather than two different files. Failing that with "already exists"
        // would turn a harmless repeat into a lost upload.
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
    });
    if (!response.ok) await this.fail("upload", key, response);
  }

  async get(key: string): Promise<Buffer> {
    const response = await fetch(this.endpoint(key), { headers: this.headers() });
    if (!response.ok) await this.fail("download", key, response);
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(this.endpoint(key), {
      method: "DELETE",
      headers: this.headers(),
    });
    // Already gone is the outcome asked for. The local driver uses
    // `rm --force` for the same reason.
    if (!response.ok && response.status !== 404) await this.fail("delete", key, response);
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

function selectDriver(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return new LocalDiskDriver();
    case "supabase":
      return new SupabaseStorageDriver();
    default:
      return new UnimplementedDriver(env.STORAGE_DRIVER);
  }
}

export const storage: StorageDriver = selectDriver();

/** Storage keys are generated, never derived from the user-supplied filename. */
export function buildStorageKey(projectId: string, extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9.]/gi, "").slice(0, 10);
  return path.posix.join("projects", projectId, `${randomUUID()}${safeExt}`);
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
