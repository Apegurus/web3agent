# PR #20 Consolidated Review: OWS Wallet Backend Integration

## Outcome

**Recommendation: hardening implemented; merge after full verification passes.**

The original consolidated review requested changes because it found several wallet-correctness and API-contract issues that were unsafe for real-money wallet handling. This report has been updated after the production-hardening pass: the lifecycle split, secret-exposure defaults, mnemonic derivation, replacement/migration safety, wallet-info contract, and documentation findings are now resolved or explicitly accepted as policy.

Deep-search follow-up changed the framing of the most important lifecycle issue: OWS has a durable `deleteWallet()` primitive, but no native lock/unlock primitive. Production-safe wallet UX should therefore avoid making `wallet_deactivate` an accidental irreversible delete. Instead, the product API should explicitly distinguish session deactivation / read-only mode from permanent wallet removal.

## Context

- PR: <https://github.com/Apegurus/web3agent/pull/20>
- Base: `develop`
- Head: `feat/ows-wallet-integration`
- Scope: Adds Open Wallet Standard (OWS) backend, legacy fallback, runtime backend selector, legacy `wallet.json` migration, `wallet_info` MCP tool, and `getWalletInfo()` SDK function.

## Strengths

- The backend abstraction is cleanly decomposed into `WalletBackend`, `LegacyWalletBackend`, `OwsWalletBackend`, and `backend-selector.ts`.
- Runtime startup selects a wallet backend before wallet initialization, reducing split-brain behavior between legacy and OWS paths.
- Migration avoids deleting the original legacy wallet until after OWS import, metadata write, and backup copy complete.
- The PR adds meaningful tests around OWS activation, migration failure paths, wallet info reporting, passphrase validation, and secret-log hygiene.
- The two-layer API requirement is honored for the new wallet surfaces: MCP tools and SDK/root exports now cover both `wallet_info`/`getWalletInfo()` and `wallet_delete`/`deleteWallet()`.

## Must Fix Before Merge

### 1. OWS deactivation is not durable

**Status:** Resolved in this hardening pass.

**Severity:** high  
**Files:** `src/wallet/ows-backend.ts`, `src/tools/register.ts`, `WEB3_CONTEXT.md`, `SECURITY.md`

`OwsWalletBackend.deactivate()` only switches runtime state to a read-only ephemeral account. It does not remove the persisted `web3agent-active` OWS wallet or metadata. On the next startup, `initialize()` reloads the persisted OWS wallet.

This conflicts with public docs and tool descriptions that say `wallet_deactivate` deletes persisted key material. Deep-search evidence also showed that OWS does not expose a lock/unlock state machine; decryption happens per operation, and the available destructive primitive is `deleteWallet()`. External wallet UX patterns consistently distinguish lock/logout/unload from remove/delete/forget.

**Fix direction:** Do not silently turn `wallet_deactivate` into unrecoverable deletion. Split the lifecycle semantics explicitly:

- `wallet_deactivate` / `wallet_lock` / `wallet_pause`: session-local switch to read-only mode, with docs stating that an encrypted OWS wallet remains on disk and may reload later.
- `wallet_delete` / `wallet_forget`: separate confirmation-gated destructive operation that calls OWS `deleteWallet()` or legacy file deletion, with explicit backup warnings.

If backward compatibility requires keeping the existing tool name, update the description, confirmation copy, schema/docs, and tests so its semantics are unambiguous.

**Resolution:** `wallet_deactivate` is now session-local/read-only only, and `wallet_delete` is the separate confirmation-gated destructive operation. Legacy and OWS persistence both implement separate deactivate vs delete paths, with MCP tool, SDK/root export, and docs updated.

### 2. Mnemonic `accountIndex=0,addressIndex>0` can report/sign with mismatched addresses

**Status:** Resolved in this hardening pass.

**Severity:** high  
**File:** `src/wallet/ows-backend.ts`

