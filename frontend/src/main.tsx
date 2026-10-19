import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles.css";
import App from "./App";
import { mezoTestnet, RPC_URL } from "./config";

// WalletConnect needs a real Cloud project id. Without one (e.g. local demo / judge machine)
// the app falls back to injected wallets only, so the console stays clean and no 403s appear.
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
const hasWalletConnect = Boolean(wcProjectId && /^[a-f0-9]{32}$/i.test(wcProjectId) && !/^0+$/.test(wcProjectId));

const wagmiConfig = hasWalletConnect
  ? getDefaultConfig({
      appName: "MezoGig",
      projectId: wcProjectId as string,
      chains: [mezoTestnet],
      transports: { [mezoTestnet.id]: http(RPC_URL) },
      ssr: false,
    })
  : createConfig({
      chains: [mezoTestnet],
      transports: { [mezoTestnet.id]: http(RPC_URL) },
      connectors: [injected()],
      ssr: false,
    });

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="en-US"
          theme={darkTheme({ accentColor: "#00b36b", accentColorForeground: "#04130c" })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
