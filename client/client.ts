import { BN } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

// ==========================================
// TREASURY MANAGER CLIENT
// SOLANA DEVNET
// ==========================================

const program = pg.program;
const connection = pg.connection;
const wallet = pg.wallet.publicKey;

// ==========================================
// SELECT ACTION
// ==========================================

// Start with "balances".
// Other actions:
// "setup"
// "deposit-sol"
// "withdraw-sol"
// "deposit-sp"
// "withdraw-sp"

const ACTION = "balances";

// SOL amounts are in lamports.
// 0.001 SOL = 1,000,000 lamports.
const SOL_AMOUNT = new BN("1000000");

// SP has 9 decimals.
// 1 SP = 1,000,000,000 base units.
const SP_AMOUNT = new BN("1000000000");

// SP token mint
const mint = new web3.PublicKey("ApbbwSkPNmL6Fz4cqjbPvkSRVmMHzjcq69pt6BzxD4yq");

// ==========================================
// DERIVE TREASURY PDAs
// ==========================================

const programId = program.programId;

const [configPda] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  programId
);

const [vaultPda] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  programId
);

const [recordPda] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("user"), wallet.toBuffer()],
  programId
);

const [tokenRecordPda] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("token-user"), wallet.toBuffer(), mint.toBuffer()],
  programId
);

// User's SP associated token account
const userToken = getAssociatedTokenAddressSync(mint, wallet);

// Treasury's SP associated token account
const tokenVault = getAssociatedTokenAddressSync(mint, vaultPda, true);

// ==========================================
// COMMON TRANSACTION OPTIONS
// ==========================================

const rpcOptions = {
  commitment: "confirmed" as const,
  preflightCommitment: "confirmed" as const,
};

// ==========================================
// SHOW TREASURY BALANCES
// ==========================================

async function showBalances() {
  console.log("========== TREASURY BALANCES ==========");
  console.log("Wallet:", wallet.toBase58());

  const solRecord = await program.account.userRecord.fetch(recordPda);

  const tokenRecord = await program.account.tokenUserRecord.fetch(
    tokenRecordPda
  );

  const solVaultBalance = await connection.getBalance(vaultPda, "confirmed");

  const userSP = await getAccount(connection, userToken, "confirmed");

  const treasurySP = await getAccount(connection, tokenVault, "confirmed");

  console.log("");
  console.log("SOL user balance:", solRecord.amount.toString(), "lamports");
  console.log("SOL treasury vault:", solVaultBalance, "lamports");

  console.log("");
  console.log("SP user record:", tokenRecord.amount.toString());
  console.log("SP user wallet:", userSP.amount.toString(), "base units");
  console.log("SP treasury vault:", treasurySP.amount.toString(), "base units");

  console.log("");
  console.log("User SP balance:", Number(userSP.amount) / 1e9, "SP");
  console.log("Treasury SP balance:", Number(treasurySP.amount) / 1e9, "SP");

  console.log("=======================================");
}

// ==========================================
// SETUP USER ACCOUNTS
// ==========================================

async function setupTreasuryUser() {
  console.log("Checking treasury accounts...");

  const configInfo = await connection.getAccountInfo(configPda);

  if (!configInfo) {
    await program.methods
      .initConfig()
      .accounts({
        config: configPda,
        admin: wallet,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc(rpcOptions);

    console.log("Treasury configuration initialized");
  }

  const recordInfo = await connection.getAccountInfo(recordPda);

  if (!recordInfo) {
    await program.methods
      .register()
      .accounts({
        record: recordPda,
        user: wallet,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc(rpcOptions);

    console.log("SOL user registered");
  }

  const tokenRecordInfo = await connection.getAccountInfo(tokenRecordPda);

  if (!tokenRecordInfo) {
    await program.methods
      .registerToken()
      .accounts({
        tokenRecord: tokenRecordPda,
        mint,
        user: wallet,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc(rpcOptions);

    console.log("SP user registered");
  }

  const tokenVaultInfo = await connection.getAccountInfo(tokenVault);

  if (!tokenVaultInfo) {
    await program.methods
      .initTokenVault()
      .accounts({
        config: configPda,
        mint,
        vault: vaultPda,
        tokenVault,
        admin: wallet,
        tokenProgram: new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        associatedTokenProgram: new web3.PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc(rpcOptions);

    console.log("SP treasury vault initialized");
  }

  console.log("Treasury setup completed");
}

// ==========================================
// DEPOSIT SOL
// ==========================================

async function depositSOL() {
  const signature = await program.methods
    .deposit(SOL_AMOUNT)
    .accounts({
      config: configPda,
      record: recordPda,
      vault: vaultPda,
      user: wallet,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc(rpcOptions);

  console.log("SOL deposit successful");
  console.log("Amount:", SOL_AMOUNT.toString(), "lamports");
  console.log("Transaction:", signature);
}

// ==========================================
// WITHDRAW SOL
// ==========================================

async function withdrawSOL() {
  const signature = await program.methods
    .withdraw(SOL_AMOUNT)
    .accounts({
      config: configPda,
      record: recordPda,
      vault: vaultPda,
      user: wallet,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc(rpcOptions);

  console.log("SOL withdrawal successful");
  console.log("Amount:", SOL_AMOUNT.toString(), "lamports");
  console.log("Transaction:", signature);
}

// ==========================================
// DEPOSIT SP TOKENS
// ==========================================

async function depositSP() {
  const signature = await program.methods
    .depositSpl(SP_AMOUNT)
    .accounts({
      config: configPda,
      tokenRecord: tokenRecordPda,
      mint,
      vault: vaultPda,
      userToken,
      tokenVault,
      user: wallet,
      tokenProgram: new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      ),
    })
    .rpc(rpcOptions);

  console.log("SP deposit successful");
  console.log("Amount: 1 SP");
  console.log("Transaction:", signature);
}

// ==========================================
// WITHDRAW SP TOKENS
// ==========================================

async function withdrawSP() {
  const signature = await program.methods
    .withdrawSpl(SP_AMOUNT)
    .accounts({
      config: configPda,
      tokenRecord: tokenRecordPda,
      mint,
      vault: vaultPda,
      tokenVault,
      userToken,
      user: wallet,
      tokenProgram: new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      ),
    })
    .rpc(rpcOptions);

  console.log("SP withdrawal successful");
  console.log("Amount: 1 SP");
  console.log("Transaction:", signature);
}

// ==========================================
// RUN SELECTED ACTION
// ==========================================

(async () => {
  console.log("Treasury Manager Client");
  console.log("Program ID:", programId.toBase58());

  if (ACTION === "balances") {
    await showBalances();
  } else if (ACTION === "setup") {
    await setupTreasuryUser();
  } else if (ACTION === "deposit-sol") {
    await depositSOL();
  } else if (ACTION === "withdraw-sol") {
    await withdrawSOL();
  } else if (ACTION === "deposit-sp") {
    await depositSP();
  } else if (ACTION === "withdraw-sp") {
    await withdrawSP();
  } else {
    throw new Error("Unknown Treasury Manager action");
  }
})().catch((error) => {
  console.error("Treasury client error:", error);
});