`resolveAccount()` manually derives mnemonic accounts only when `accountIndex !== 0`. For `accountIndex === 0`, it calls `owsToViemAccount(walletName, { index: addressIndex })`.

The OWS viem adapter was checked externally: it returns `address` from stored `wallet.accounts`, while `options.index` is passed into signing methods. That means non-zero `addressIndex` can expose one address but sign with another derivation index.

**Fix direction:** Avoid `owsToViemAccount()` for any non-default mnemonic derivation. Manually derive when either `accountIndex` or `addressIndex` is non-zero, or otherwise ensure returned address and signing key come from the same derivation path.

**Resolution:** Added parity tests for `(accountIndex,addressIndex)` pairs `(0,0)`, `(0,1)`, `(1,0)`, and `(1,2)`. Non-default mnemonic derivation now manually derives from the mnemonic export so reported address and signing key match viem.

### 3. `replaceWallet()` deletes the current vault entry before replacement is safely committed

**Status:** Resolved in this hardening pass.

**Severity:** high  
**File:** `src/wallet/ows-backend.ts`

`replaceWallet()` deletes the existing wallet before running the new import and metadata write. If import or metadata persistence fails, the previous working OWS wallet may already be gone.

**Fix direction:** Stage replacement transactionally: import under a temporary name, verify the new wallet and metadata, then swap/delete the old active wallet only after the new state is safely committed.

**Resolution:** Replacement now uses OWS `renameWallet()` to preserve the old active wallet under a backup name, creates the replacement, writes metadata, then deletes the backup. On failure it removes partial active material and restores the backup. Regression coverage verifies the old wallet remains usable when replacement import fails.

### 4. `wallet_info` read-only address contract is inconsistent

**Status:** Resolved in this hardening pass.

**Severity:** high  
**Files:** `src/api/schemas/wallet.ts`, `src/tools/wallet/index.ts`, `src/wallet/ows-backend.ts`, `src/wallet/persistence-internal.ts`

`walletInfoOutputSchema` says read-only mode returns `address: null`, but both legacy and OWS read-only states can include an ephemeral address, and `walletInfo()` forwards `state.address ?? null`.

**Fix direction:** Either normalize `wallet_info.state.address` to `null` whenever `mode === "read-only"`, or update the schema/docs/tests to clearly state that read-only mode exposes an ephemeral address.

**Resolution:** The accepted policy is that read-only mode may expose an ephemeral, non-persistent address. `walletInfoOutputSchema`, tests, and docs now state that contract, and `wallet_info` reports the selected backend's effective OWS vault path instead of a hardcoded default.

## Should Fix Before Merge / Near-Term

### 5. Corrupted legacy `wallet.json` can abort OWS migration startup

**Status:** Resolved in this hardening pass.

**Severity:** low / policy  
**File:** `src/wallet/migration.ts`

`readLegacyWallet()` uses unguarded `JSON.parse`. A malformed legacy `wallet.json` can throw during OWS startup migration, whereas the legacy loader catches corruption and falls back safely.

The user clarified that migration is a nice-to-have because the package is not widely used yet. That makes this less urgent than signing/lifecycle correctness, but the fix is still cheap and improves startup resilience.

**Fix direction:** Catch parse/validation errors and treat malformed legacy wallet files as non-migratable, or return a structured migration error that does not leak secret material. This can be done before merge if already touching migration code, but it should not outrank the real-money signing/lifecycle blockers.

**Resolution:** Migration now catches JSON parse failures, logs a generic non-secret message, returns `false`, and leaves the legacy file untouched.

### 6. Migration can leave plaintext secrets in `wallet.json.migrated`

**Status:** Accepted policy decision with docs and runtime guidance.

**Severity:** medium / policy  
**File:** `src/wallet/migration.ts`

Migration copies the plaintext legacy wallet to `wallet.json.migrated` and leaves it indefinitely. This may be intentional rollback behavior, but it weakens the simple “encrypted-at-rest” story for migrated users.

