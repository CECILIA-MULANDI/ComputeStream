import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PropsWithChildren } from "react";
import { Network } from "@aptos-labs/ts-sdk";

export const WalletProvider = ({ children }: PropsWithChildren) => {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: Network.CUSTOM,
        fullNode: "https://testnet.movementnetwork.xyz/v1",
        indexer: "https://testnet.movementnetwork.xyz/v1/graphql",
        aptosConnectDappId: "computestream-dapp",
      }}
      onError={(error) => {
        console.error("Wallet adapter error:", error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};

