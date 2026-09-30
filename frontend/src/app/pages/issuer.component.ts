import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { CertificateWorkflowService } from '../services/certificate-workflow.service';
import { createIssuerController } from '../../../issuer.js';

@Component({ selector: 'app-issuer', templateUrl: './issuer.component.html' })
export class IssuerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly workflows = inject(CertificateWorkflowService);
  private readonly destroyRef = inject(DestroyRef);
  page?: ReturnType<typeof createIssuerController>;
  readonly issuanceMode = signal<'pdf' | 'raw' | null>(null);
  readonly rawMode = signal<'single' | 'bulk'>('single');

  constructor() {
    afterNextRender(() => {
      const session = this.workflows.create('issuer', this.host.nativeElement);
      this.page = session.controller;
      this.destroyRef.onDestroy(session.destroy);
      session.initialize().catch(error => this.page && console.error('Issuer initialization failed', error));
    });
  }
}
