# Solana Bootcamp — Week 6 Capstone
## Treasury Manager

A Solana program that manages SOL and SPL-token deposits and withdrawals, tracks each user's recorded balance, and allows the treasury administrator to pause or resume operations.

> **Network:** Solana Devnet  
> **Program ID:** `2rdinFdEePfmnqxRTpwV355Tz3kAo6vFKsj6kHmahFDL`  
> **Example SPL token:** SP (Singnar Project)  
> **SP mint:** `ApbbwSkPNmL6Fz4cqjbPvkSRVmMHzjcq69pt6BzxD4yq`  
> **SP decimals:** 9

## Project status

The program was built and deployed from Solana Playground. The Playground test run reported **12 passing tests**: eight SOL/admin tests and four SPL-token tests. The client was also run against the deployed Devnet program to display balances and perform an SP deposit and withdrawal.

This README describes the demonstrated Devnet build. It is not an independent security audit.

## Features

### SOL operations

- Initialize a treasury configuration with an administrator.
- Register a user account.
- Deposit SOL into a program-derived-address (PDA) vault.
- Withdraw SOL from the vault, subject to the user's recorded balance and available vault balance.

### SPL-token operations

- Register a separate user record for a selected token mint.
- Initialize an associated token account (ATA) controlled by the treasury vault PDA.
- Deposit SPL tokens into the treasury token vault.
- Withdraw SPL tokens from the treasury token vault, subject to the user's recorded token balance and available vault balance.

For SP, which has nine decimal places:

- `1 SP = 1,000,000,000` base units.
- `0.001 SP = 1,000,000` base units.

### Administration and safeguards

- The configured administrator can pause or unpause the treasury.
- SOL and SPL deposit/withdraw instructions reject operations while paused.
- Zero-amount operations are rejected.
- Checked arithmetic protects recorded-balance updates against overflow.
- Withdrawals are limited by the user's recorded balance and the corresponding vault balance.

## Program instructions

| Instruction | Purpose |
|---|---|
| `init_config` | Creates the treasury configuration and sets the administrator. |
| `set_paused` | Allows the administrator to pause or resume treasury operations. |
| `register` | Creates a user's SOL balance record. |
| `deposit` | Transfers SOL from the user to the SOL vault and updates the record. |
| `withdraw` | Transfers SOL from the SOL vault to the user and updates the record. |
| `register_token` | Creates a user's balance record for a particular SPL mint. |
| `init_token_vault` | Creates the treasury PDA's associated token account for a mint. |
| `deposit_spl` | Transfers SPL tokens to the treasury token vault and updates the user's token record. |
| `withdraw_spl` | Transfers SPL tokens from the treasury token vault back to the user and updates the record. |

## Account model

The program derives these PDAs from the program ID:

- Configuration: seeds `["config"]`
- SOL vault authority/account: seeds `["vault"]`
- SOL user record: seeds `["user", user_public_key]`
- SPL user record: seeds `["token-user", user_public_key, mint_public_key]`

The SPL treasury vault is the associated token account for the selected mint, with the `vault` PDA as its token authority.

## Development environment

The project was developed in **Solana Playground** on Devnet. The project files used are:

- `src/lib.rs` — Anchor program and account definitions.
- `client/client.ts` — client actions for setup, balance display, SOL deposits/withdrawals, and SP deposits/withdrawals.
- `tests/anchor.test.ts` — automated Anchor tests.

## Build, deploy, and test

1. Open the project in Solana Playground and connect a Devnet wallet.
2. Build the program and confirm the build succeeds.
3. Deploy or upgrade the program using the wallet that controls its upgrade authority. Confirm that the program ID remains `2rdinFdEePfmnqxRTpwV355Tz3kAo6vFKsj6kHmahFDL`.
4. Run the test suite. The demonstrated test run reported **12 passing**.
5. Run the client with the desired `ACTION` value.

The client supports these actions:

| `ACTION` value | Behaviour |
|---|---|
| `balances` | Reads the user's SOL/SP records and the treasury vault balances. |
| `setup` | Initializes any missing user/configuration/token-vault accounts, subject to administrator permissions for admin-only setup. |
| `deposit-sol` | Deposits the configured SOL amount. |
| `withdraw-sol` | Withdraws the configured SOL amount. |
| `deposit-sp` | Deposits the configured SP amount. |
| `withdraw-sp` | Withdraws the configured SP amount. |

Set `ACTION` in `client.ts`, save the file, and run the client from Solana Playground. Start with `balances` when checking the current state. Deposits and withdrawals submit real Devnet transactions.

## Demonstrated test coverage

The 12-test Playground run reported these tests passing:

1. Initialize configuration.
2. Register SOL user record.
3. Deposit 0.003 SOL.
4. Withdraw 0.001 SOL.
5. Reject withdrawal above the recorded SOL balance.
6. Reject a zero SOL deposit.
7. Reject a non-administrator pause request.
8. Reject deposits while the treasury is paused.
9. Register the SP token user record.
10. Initialize the treasury SP token vault.
11. Deposit 1 SP into the treasury.
12. Withdraw 1 SP from the treasury.

## Demonstrated SP transaction flow

The client was used to deposit 1 SP into the treasury and then withdraw 1 SP. The final client balance output showed:

| SP balance location | Final demonstrated balance |
|---|---:|
| User's SP balance record | 0 SP |
| User's SP wallet token account | 999,999 SP |
| Treasury SP token vault | 0 SP |

The separate token-transfer demonstration also sent 1 SP to a second wallet. That wallet transfer is separate from the Treasury Manager deposit/withdraw flow.

## Explorer verification

Use Solana Explorer with the Devnet cluster to inspect the deployed program, mint, and transaction signatures:

- Program: `https://explorer.solana.com/address/2rdinFdEePfmnqxRTpwV355Tz3kAo6vFKsj6kHmahFDL?cluster=devnet`
- SP mint: `https://explorer.solana.com/address/ApbbwSkPNmL6Fz4cqjbPvkSRVmMHzjcq69pt6BzxD4yq?cluster=devnet`

For the final submission, add the specific Devnet transaction links for the Treasury Manager SP deposit and SP withdrawal, plus screenshots of the 12-passing test output and final client balances.

## Limitations and future improvements

- This is a Devnet capstone demonstration, not a production-ready treasury or audited financial application.
- The current token account constraints use the classic SPL Token Program. Token-2022 mints require additional support and testing.
- The current accounting records one user's deposited amount for each mint. A production design should add broader asset-policy controls, stronger vault initialization/reuse handling, and comprehensive authorization and invariant tests.
- Add a frontend dashboard if required by the capstone evaluation; the current interaction surface is the Solana Playground TypeScript client.
- Before any mainnet use, obtain an independent security review, test edge cases, define upgrade governance, and reassess rent, fees, token compatibility, and operational controls.