The user clarified that migration is not broadly applicable yet, so this is not a launch blocker by itself. It remains a security-policy issue because a user who does migrate has plaintext key material retained after the encrypted OWS import succeeds.

**Fix direction:** Treat this as an explicit product/security policy decision. At minimum, document the retained plaintext backup clearly and give cleanup guidance. A stronger follow-up is to add an explicit cleanup command or option after the user verifies the OWS wallet works.

**Resolution:** The plaintext backup remains intentional rollback behavior. Migration now logs explicit cleanup guidance after success, and `SECURITY.md`/`CLAUDE.md` document that users should delete `wallet.json.migrated` after verifying OWS access.

### 7. Metadata-write failure can leave stale OWS vault material

**Status:** Resolved in this hardening pass.

**Severity:** medium  
**File:** `src/wallet/migration.ts`

Migration imports into the OWS vault before writing metadata. If metadata writing fails, the legacy file remains, but the OWS vault may already contain `web3agent-active` without metadata. On the next startup, existing OWS material wins and metadata fallback may lose mnemonic index information.

**Fix direction:** Import under a temporary wallet name and only promote after metadata succeeds, or delete the imported OWS wallet on metadata-write failure.

**Resolution:** Migration now creates the vault directory before import and deletes the promoted `web3agent-active` OWS wallet if metadata writing fails, while preserving legacy `wallet.json` and avoiding `.migrated` creation.

### 8. OWS Windows/platform support needs documentation

**Status:** Resolved in this hardening pass.

**Severity:** medium  
**Files:** `pnpm-lock.yaml`, `CLAUDE.md`

`@open-wallet-standard/core@1.3.2` publishes native packages for macOS and Linux only. No Windows native package is present. Windows should therefore be documented as legacy-fallback unless OWS adds support.

**Fix direction:** Document the OWS platform matrix and expected Windows fallback behavior.

**Resolution:** `detectOwsAvailability()` now returns false on Windows, with regression coverage in `tests/wallet/backend-selector.test.ts`. `SECURITY.md` and `CLAUDE.md` document macOS/Linux OWS support and Windows legacy fallback.

## Low-Severity Cleanup

### 9. Documentation metadata filename mismatch

**Status:** Resolved in this hardening pass.

**Severity:** low  
**Files:** `CLAUDE.md`, `src/wallet/ows-constants.ts`

Earlier docs said OWS metadata was stored in `web3agent-metadata.json`, but the constant is `wallet-metadata.json`.

**Fix direction:** Update docs to match `OWS_METADATA_FILE_NAME`.

**Resolution:** Docs now use `wallet-metadata.json`, matching `OWS_METADATA_FILE_NAME`.

### 10. `wallet_info` hardcodes the OWS vault path

**Status:** Resolved in this hardening pass.

**Severity:** low  
**File:** `src/tools/wallet/index.ts`

`walletInfo()` returns `"~/.web3agent/ows/"` for OWS rather than the backend’s actual configured `vaultPath`.

**Fix direction:** Expose effective vault path through backend metadata, or rename the field to indicate it is the default path rather than the resolved path.

**Resolution:** `WalletBackendInfo` now exposes optional `vaultPath`; OWS reports its configured vault path; `wallet_info` returns the effective selected backend path.

### 11. Duplicate helper logic

**Status:** Resolved in this hardening pass.

**Severity:** low  
**Files:** `src/wallet/backend-selector.ts`, `src/tools/wallet/index.ts`, `src/wallet/migration.ts`, `src/wallet/ows-backend.ts`

`hasConfiguredOwsPassphrase`, `normalizePrivateKey`, and `isRecord` are duplicated across wallet modules.

**Fix direction:** Extract shared wallet helpers into one internal module and import them where needed.

**Resolution:** Shared wallet helpers were extracted to `src/wallet/wallet-utils.ts` and reused across backend selector, tools, migration, and OWS backend code.

