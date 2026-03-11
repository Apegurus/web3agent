# Security

## Wallet Key Storage

web3agent stores wallet credentials in `~/.web3agent/wallet.json` with file permissions `0600` (owner read/write only). This follows the same model as `~/.ssh/id_rsa` — plaintext protected by filesystem permissions, not encryption.

**Startup resolution order:**
1. `PRIVATE_KEY` env var (takes precedence — CI/CD override)
2. `MNEMONIC` env var
3. `~/.web3agent/wallet.json` (loaded if file exists)
4. Ephemeral read-only mode (fresh key per session, never persisted)

The `wallet_activate` tool writes credentials atomically (temp file, fsync, rename) to prevent partial writes. `wallet_deactivate` deletes the file and reverts to read-only mode.

## Write Confirmation

All state-changing operations (swaps, bridges, transfers, wallet activation/deactivation) are queued by default. The agent must call `transaction_confirm(id)` to execute.

- Pending operations are stored in `~/.web3agent/pending-ops.json` (mode 0600)
- Operations expire after 30 minutes (configurable via `CONFIRM_TTL_MINUTES`)
- Queue is wallet-bound: switching wallets clears pending operations from the previous wallet
- Disable with `CONFIRM_WRITES=false` env var or `wallet_set_confirmation(false)` at runtime

## Audit Log

Confirmed, denied, and expired operations are logged to `~/.web3agent/audit.log` for post-hoc review.

## Private Key Handling

- Private keys are never logged to stderr or included in MCP tool responses (except `wallet_generate` which returns the key once by design)
- The EVM MCP subprocess receives the active private key via environment variables — it is not stored on disk by the subprocess
- Ephemeral keys (generated for read-only mode) are never persisted or returned to the user

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories at https://github.com/apegurus/web3agent/security/advisories/new.

Do not open public issues for security vulnerabilities.
