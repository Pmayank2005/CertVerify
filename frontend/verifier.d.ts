export interface VerifierController {
  [key: string]: (...args: any[]) => any;
  initialize(): Promise<void>;
  onAccountChanged(): void;
}

export function createVerifierController(client: any, scope: any, libraries: any): VerifierController;
