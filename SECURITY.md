# Security

## Wallet Key Storage

web3agent uses two wallet storage backends:

- **OWS encrypted vault** — preferred on macOS/Linux when `@open-wallet-standard/core` is available and `OWS_PASSPHRASE` is configured. The active wallet is stored as `web3agent-active` under `~/.web3agent/ows` by default, with metadata in `wallet-metadata.json`. The OWS spec requires passphrases to be at least 12 characters; web3agent warns on weak runtime passphrases and the local wallet CLI rejects values below that floor when creating/importing wallet material. Use 16+ mixed characters where possible.
- **Legacy JSON fallback** — used when OWS is unavailable, `OWS_FORCE_LEGACY=1` is set, no OWS passphrase is configured, or the platform is Windows. It stores `~/.web3agent/wallet.json` with file permissions `0600` (owner read/write only). This follows the same model as `~/.ssh/id_rsa` — plaintext protected by filesystem permissions, not encryption.

OWS encrypts wallet material at rest only when that backend is selected. The legacy fallback is plaintext protected by file permissions. OWS is also not a hardware enclave or sandbox: web3agent, MCP tools, and subprocess integrations run in the same trusted host process boundary and can request decrypted/exported material when signing or compatibility requires it.

**Startup resolution order:**

1. `PRIVATE_KEY` env var (takes precedence — CI/CD override)
2. `MNEMONIC` env var
3. `~/.web3agent/wallet.json` (loaded if file exists)
4. Ephemeral read-only mode (fresh key per session, never persisted)

`wallet_deactivate` is session-local: it leaves persisted wallet material intact and reverts the current runtime to read-only ephemeral mode. `wallet_delete` is the destructive operation that permanently removes persisted wallet material and is confirmation-gated.

When a legacy `wallet.json` is migrated into OWS, web3agent copies it to `wallet.json.migrated` before removing the original. That backup is still plaintext. After verifying OWS wallet access, delete `~/.web3agent/wallet.json.migrated` to remove the plaintext backup.

## Keeping secrets out of inference APIs

By default, MCP tools that would expose or accept wallet secrets return `AGENT_VISIBLE_SECRETS_DISABLED` so private keys and mnemonics do not enter an AI agent's inference context. This applies to `wallet_generate`, `wallet_generate_mnemonic`, `wallet_activate` with `privateKey` or `mnemonic`, `wallet_from_mnemonic`, and `wallet_derive_addresses`.

Use the local-only CLI flow when you need to generate or import a wallet without showing the secret to the agent:

```bash
OWS_PASSPHRASE='...' web3agent wallet generate
OWS_PASSPHRASE='...' web3agent wallet generate --mnemonic
OWS_PASSPHRASE='...' web3agent wallet activate --from-file ./secret.txt --type private-key
OWS_PASSPHRASE='...' web3agent wallet activate --from-file ./mnemonic.txt --type mnemonic
```

These commands require OWS, an `OWS_PASSPHRASE` of at least 12 characters, and an interactive TTY. They refuse `--json` for secret display.

If you explicitly accept that wallet secrets may be visible to the agent and inference provider, set `WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1` to restore the legacy MCP behavior.

## Write Confirmation

All state-changing operations (swaps, bridges, transfers, wallet activation/deactivation) are queued by default. The agent must call `transaction_confirm(id)` to execute.

- Pending operations are stored in `~/.web3agent/pending-ops.json` (mode 0600)
- Operations expire after 30 minutes (configurable via `CONFIRM_TTL_MINUTES`)
- Queue is wallet-bound: switching wallets clears pending operations from the previous wallet
- Disable with `CONFIRM_WRITES=false` env var or `wallet_set_confirmation(false)` at runtime

## Confirmation Queue Trust Model

The confirmation queue provides a **temporal pause** for destructive and financial operations — it is **not an authorization boundary**.

Key implications:

- The same MCP session that queued an operation can confirm it immediately. There is no separate authentication step between queue and confirm.
- An AI agent can queue a wallet activation and confirm it in the next tool call without human intervention.
- The queue is a speed bump that gives the host application (Claude Code, Cursor, etc.) an opportunity to surface the pending operation to the user. Whether the user actually sees and approves it depends entirely on the host's UI.

**For production deployments requiring true human-in-the-loop:**

- Configure an out-of-band confirmation mechanism (e.g., Telegram bot, email approval, hardware wallet prompt)
- Do not rely solely on the MCP confirmation queue as a security gate

**Future improvement:** Session-bound confirmations where a different session or credential is required to confirm operations queued by an AI agent.

## Audit Log

Confirmed, denied, and expired operations are logged to `~/.web3agent/audit.log` for post-hoc review.

## Private Key Handling

- Private keys are never logged to stderr or included in MCP tool responses unless agent-visible secret tools are explicitly enabled with `WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1`.
- The EVM MCP subprocess may receive the active private key via environment variables for GOAT/EVM compatibility. This raw-key export is logged as a warning only when a key is actually returned, and it stays inside the trusted host/subprocess boundary.
- Ephemeral keys (generated for read-only mode) are never persisted or returned to the user
- With the OWS backend, non-default mnemonic derivation (`accountIndex` or `addressIndex` other than `0`) may require decrypting/exporting the stored mnemonic inside the trusted host process so web3agent can derive the same address/key as viem. This plaintext material must not be logged or returned through MCP responses.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories at https://github.com/apegurus/web3agent/security/advisories/new.

Do not open public issues for security vulnerabilities.

## Known constraint (v0.5.x): single wallet-using runtime per process

`createRuntime` is safe to call multiple times in one Node process, but only one
wallet-using runtime per process is supported.

- The OWS wallet backend cache in `selectWalletBackend` is keyed by
  `(OWS_PASSPHRASE, OWS_FORCE_LEGACY, vaultPath)`, so two runtimes with
  different OWS env get different backends.
- The legacy backend (`src/wallet/persistence-internal.ts`) uses module-level
  singleton state for the active wallet, so two runtimes that both end up on
  legacy will share that state.

Downstream SDK consumers that spawn multiple wallet-using runtimes in one
process (e.g., trading-arena) MUST currently isolate them into separate
processes. Multi-runtime wallet isolation is tracked for a future release.
