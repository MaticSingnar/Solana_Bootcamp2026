import { BN } from "@coral-xyz/anchor";

import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ==========================================
// TREASURY MANAGER - SOLANA PLAYGROUND
// ==========================================

// 1. PROGRAM AND WALLET

const programId = pg.program.programId;
const wallet = pg.wallet.publicKey;

// 2. DERIVE SOL PDA ADDRESSES

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

// 3. SPL TOKEN ADDRESSES

const mint = new web3.PublicKey("ApbbwSkPNmL6Fz4cqjbPvkSRVmMHzjcq69pt6BzxD4yq");

const [tokenRecordPda] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("token-user"), wallet.toBuffer(), mint.toBuffer()],
  programId
);

const userToken = getAssociatedTokenAddressSync(mint, wallet);

const tokenVault = getAssociatedTokenAddressSync(mint, vaultPda, true);

// 4. ACCOUNT CONFIGURATIONS

const configAccounts = {
  config: configPda,
  admin: wallet,
};

const registerAccounts = {
  record: recordPda,
  user: wallet,
  systemProgram: web3.SystemProgram.programId,
};

const treasuryAccounts = {
  config: configPda,
  record: recordPda,
  vault: vaultPda,
  user: wallet,
  systemProgram: web3.SystemProgram.programId,
};

// 5. EXPECTED ERROR HANDLER

async function expectError(promise: Promise<any>, code: string) {
  let failed = false;

  try {
    await promise;
  } catch (e: any) {
    failed = true;

    const errorCode = String(e?.error?.errorCode?.code ?? "");

    const errorText = errorCode + " " + String(e);

    console.log("Expected error:", errorText);

    assert(errorText.includes(code), `Expected ${code}, got: ${errorText}`);
  }

  assert(failed, `Expected ${code}, but transaction succeeded`);
}

// ==========================================
// 6. TREASURY TEST SUITE
// ==========================================

