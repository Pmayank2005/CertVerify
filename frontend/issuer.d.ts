export interface IssuerController {
  [key: string]: (...args: any[]) => any;
  initialize(): Promise<void>;
  onAccountChanged(): Promise<void>;
}

export function createIssuerController(client: any, scope: any, libraries: any): IssuerController;
