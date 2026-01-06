import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PropsWithChildren } from "react";
import { Network } from "@aptos-labs/ts-sdk";

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const wallets = [
    // Add plugins for non AIP-62 compliant wallets here if needed
  ];

  return (
    <AptosWalletAdapterProvider
      plugins={wallets}
      autoConnect={true}
      dappConfig={{
        network: Network.TESTNET,
        aptosConnectDappId: "computestream-dapp"
      }}
      optInWallets={["Petra", "Razor", "Nightly", "Pontem", "Martian"]}
      onError={(error) => {
        console.error("Wallet adapter error:", error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};

