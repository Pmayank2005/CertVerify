declare const config: {
  CONTRACT_ADDRESS: string;
  RPC_URL: string;
  CHAIN_ID: number;
  NETWORK_NAME: string;
  DEPLOYMENT_FILE: string;
  loadDeployment(): Promise<void>;
};

export = config;
