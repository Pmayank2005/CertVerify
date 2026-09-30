import { inject, Injectable } from '@angular/core';
import { ethers } from 'ethers';
import * as PDFLib from 'pdf-lib';
import JSZip from 'jszip';
import CertificateWorkflows from '../../../certificate-workflows.js';
import { createIssuerController } from '../../../issuer.js';
import { createVerifierController } from '../../../verifier.js';
import { WalletService } from './wallet.service';
import { PageScope } from './page-scope';

type ControllerMap = {
  issuer: ReturnType<typeof createIssuerController>;
  verifier: ReturnType<typeof createVerifierController>;
};
interface WorkflowSession<T> { controller: T; initialize(): Promise<void>; destroy(): void; }

@Injectable({ providedIn: 'root' })
export class CertificateWorkflowService {
  private readonly wallet = inject(WalletService);
  create<K extends keyof ControllerMap>(kind: K, host: HTMLElement): WorkflowSession<ControllerMap[K]> {
    const scope = new PageScope(host);
    // Scope banners and DOM lookups so pending work cannot modify another route.
    const client = Object.create(this.wallet.client);
    client.showBanner = (message: string) => {
      const banner = scope.get('banner');
      banner.textContent = message;
      banner.classList.add('show');
    };
    client.hideBanner = () => scope.get('banner').classList.remove('show');
    const factory = kind === 'issuer' ? createIssuerController : createVerifierController;
    const controller = factory(client, scope, { ethers, PDFLib, JSZip, CertificateWorkflows });
    const hooks = this.wallet.client.hooks;
    const refresh = () => scope.disposed ? undefined : controller.onAccountChanged();
    hooks.onAccountChanged = refresh;
    if (kind === 'issuer') hooks.onWalletConnected = refresh;
    return {
      controller: controller as ControllerMap[K],
      initialize: async () => {
        await this.wallet.ready;
        if (!scope.disposed) await controller.initialize();
      },
      destroy: () => {
        scope.destroy();
        if (hooks.onAccountChanged === refresh) delete hooks.onAccountChanged;
        if (hooks.onWalletConnected === refresh) delete hooks.onWalletConnected;
      },
    };
  }
}
