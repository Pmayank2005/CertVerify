import { afterNextRender, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { CertificateWorkflowService } from '../services/certificate-workflow.service';
import { createVerifierController } from '../../../verifier.js';

@Component({ selector: 'app-verifier', templateUrl: './verifier.component.html' })
export class VerifierComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly workflows = inject(CertificateWorkflowService);
  private readonly destroyRef = inject(DestroyRef);
  page?: ReturnType<typeof createVerifierController>;

  constructor() {
    afterNextRender(() => {
      const session = this.workflows.create('verifier', this.host.nativeElement);
      this.page = session.controller;
      this.destroyRef.onDestroy(session.destroy);
      session.initialize().catch(error => console.error('Verifier initialization failed', error));
    });
  }
}
