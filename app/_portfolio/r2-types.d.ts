// 项目里没有安装 @cloudflare/workers-types，这里只声明用到的 R2 接口（与 Workers 运行时一致）。
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
declare module "cloudflare:email" {
  export class EmailMessage { constructor(from: string, to: string, raw: string) }
}

interface R2HTTPMetadata { contentType?: string; cacheControl?: string }
interface R2Object { key: string; size: number; etag: string; httpEtag: string; uploaded: Date; writeHttpMetadata(headers: Headers): void }
interface R2ObjectBody extends R2Object { body: ReadableStream; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; json<T = unknown>(): Promise<T> }
interface R2UploadedPart { partNumber: number; etag: string }
interface R2MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string): Promise<R2UploadedPart>;
  complete(parts: R2UploadedPart[]): Promise<R2Object>;
  abort(): Promise<void>;
}
interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string | null, options?: { httpMetadata?: R2HTTPMetadata; onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string; delimiter?: string }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string; delimitedPrefixes: string[] }>;
  createMultipartUpload(key: string, options?: { httpMetadata?: R2HTTPMetadata }): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}