### 12. Unused `WalletCredential` export

**Status:** Resolved in this hardening pass.

**Severity:** low  
**File:** `src/wallet/backend.ts`

`WalletCredential` is exported but unused.

**Fix direction:** Remove it unless it is intended to become part of the public backend abstraction.

**Resolution:** The unused export was removed from the backend contract.

### 13. Subprocess key export should be documented

**Status:** Resolved in this hardening pass.

**Severity:** info  
**File:** `src/wallet/ows-backend.ts`

`getKeyForSubprocess()` decrypts and returns raw private key material for GOAT subprocess compatibility. This is not a regression from legacy behavior, but it should be documented as a trust-boundary exception to “encrypted-at-rest.”

**Fix direction:** Add a `SECURITY.md` or `CLAUDE.md` note explaining when plaintext keys are exported to subprocess flows and why. Because this system handles real money, this should be fixed before public release even if it does not block this PR on correctness.

**Resolution:** `SECURITY.md` and `CLAUDE.md` document the raw-key subprocess export trust-boundary exception. The warning now emits only when an actual key is returned.

### 14. Non-zero mnemonic `accountIndex` decrypts mnemonic during load

**Status:** Accepted policy decision with docs.

**Severity:** info / low  
**File:** `src/wallet/ows-backend.ts`

For `accountIndex !== 0`, `resolveAccount()` exports/decrypts the mnemonic on load to manually derive the account. This may be acceptable, but it should be understood as a cost of supporting non-default account indices with the current OWS API.

**Fix direction:** Document this behavior or cache the derived account/key carefully if repeated loads become a concern.

**Resolution:** Non-default derivation is kept for correctness and documented as a trusted-host/in-process decrypt/export behavior in `SECURITY.md` and `CLAUDE.md`.

### 15. Raw-key warning is emitted before extraction success is known

**Status:** Resolved in this hardening pass.

**Severity:** low  
**File:** `src/wallet/ows-backend.ts`

`getKeyForSubprocess()` logs the raw-key warning before confirming that parsing/extraction will actually return a key.

**Fix direction:** Emit the warning after successful key extraction.

**Resolution:** The raw-key warning now runs only immediately before returning a normalized private key. Regression coverage verifies no warning is emitted when export/parsing yields no secp256k1 key.

## Findings Not Carried Forward

- `walletInfoSchema = z.object({})` lacking `.describe()` — not a current issue because schema-quality checks fields, and this schema has none.
- Unawaited OWS import calls — not proven to be a bug unless OWS APIs are actually async.
- Generic migration TOCTOU — weak as stated; `copyFile(..., COPYFILE_EXCL)` throws on conflict.
- `ows-backend` tsup entry not package-exported — intentional internal lazy-import artifact.
- `hasPersistedWalletKey()` OWS-unaware — prior spec context says this is intentionally legacy-only for stale key routing.
- `isWalletBackend` guard being “heavy” — optional polish, not worth carrying as a finding.
- `OWS_FORCE_LEGACY` warning wording — harmless operator-message polish, not review-worthy unless you are already touching that area.

## Final Recommendation

The original request-changes recommendation has been addressed by the production-hardening pass. Merge should be gated on the final verification suite (`pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`) passing cleanly.

Final product decisions reflected in the implementation:

1. Existing MCP secret tool names remain discoverable, but secret-returning/secret-accepting behavior is disabled by default.
2. `WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1` restores legacy agent-visible secret behavior for users who explicitly accept that inference-context risk.
3. Local CLI generation/import stores secrets immediately in OWS and displays them only through an interactive TTY; `--json` secret output is refused.
4. `wallet_info` may expose a read-only ephemeral address, and schema/docs now define that address as non-persistent/non-funded.
5. Migration plaintext backup behavior is retained for rollback safety, with runtime and docs cleanup guidance.
