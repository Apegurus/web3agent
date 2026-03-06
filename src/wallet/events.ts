import { EventEmitter } from "node:events";
import type { WalletState } from "../types/wallet.js";

export interface WalletEvents {
  "wallet-changed": (state: WalletState) => void;
}

class WalletEventEmitter extends EventEmitter {
  override emit(event: "wallet-changed", state: WalletState): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  override on(event: "wallet-changed", listener: (state: WalletState) => void): this;
  override on(
    event: string | symbol,
    // biome-ignore lint/suspicious/noExplicitAny: EventEmitter compatibility requires any
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}

export const walletEvents = new WalletEventEmitter();
