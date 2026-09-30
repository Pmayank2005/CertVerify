import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'CertVerify — Blockchain Certificate Verification', loadComponent: () => import('./pages/overview.component').then(m => m.OverviewComponent) },
  { path: 'issuer', title: 'Issuer Portal — CertVerify', loadComponent: () => import('./pages/issuer.component').then(m => m.IssuerComponent) },
  { path: 'verify', title: 'Verify a Certificate — CertVerify', loadComponent: () => import('./pages/verifier.component').then(m => m.VerifierComponent) },
  // Preserve previously issued QR codes and bookmarked page URLs, including query strings.
  { path: 'index.html', redirectTo: '' },
  { path: 'issuer.html', redirectTo: 'issuer' },
  { path: 'verifier.html', redirectTo: 'verify' },
  { path: '**', redirectTo: '' },
];
