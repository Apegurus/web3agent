import { createSDKInvoker } from "./shared.js";
import type { RuntimeBoundOptions, WalletInfoInput, WalletInfoResult } from "./types.js";

const invokeWalletInfo = createSDKInvoker<WalletInfoInput, WalletInfoResult>("wallet_info");

export function getWalletInfo(
  params: WalletInfoInput = {},
  options?: RuntimeBoundOptions
): Promise<WalletInfoResult> {
  return invokeWalletInfo(params, options);
}
