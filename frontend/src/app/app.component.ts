import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { WalletService } from './services/wallet.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly wallet = inject(WalletService);
  readonly router = inject(Router);
  get verifying(): boolean { return this.router.url.startsWith('/verify'); }
  get disconnectedLabel(): string {
    return this.verifying ? 'Public verification' : this.router.url.startsWith('/issuer') ? 'Not connected' : 'Public access';
  }
}
