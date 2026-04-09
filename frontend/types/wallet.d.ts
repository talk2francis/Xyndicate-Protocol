export {};

declare global {
  interface InjectedWalletProvider {
    request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    on?: (event: string, listener: (...args: any[]) => void) => void;
    removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    isOKExWallet?: boolean;
    isMetaMask?: boolean;
    isRabby?: boolean;
    isZerion?: boolean;
    providers?: InjectedWalletProvider[];
  }

  interface Window {
    okxwallet?: InjectedWalletProvider;
    ethereum?: InjectedWalletProvider;
  }
}
