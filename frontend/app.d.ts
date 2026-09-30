export interface CertificateClient {
  [key: string]: any;
  state: any;
  hooks: Record<string, (() => unknown) | undefined>;
}

export function createCertificateClient(options: Record<string, any>): CertificateClient;
