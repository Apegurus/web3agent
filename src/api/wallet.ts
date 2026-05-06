import { createSDKInvoker } from "./shared.js";
import type {
  RuntimeBoundOptions,
  WalletDeleteInput,
  WalletDeleteResult,
  WalletInfoInput,
  WalletInfoResult,
} from "./types.js";

const invokeWalletInfo = createSDKInvoker<WalletInfoInput, WalletInfoResult>("wallet_info");
const invokeWalletDelete = createSDKInvoker<WalletDeleteInput, WalletDeleteResult>("wallet_delete");

export function getWalletInfo(
  params: WalletInfoInput = {},
  options?: RuntimeBoundOptions
): Promise<WalletInfoResult> {
  return invokeWalletInfo(params, options);
}

export function deleteWallet(
  params: WalletDeleteInput = {},
  options?: RuntimeBoundOptions
): Promise<WalletDeleteResult> {
  return invokeWalletDelete(params, options);
}
