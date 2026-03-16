import { estimateTokenUsd } from "../tokens/pricing.js";
import { lookupTokenByAddress } from "../tokens/registry.js";

const USD_FIELD_NAMES = ["amountUsd", "amount_usd", "estimatedUsd"];

export async function extractEstimatedUsd(args: Record<string, unknown>): Promise<number> {
	// 1. Check explicit USD fields
	for (const key of USD_FIELD_NAMES) {
		const val = args[key];
		if (typeof val === "number" && val > 0) return val;
		if (typeof val === "string") {
			const parsed = Number(val);
			if (!Number.isNaN(parsed) && parsed > 0) return parsed;
		}
	}

	// 2. Try fromToken + fromAmount + chainId price lookup
	const fromToken = args.fromToken;
	const fromAmount = args.fromAmount;
	const chainId = args.chainId;
	if (
		typeof fromToken === "string" &&
		typeof fromAmount === "string" &&
		typeof chainId === "number"
	) {
		const entry = lookupTokenByAddress(fromToken, chainId);
		const decimals =
			entry?.decimals ?? (typeof args.fromDecimals === "number" ? args.fromDecimals : null);
		if (decimals !== null) {
			const usd = await estimateTokenUsd(fromToken, chainId, fromAmount, decimals);
			return usd ?? 0;
		}
	}

	return 0;
}
