use crate::{
    errors::VyperOtcErrorCode,
    state::OtcState
};
use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::token::{self, TokenAccount, Token, CloseAccount, Mint};
use vyper_core::{state::TrancheConfig, program::VyperCore};

#[derive(Accounts)]
pub struct CloseContext<'info> {

    /// otc_state configuration
    #[account(
        mut,
        has_one = otc_senior_reserve_token_account,
        has_one = otc_junior_reserve_token_account,
        has_one = otc_senior_tranche_token_account,
        has_one = otc_junior_tranche_token_account,
        has_one = otc_authority,)]
    pub otc_state: Box<Account<'info, OtcState>>,

    /// CHECK: Vault Configuration Authority
    #[account(seeds = [otc_state.key().as_ref(), b"authority".as_ref()], bump)]
    pub otc_authority: AccountInfo<'info>,

    // - - - - - - - - - - - - 
    // OTC Token Accounts

    /// OTC senior reserve token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_senior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior reserve token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_junior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC senior tranche token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_senior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior tranche token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_junior_tranche_token_account: Box<Account<'info, TokenAccount>>,
    
    // - - - - - - - - - - - - 
    // Vyper Accounts

    /// Senior Tranche Token mint
    #[account(mut)]
    pub senior_tranche_mint: Box<Account<'info, Mint>>,

    /// Junior Tranche Token mint
    #[account(mut)]
    pub junior_tranche_mint: Box<Account<'info, Mint>>,

    /// vyper core reserve ta
    #[account(mut)]
    pub reserve: Box<Account<'info, TokenAccount>>,

    /// Vyper Core Tranche Configuration
    #[account(
        mut,
        has_one = senior_tranche_mint,
        has_one = junior_tranche_mint,
        has_one = reserve,
    )]
    pub vyper_tranche_config: Box<Account<'info, TrancheConfig>>,

    /// Vyper Core tranche configuration authority
    /// CHECK:
    #[account()]
    pub vyper_tranche_authority: AccountInfo<'info>,

    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Vyper Core program
    pub vyper_core: Program<'info, VyperCore>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Rent program
    pub rent: Sysvar<'info, Rent>
}

pub fn handler(ctx: Context<CloseContext>) -> Result<()> {
    
    // check if deposit is closed
    let clock = Clock::get()?;
    require_gt!(clock.unix_timestamp, ctx.accounts.otc_state.deposit_end, VyperOtcErrorCode::DepositOpen);

    // close vyper core

    vyper_core::cpi::close(CpiContext::new_with_signer(
        ctx.accounts.vyper_core.to_account_info(),
        vyper_core::cpi::accounts::CloseContext {
            fee_receiver: ctx.accounts.signer.to_account_info(),
            owner: ctx.accounts.otc_authority.to_account_info(),
            junior_tranche_mint: ctx.accounts.junior_tranche_mint.to_account_info(),
            senior_tranche_mint: ctx.accounts.senior_tranche_mint.to_account_info(),
            reserve: ctx.accounts.reserve.to_account_info(),
            tranche_config: ctx.accounts.vyper_tranche_config.to_account_info(),
            tranche_authority: ctx.accounts.vyper_tranche_authority.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info()
        }, &[&ctx.accounts.otc_state.authority_seeds()]))?;

    // NB we don't have to check if token accounts have zero balance
    // this is already checked by the token program below
    // -> Non-native account can only be closed if its balance is zero

    msg!("close token accounts");
    for account_to_close in [
        ctx.accounts.otc_senior_reserve_token_account.to_account_info(),
        ctx.accounts.otc_junior_reserve_token_account.to_account_info(),
        ctx.accounts.otc_senior_tranche_token_account.to_account_info(),
        ctx.accounts.otc_junior_tranche_token_account.to_account_info()
    ] {
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: account_to_close,
                authority: ctx.accounts.otc_authority.to_account_info(),
                destination: ctx.accounts.signer.to_account_info()
            },
            &[&ctx.accounts.otc_state.authority_seeds()]
        ))?;
    }

    msg!("close otc state");
    ctx.accounts.otc_state.close(ctx.accounts.signer.to_account_info())?;

    emit!(ContractClosed {
        otc_state: ctx.accounts.otc_state.key(),
        signer: ctx.accounts.signer.key(),
    });

    Ok(())
}

#[event]
pub struct ContractClosed {
    pub otc_state: Pubkey,
    pub signer: Pubkey
}