import { computed, Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';
import { createCertificateClient } from '../../../app.js';
import CONFIG from '../../../config.js';
import CERTIFICATE_REGISTRY_ABI from '../../../abi.js';
import { createWalletSessionManager } from '../../../wallet-session.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

interface WalletSnapshot { address: string | null; chainId: number | null; isConnected: boolean; }

@Injectable({ providedIn: 'root' })
export class WalletService {
  readonly snapshot = signal<WalletSnapshot>({ address: null, chainId: null, isConnected: false });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly connected = computed(() => this.snapshot().isConnected);
  readonly shortAddress = computed(() => this.snapshot().address ? this.client.shorten(this.snapshot().address) : '');
  readonly correctNetwork = computed(() => this.snapshot().chainId === CONFIG.CHAIN_ID);
  readonly wrongNetwork = computed(() => this.snapshot().chainId !== null && !this.correctNetwork());
  readonly networkLabel = computed(() => {
    const id = this.snapshot().chainId;
    return id === null ? '' : `● ${this.correctNetwork() ? CONFIG.NETWORK_NAME : 'Wrong network · Chain'} · ${id}`;
  });
  readonly client = createCertificateClient({
    ethers, CONFIG, CERTIFICATE_REGISTRY_ABI, createWalletSessionManager, QRCode, jsQR,
    onWalletState: (state: WalletSnapshot | undefined) => { if (state) this.snapshot.set({ ...state }); },
    onError: (message: string) => this.error.set(message),
  });
  readonly ready = this.initialize();

  private async initialize(): Promise<void> {
    await CONFIG.loadDeployment();
    await this.client.initWalletSession();
    this.client.createReadonlyContract();
  }

  async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.ready;
      if (this.connected()) await this.client.state.walletSession.disconnectWallet();
      else await this.client.connectWallet();
    } catch (error) {
      this.error.set(this.client.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
