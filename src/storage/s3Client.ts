import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export interface UploadResult {
  name: string;
  type: string;
  size: number;
  key: string;
  url: string;
}

export class S3Client {
  private config: S3Config;

  constructor(customConfig?: Partial<S3Config>) {
    this.config = {
      endpoint: process.env.S3_ENDPOINT || customConfig?.endpoint || 'http://127.0.0.1:9000',
      region: process.env.S3_REGION || customConfig?.region || 'us-east-1',
      bucket: process.env.S3_BUCKET || customConfig?.bucket || 'git-chat-media',
      accessKey: process.env.S3_ACCESS_KEY || customConfig?.accessKey || 'minioadmin',
      secretKey: process.env.S3_SECRET_KEY || customConfig?.secretKey || 'minioadminpassword',
    };
  }

  public getConfig(): S3Config {
    return { ...this.config };
  }

  /**
   * Generates AWS Signature Version 4 Authorization header for S3 REST API
   */
  private signV4(method: string, uriPath: string, headers: Record<string, string>, payloadHash: string): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    headers['x-amz-date'] = amzDate;
    headers['x-amz-content-sha256'] = payloadHash;

    const endpointUrl = new URL(this.config.endpoint);
    headers['host'] = endpointUrl.host;

    // Canonical headers
    const headerKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
    const canonicalHeaders = headerKeys.map(k => `${k}:${headers[k].trim()}\n`).join('');
    const signedHeaders = headerKeys.join(';');

    // Canonical Request
    const canonicalUri = encodeURI(uriPath);
    const canonicalRequest = [
      method,
      canonicalUri,
      '', // canonical query string
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    // String to Sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash
    ].join('\n');

    // Signature calculation
    const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['Authorization'] = `${algorithm} Credential=${this.config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
  }

  /**
   * Uploads a media buffer/file to the S3 bucket
   */
  public async uploadObject(filename: string, mimeType: string, data: Buffer): Promise<UploadResult> {
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
    const cleanBase = filename.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
    const key = `attachments/${Date.now()}_${cleanBase}_${sha256.slice(0, 12)}.${ext}`;

    const uriPath = `/${this.config.bucket}/${key}`;
    const payloadHash = sha256;

    const headers: Record<string, string> = {
      'content-type': mimeType || 'application/octet-stream',
      'content-length': String(data.length),
    };

    this.signV4('PUT', uriPath, headers, payloadHash);

    const endpointUrl = new URL(this.config.endpoint);
    const isHttps = endpointUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    await new Promise<void>((resolve, reject) => {
      const req = client.request(
        {
          hostname: endpointUrl.hostname,
          port: endpointUrl.port || (isHttps ? 443 : 80),
          path: uriPath,
          method: 'PUT',
          headers,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            let errBody = '';
            res.on('data', chunk => errBody += chunk);
            res.on('end', () => {
              reject(new Error(`S3 PUT failed with status ${res.statusCode}: ${errBody}`));
            });
          }
        }
      );

      req.on('error', reject);
      req.write(data);
      req.end();
    });

    return {
      name: filename,
      type: mimeType || 'application/octet-stream',
      size: data.length,
      key,
      url: `/api/s3/file/${key}`,
    };
  }

  /**
   * Fetches an object buffer and metadata from S3
   */
  public async getObject(key: string): Promise<{ data: Buffer; contentType: string; contentLength: number }> {
    const uriPath = `/${this.config.bucket}/${key}`;
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    const headers: Record<string, string> = {};
    this.signV4('GET', uriPath, headers, payloadHash);

    const endpointUrl = new URL(this.config.endpoint);
    const isHttps = endpointUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: endpointUrl.hostname,
          port: endpointUrl.port || (isHttps ? 443 : 80),
          path: uriPath,
          method: 'GET',
          headers,
        },
        (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            let errBody = '';
            res.on('data', chunk => errBody += chunk);
            res.on('end', () => {
              reject(new Error(`S3 GET failed with status ${res.statusCode}: ${errBody}`));
            });
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const data = Buffer.concat(chunks);
            const contentType = (res.headers['content-type'] as string) || 'application/octet-stream';
            const contentLength = parseInt(res.headers['content-length'] as string, 10) || data.length;
            resolve({ data, contentType, contentLength });
          });
        }
      );

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Health check to test S3 connectivity and bucket presence
   */
  public async checkHealth(): Promise<{ online: boolean; endpoint: string; bucket: string; message?: string }> {
    try {
      const uriPath = `/${this.config.bucket}`;
      const payloadHash = crypto.createHash('sha256').update('').digest('hex');
      const headers: Record<string, string> = {};
      this.signV4('HEAD', uriPath, headers, payloadHash);

      const endpointUrl = new URL(this.config.endpoint);
      const isHttps = endpointUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      return await new Promise((resolve) => {
        const req = client.request(
          {
            hostname: endpointUrl.hostname,
            port: endpointUrl.port || (isHttps ? 443 : 80),
            path: uriPath,
            method: 'HEAD',
            headers,
            timeout: 2000,
          },
          (res) => {
            if (res.statusCode && res.statusCode < 500) {
              resolve({ online: true, endpoint: this.config.endpoint, bucket: this.config.bucket });
            } else {
              resolve({ online: false, endpoint: this.config.endpoint, bucket: this.config.bucket, message: `Status ${res.statusCode}` });
            }
          }
        );
        req.on('error', (err) => {
          resolve({ online: false, endpoint: this.config.endpoint, bucket: this.config.bucket, message: err.message });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({ online: false, endpoint: this.config.endpoint, bucket: this.config.bucket, message: 'Connection timeout' });
        });
        req.end();
      });
    } catch (err: any) {
      return { online: false, endpoint: this.config.endpoint, bucket: this.config.bucket, message: err.message };
    }
  }
}