describe("Treasury", () => {
  // TEST 1: INITIALIZE CONFIG

  it("initializes the config", async () => {
    const info = await pg.connection.getAccountInfo(configPda);

    if (!info) {
      await pg.program.methods
        .initConfig()
        .accounts({
          config: configPda,
          admin: wallet,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    }

    const config = await pg.program.account.config.fetch(configPda);

    assert(config.admin.equals(wallet), "Admin should be my wallet");

    console.log("Config initialized successfully");
  });

  // TEST 2: REGISTER SOL USER

  it("registers my user record", async () => {
    const info = await pg.connection.getAccountInfo(recordPda);

    if (!info) {
      await pg.program.methods.register().accounts(registerAccounts).rpc();
    }

    const record = await pg.program.account.userRecord.fetch(recordPda);

    assert(record.owner.equals(wallet), "Owner should be my wallet");

    console.log("SOL user registered successfully");
  });

  // TEST 3: DEPOSIT 0.003 SOL

  it("deposits 0.003 SOL", async function () {
    this.timeout(60000);

    const amount = new BN("3000000");

    const before = await pg.program.account.userRecord.fetch(
      recordPda,
      "confirmed"
    );

    const vaultBefore = await pg.connection.getBalance(vaultPda, "confirmed");

    const signature = await pg.program.methods
      .deposit(amount)
      .accounts(treasuryAccounts)
      .rpc({
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

    const after = await pg.program.account.userRecord.fetch(
      recordPda,
      "confirmed"
    );

    const vaultAfter = await pg.connection.getBalance(vaultPda, "confirmed");

    const recordIncrease = after.amount.sub(before.amount);

    const vaultIncrease = vaultAfter - vaultBefore;

    console.log("Deposit signature:", signature);
    console.log("Record before:", before.amount.toString());
    console.log("Record after:", after.amount.toString());
    console.log("Record increase:", recordIncrease.toString());
    console.log("Vault before:", vaultBefore);
    console.log("Vault after:", vaultAfter);
    console.log("Vault increase:", vaultIncrease);

    assert(
      recordIncrease.eq(amount),
      "SOL user balance should increase by 3,000,000"
    );

    assert.equal(vaultIncrease, 3000000);

    console.log("SOL deposit successful");
  });

  // TEST 4: WITHDRAW 0.001 SOL

  it("withdraws 0.001 SOL", async function () {
    this.timeout(60000);

    const amount = new BN("1000000");

    const before = await pg.program.account.userRecord.fetch(
      recordPda,
      "confirmed"
    );

    const vaultBefore = await pg.connection.getBalance(vaultPda, "confirmed");

    const signature = await pg.program.methods
      .withdraw(amount)
      .accounts(treasuryAccounts)
      .rpc({
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

    const after = await pg.program.account.userRecord.fetch(
      recordPda,
      "confirmed"
    );

    const vaultAfter = await pg.connection.getBalance(vaultPda, "confirmed");

    console.log("Withdrawal signature:", signature);
    console.log("Record before:", before.amount.toString());
    console.log("Record after:", after.amount.toString());
    console.log("Vault before:", vaultBefore);
    console.log("Vault after:", vaultAfter);

    assert(
      before.amount.sub(after.amount).eq(amount),
      "SOL balance should decrease by 1,000,000"
    );

    assert.equal(vaultBefore - vaultAfter, 1000000);

    console.log("SOL withdrawal successful");
  });

  // TEST 5: INSUFFICIENT SOL BALANCE

  it("cannot withdraw more than my SOL balance", async () => {
    const record = await pg.program.account.userRecord.fetch(recordPda);

    const tooMuch = record.amount.add(new BN(1));

    await expectError(
      pg.program.methods.withdraw(tooMuch).accounts(treasuryAccounts).rpc(),
      "InsufficientBalance"
    );
  });

  // TEST 6: ZERO SOL DEPOSIT

  it("cannot deposit zero SOL", async () => {
    await expectError(
      pg.program.methods.deposit(new BN(0)).accounts(treasuryAccounts).rpc(),
      "ZeroAmount"
    );
  });

  // TEST 7: NON-ADMIN CANNOT PAUSE

  it("a non-admin cannot pause the treasury", async () => {
    const other = web3.Keypair.generate();

    await expectError(
      pg.program.methods
        .setPaused(true)
        .accounts({
          config: configPda,
          admin: other.publicKey,
        })
        .signers([other])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  // TEST 8: DEPOSIT BLOCKED WHILE PAUSED

  it("deposits are blocked while paused", async () => {
    await pg.program.methods.setPaused(true).accounts(configAccounts).rpc();

    try {
      await expectError(
        pg.program.methods
          .deposit(new BN(1000000))
          .accounts(treasuryAccounts)
          .rpc(),
        "Paused"
      );
    } finally {
      await pg.program.methods.setPaused(false).accounts(configAccounts).rpc();
    }
  });

  // ========================================
  // SPL TOKEN TESTS
  // ========================================

  // TEST 9: REGISTER SP USER

  it("registers my SP token record", async function () {
    this.timeout(60000);

    const info = await pg.connection.getAccountInfo(tokenRecordPda);

    if (!info) {
      await pg.program.methods
        .registerToken()
        .accounts({
          tokenRecord: tokenRecordPda,
          mint,
          user: wallet,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        });
    }

    const record = await pg.program.account.tokenUserRecord.fetch(
      tokenRecordPda
    );

    assert(record.owner.equals(wallet));
    assert(record.mint.equals(mint));

    console.log("SP user registration successful");
  });

  // TEST 10: INITIALIZE TREASURY SP VAULT

  it("initializes the treasury SP token vault", async function () {
    this.timeout(60000);

    const info = await pg.connection.getAccountInfo(tokenVault);

    if (!info) {
      await pg.program.methods
        .initTokenVault()
        .accounts({
          config: configPda,
          mint,
          vault: vaultPda,
          tokenVault,
          admin: wallet,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        });
    }

    const account = await getAccount(pg.connection, tokenVault, "confirmed");

    assert(account.mint.equals(mint));
    assert(account.owner.equals(vaultPda));

    console.log("SP treasury vault initialized");
    console.log("Token vault:", tokenVault.toBase58());
  });

  // TEST 11: DEPOSIT 1 SP

  it("deposits 1 SP into treasury", async function () {
    this.timeout(60000);

    const amount = new BN("1000000000");

    const beforeUser = await getAccount(pg.connection, userToken, "confirmed");

    const beforeVault = await getAccount(
      pg.connection,
      tokenVault,
      "confirmed"
    );

    const recordBefore = await pg.program.account.tokenUserRecord.fetch(
      tokenRecordPda
    );

    const signature = await pg.program.methods
      .depositSpl(amount)
      .accounts({
        config: configPda,
        tokenRecord: tokenRecordPda,
        mint,
        vault: vaultPda,
        userToken,
        tokenVault,
        user: wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

    const afterUser = await getAccount(pg.connection, userToken, "confirmed");

    const afterVault = await getAccount(pg.connection, tokenVault, "confirmed");

    const recordAfter = await pg.program.account.tokenUserRecord.fetch(
      tokenRecordPda
    );

    const userDecrease = (beforeUser.amount - afterUser.amount).toString();

    const vaultIncrease = (afterVault.amount - beforeVault.amount).toString();

    const recordIncrease = recordAfter.amount.sub(recordBefore.amount);

    assert.equal(userDecrease, "1000000000");
    assert.equal(vaultIncrease, "1000000000");
    assert(recordIncrease.eq(amount));

    console.log("1 SP deposit successful");
    console.log("User token balance:", afterUser.amount.toString());
    console.log("Treasury token balance:", afterVault.amount.toString());
    console.log("Transaction:", signature);
  });

  // TEST 12: WITHDRAW 1 SP

  it("withdraws 1 SP from treasury", async function () {
    this.timeout(60000);

    const amount = new BN("1000000000");

    const beforeUser = await getAccount(pg.connection, userToken, "confirmed");

    const beforeVault = await getAccount(
      pg.connection,
      tokenVault,
      "confirmed"
    );

    const recordBefore = await pg.program.account.tokenUserRecord.fetch(
      tokenRecordPda
    );

    const signature = await pg.program.methods
      .withdrawSpl(amount)
      .accounts({
        config: configPda,
        tokenRecord: tokenRecordPda,
        mint,
        vault: vaultPda,
        tokenVault,
        userToken,
        user: wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

    const afterUser = await getAccount(pg.connection, userToken, "confirmed");

    const afterVault = await getAccount(pg.connection, tokenVault, "confirmed");

    const recordAfter = await pg.program.account.tokenUserRecord.fetch(
      tokenRecordPda
    );

    const userIncrease = (afterUser.amount - beforeUser.amount).toString();

    const vaultDecrease = (beforeVault.amount - afterVault.amount).toString();

    const recordDecrease = recordBefore.amount.sub(recordAfter.amount);

    assert.equal(userIncrease, "1000000000");
    assert.equal(vaultDecrease, "1000000000");
    assert(recordDecrease.eq(amount));

    console.log("1 SP withdrawal successful");
    console.log("User token balance:", afterUser.amount.toString());
    console.log("Treasury token balance:", afterVault.amount.toString());
    console.log("Transaction:", signature);
  });
});
