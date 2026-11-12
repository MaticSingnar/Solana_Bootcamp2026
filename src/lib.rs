use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer as SolTransfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("2rdinFdEePfmnqxRTpwV355Tz3kAo6vFKsj6kHmahFDL");

#[program]
pub mod treasury {
    use super::*;

    // 1. Initialize treasury configuration
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.paused = false;

        msg!("Treasury initialized");
        msg!("Admin: {}", config.admin);
        Ok(())
    }

    // 2. Pause or unpause treasury
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        msg!("Treasury paused: {}", paused);
        Ok(())
    }

    // 3. Register SOL user
    pub fn register(ctx: Context<Register>) -> Result<()> {
        let record = &mut ctx.accounts.record;
        record.owner = ctx.accounts.user.key();
        record.amount = 0;

        msg!("SOL user registered: {}", record.owner);
        Ok(())
    }

    // 4. Deposit SOL
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, TreasuryError::Paused);
        require!(amount > 0, TreasuryError::ZeroAmount);

        let new_balance = ctx
            .accounts
            .record
            .amount
            .checked_add(amount)
            .ok_or(TreasuryError::Overflow)?;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                SolTransfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.record.amount = new_balance;

        msg!("SOL deposit successful: {}", amount);
        msg!("New SOL balance: {}", new_balance);
        Ok(())
    }

    // 5. Withdraw SOL
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, TreasuryError::Paused);
        require!(amount > 0, TreasuryError::ZeroAmount);

        let old_balance = ctx.accounts.record.amount;
        require!(amount <= old_balance, TreasuryError::InsufficientBalance);

        require!(
            amount <= ctx.accounts.vault.lamports(),
            TreasuryError::InsufficientVaultBalance
        );

        let new_balance = old_balance
            .checked_sub(amount)
            .ok_or(TreasuryError::InsufficientBalance)?;

        let bump = ctx.bumps.vault;
        let vault_seeds: &[&[u8]] = &[b"vault", &[bump]];
        let signer_seeds = &[vault_seeds];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                SolTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        ctx.accounts.record.amount = new_balance;

        msg!("SOL withdrawal successful: {}", amount);
        msg!("Remaining SOL balance: {}", new_balance);
        Ok(())
    }

    // 6. Register SPL token user
    pub fn register_token(ctx: Context<RegisterToken>) -> Result<()> {
        let record = &mut ctx.accounts.token_record;
        record.owner = ctx.accounts.user.key();
        record.mint = ctx.accounts.mint.key();
        record.amount = 0;

        msg!("SPL user registered");
        msg!("Mint: {}", record.mint);
        Ok(())
    }

    // 7. Initialize treasury SPL token vault
    pub fn init_token_vault(_ctx: Context<InitTokenVault>) -> Result<()> {
        msg!("Treasury SPL token vault initialized");
        Ok(())
    }

    // 8. Deposit SPL tokens
    // For SP with 9 decimals, 1 SP = 1_000_000_000 base units.
    pub fn deposit_spl(ctx: Context<DepositSpl>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, TreasuryError::Paused);
        require!(amount > 0, TreasuryError::ZeroAmount);

        let new_balance = ctx
            .accounts
            .token_record
            .amount
            .checked_add(amount)
            .ok_or(TreasuryError::Overflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.token_record.amount = new_balance;

        msg!("SPL deposit successful: {}", amount);
        msg!("New SPL balance: {}", new_balance);
        Ok(())
    }

    // 9. Withdraw SPL tokens
    pub fn withdraw_spl(ctx: Context<WithdrawSpl>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, TreasuryError::Paused);
        require!(amount > 0, TreasuryError::ZeroAmount);

        let old_balance = ctx.accounts.token_record.amount;
        require!(amount <= old_balance, TreasuryError::InsufficientBalance);

        require!(
            amount <= ctx.accounts.token_vault.amount,
            TreasuryError::InsufficientTokenVaultBalance
        );

        let new_balance = old_balance
            .checked_sub(amount)
            .ok_or(TreasuryError::InsufficientBalance)?;

        let bump = ctx.bumps.vault;
        let vault_seeds: &[&[u8]] = &[b"vault", &[bump]];
        let signer_seeds = &[vault_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        ctx.accounts.token_record.amount = new_balance;

        msg!("SPL withdrawal successful: {}", amount);
        msg!("Remaining SPL balance: {}", new_balance);
        Ok(())
    }
}

