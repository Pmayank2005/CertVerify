(function (root) {
  function parseChainId(value) {
    if (value === null || value === undefined || value === "") return null;
    const raw = String(value);
    const normalized = raw.startsWith("0x") || raw.startsWith("0X")
      ? Number.parseInt(raw, 16)
      : Number(raw);
    return Number.isFinite(normalized) ? normalized : null;
  }

  function getNetworkState(chainId, expectedChainId) {
    if (chainId === null || chainId === undefined) return "unknown";
    if (expectedChainId === null || expectedChainId === undefined) return "unknown";
    return chainId === expectedChainId ? "correct" : "wrong-network";
  }

  function createWalletSessionManager(options = {}) {
    const ethereum = options.ethereum || root?.ethereum || null;
    const ethersLib = options.ethers || root?.ethers || null;
    const networkName = options.networkName || "Ganache Local";
    const expectedChainId = options.expectedChainId ?? options.chainId ?? null;

    const session = {
      ethereum,
      ethers: ethersLib,
      state: {
        address: null,
        isConnected: false,
        chainId: null,
        networkName,
        networkState: "unknown",
        connectionState: "disconnected",
      },
      listenersAttached: false,
      onStateChange: typeof options.onStateChange === "function" ? options.onStateChange : null,
      getProvider() {
        return this.ethereum || root?.ethereum || null;
      },
      normalizeAddress(address) {
        if (!address) return null;
        if (this.ethers?.utils?.getAddress) {
          return this.ethers.utils.getAddress(address);
        }
        return address;
      },
      hasMetaMask() {
        return !!this.getProvider();
      },
      notify() {
        if (typeof this.onStateChange === "function") {
          this.onStateChange(this.state);
        }
      },
      setChainId(value) {
        this.state.chainId = parseChainId(value);
        this.state.networkState = getNetworkState(this.state.chainId, expectedChainId);
      },
      async connectWallet() {
        const provider = this.getProvider();
        if (!provider) {
          throw new Error(
            "MetaMask is not installed. Install the extension from https://metamask.io, " +
            "add the 'Ganache Local' network (RPC http://127.0.0.1:8545, chain ID 1337), " +
            "and import a Ganache account (see Local_Connection.md)."
          );
        }

        const accounts = await provider.request({ method: "eth_requestAccounts" });
        if (!accounts || accounts.length === 0) {
          session.disconnectWallet();
          return null;
        }

        const address = this.normalizeAddress(accounts[0]);
        const chainIdHex = await provider.request({ method: "eth_chainId" });
        session.state.address = address;
        session.state.isConnected = true;
        session.setChainId(chainIdHex);
        session.state.connectionState = "connected";

        session.attachListeners();
        session.notify();
        return address;
      },
      async disconnectWallet() {
        session.state.address = null;
        session.state.isConnected = false;
        session.state.connectionState = "disconnected";
        session.notify();
        return true;
      },
      handleProviderDisconnect() {
        session.state.address = null;
        session.state.isConnected = false;
        session.state.connectionState = "disconnected";
        session.notify();
      },
      attachListeners() {
        const provider = this.getProvider();
        if (!provider || typeof provider.on !== "function" || session.listenersAttached) {
          return;
        }

        provider.on("accountsChanged", (accounts) => {
          session.handleAccountsChanged(accounts);
        });

        provider.on("chainChanged", (chainIdHex) => {
          session.handleChainChanged(chainIdHex);
        });

        provider.on("disconnect", () => {
          session.handleProviderDisconnect();
        });

        session.listenersAttached = true;
      },
      async restoreWalletSession() {
        const provider = this.getProvider();
        if (!provider || typeof provider.request !== "function") {
          return null;
        }

        try {
          const [accounts, chainIdHex] = await Promise.all([
            provider.request({ method: "eth_accounts" }),
            provider.request({ method: "eth_chainId" }),
          ]);
          session.setChainId(chainIdHex);
          session.state.address = accounts && accounts.length > 0
            ? this.normalizeAddress(accounts[0])
            : null;
          session.state.isConnected = !!session.state.address;
          session.state.connectionState = session.state.isConnected ? "connected" : "disconnected";
          session.attachListeners();
          session.notify();
          return session.state.address;
        } catch (err) {
          console.warn("[wallet-session] restoreWalletSession failed:", err);
          session.state.address = null;
          session.state.isConnected = false;
          session.state.connectionState = "disconnected";
          session.notify();
          return null;
        }
      },
      handleAccountsChanged(accounts) {
        if (!accounts || accounts.length === 0) {
          session.disconnectWallet();
          return null;
        }

        const address = this.normalizeAddress(accounts[0]);

        session.state.address = address;
        session.state.isConnected = true;
        session.state.connectionState = "connected";
        session.notify();
        return address;
      },
      handleChainChanged(chainIdHex) {
        session.setChainId(chainIdHex);
        session.notify();
        return session.state.chainId;
      },
    };

    return session;
  }

  const session = createWalletSessionManager();

  root.CertVerifyWalletSession = session;
  root.createWalletSessionManager = createWalletSessionManager;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createWalletSessionManager, walletSession: session };
  }
})(typeof window !== "undefined" ? window : globalThis);
