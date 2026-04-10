import { createSDKInvoker } from "./shared.js";
import type {
  CcxtAccountSummary,
  CcxtExchangeDescription,
  CcxtExchangeSummary,
  CcxtInvocationResult,
  CcxtPrivateReadInput,
  CcxtPrivateWriteInput,
  CcxtPublicCallInput,
  DescribeCcxtExchangeInput,
  ListCcxtAccountsInput,
  ListCcxtExchangesInput,
} from "./types.js";

export const listCcxtExchanges = createSDKInvoker<ListCcxtExchangesInput, CcxtExchangeSummary[]>(
  "ccxt_list_exchanges"
);
export const describeCcxtExchange = createSDKInvoker<
  DescribeCcxtExchangeInput,
  CcxtExchangeDescription
>("ccxt_describe_exchange");
export const listCcxtAccounts = createSDKInvoker<ListCcxtAccountsInput, CcxtAccountSummary[]>(
  "ccxt_list_accounts"
);
export const ccxtPublicCall = createSDKInvoker<CcxtPublicCallInput, CcxtInvocationResult>(
  "ccxt_public_call"
);
export const ccxtPrivateRead = createSDKInvoker<CcxtPrivateReadInput, CcxtInvocationResult>(
  "ccxt_private_read"
);
export const ccxtPrivateWrite = createSDKInvoker<CcxtPrivateWriteInput, CcxtInvocationResult>(
  "ccxt_private_write"
);