// ==========================================
// 10. INITIALIZE CONFIG
// ==========================================

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ==========================================
// 11. ADMIN PAUSE
// ==========================================

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump,
        has_one = admin
    )]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,
}

// ==========================================
// 12. SOL USER REGISTRATION
// ==========================================

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserRecord::INIT_SPACE,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub record: Account<'info, UserRecord>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ==========================================
// 13. SOL DEPOSIT
// ==========================================

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump,
        constraint = record.owner == user.key()
    )]
    pub record: Account<'info, UserRecord>,

    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ==========================================
// 14. SOL WITHDRAW
// ==========================================

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump,
        constraint = record.owner == user.key()
    )]
    pub record: Account<'info, UserRecord>,

    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ==========================================
// 15. SPL USER REGISTRATION
// ==========================================

#[derive(Accounts)]
pub struct RegisterToken<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + TokenUserRecord::INIT_SPACE,
        seeds = [b"token-user", user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_record: Account<'info, TokenUserRecord>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ==========================================
// 16. INITIALIZE SPL TOKEN VAULT
// ==========================================

#[derive(Accounts)]
pub struct InitTokenVault<'info> {
    #[account(seeds = [b"config"], bump, has_one = admin)]
    pub config: Account<'info, Config>,

    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as the treasury token vault authority.
    #[account(seeds = [b"vault"], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ==========================================
// 17. SPL TOKEN DEPOSIT
// ==========================================

#[derive(Accounts)]
pub struct DepositSpl<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"token-user", user.key().as_ref(), mint.key().as_ref()],
        bump,
        constraint = token_record.owner == user.key(),
        constraint = token_record.mint == mint.key()
    )]
    pub token_record: Account<'info, TokenUserRecord>,

    pub mint: Account<'info, Mint>,

    /// CHECK: This PDA is the treasury token vault authority.
    #[account(seeds = [b"vault"], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = user_token.owner == user.key(),
        constraint = user_token.mint == mint.key()
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ==========================================
// 18. SPL TOKEN WITHDRAW
// ==========================================

#[derive(Accounts)]
pub struct WithdrawSpl<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"token-user", user.key().as_ref(), mint.key().as_ref()],
        bump,
        constraint = token_record.owner == user.key(),
        constraint = token_record.mint == mint.key()
    )]
    pub token_record: Account<'info, TokenUserRecord>,

    pub mint: Account<'info, Mint>,

    /// CHECK: This PDA signs for the treasury token vault.
    #[account(seeds = [b"vault"], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.owner == user.key(),
        constraint = user_token.mint == mint.key()
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ==========================================
// 19. CONFIG DATA
// ==========================================

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub paused: bool,
}

// ==========================================
// 20. SOL USER DATA
// ==========================================

#[account]
#[derive(InitSpace)]
pub struct UserRecord {
    pub owner: Pubkey,
    pub amount: u64,
}

// ==========================================
// 21. SPL USER DATA
// ==========================================

#[account]
#[derive(InitSpace)]
pub struct TokenUserRecord {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

// ==========================================
// 22. CUSTOM ERRORS
// ==========================================

#[error_code]
pub enum TreasuryError {
    #[msg("Treasury is paused")]
    Paused,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Not enough deposited balance")]
    InsufficientBalance,

    #[msg("Math overflow")]
    Overflow,

    #[msg("Treasury vault has insufficient SOL")]
    InsufficientVaultBalance,

    #[msg("Treasury token vault has insufficient tokens")]
    InsufficientTokenVaultBalance,
}
