use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use vyper_core::state::{OwnerRestrictedIxFlags, TrancheConfig};

#[derive(Accounts)]
pub struct InitializeContext<'info> {

    /// Vault Configuration initialized
    #[account(init, payer = signer, space = OtcState::LEN)]
    pub otc_state: Box<Account<'info, OtcState>>,

    /// CHECK: Vault Configuration Authority
    #[account(seeds = [otc_state.key().as_ref(), b"authority".as_ref()], bump)]
    pub otc_authority: AccountInfo<'info>,

    // - - - - - - - - - - - - 
    // OTC Token Accounts

    /// OTC senior reserve token account
    #[account(init, payer = signer, token::mint = reserve_mint, token::authority = otc_authority)]
    pub otc_senior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior reserve token account
    #[account(init, payer = signer, token::mint = reserve_mint, token::authority = otc_authority)]
    pub otc_junior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC senior tranche token account
    #[account(init, payer = signer, token::mint = senior_tranche_mint, token::authority = otc_authority)]
    pub otc_senior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior tranche token account
    #[account(init, payer = signer, token::mint = junior_tranche_mint, token::authority = otc_authority)]
    pub otc_junior_tranche_token_account: Box<Account<'info, TokenAccount>>,
    
    // - - - - - - - - - - - - 
    // Token Mint

    /// Reserve Token mint
    #[account()]
    pub reserve_mint: Box<Account<'info, Mint>>,

    /// Senior Tranche Token mint
    #[account(mut)]
    pub senior_tranche_mint: Box<Account<'info, Mint>>,

    /// Junior Tranche Token mint
    #[account(mut)]
    pub junior_tranche_mint: Box<Account<'info, Mint>>,

    // - - - - - - - - - - - - 
    // Vyper Accounts

    /// Vyper Core Tranche Configuration
    #[account(has_one = reserve_mint, has_one = senior_tranche_mint, has_one = junior_tranche_mint)]
    pub vyper_tranche_config: Box<Account<'info, TrancheConfig>>,

    /// Rent program
    pub rent: Sysvar<'info, Rent>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, Debug)]
pub struct InitializeInputData {
    senior_deposit_amount: u64,
    junior_deposit_amount: u64,
    deposit_expiration: i64,
    settle_available_from: i64,
}

pub fn handler(ctx: Context<InitializeContext>, input_data: InitializeInputData) -> Result<()> {
    let clock = Clock::get()?;

    // tranche config owner needs to be the vault authority
    require_keys_eq!(
        ctx.accounts.vyper_tranche_config.owner.key(),
        ctx.accounts.otc_authority.key(),
        VyperOtcErrorCode::InitializationError
    );

    // require that only the owner of the tranche configuration can execute deposits and redeems
    let vyper_restricted_ixs = ctx
        .accounts
        .vyper_tranche_config
        .tranche_data
        .get_owner_restricted_ixs()?;
    require!(
        vyper_restricted_ixs.contains(OwnerRestrictedIxFlags::DEPOSITS)
            && vyper_restricted_ixs.contains(OwnerRestrictedIxFlags::REDEEMS),
        VyperOtcErrorCode::InitializationError
    );

    // check that otc_expiration > deposit_expiration
    require_gt!(input_data.settle_available_from, input_data.deposit_expiration, VyperOtcErrorCode::InitializationError);

    // create otc state
    let otc_state = &mut ctx.accounts.otc_state;

    // save input data
    otc_state.created = clock.unix_timestamp;
    otc_state.deposit_expiration = input_data.deposit_expiration;
    otc_state.settle_available_from = input_data.settle_available_from;
    otc_state.settle_executed = false;
    otc_state.senior_deposit_amount = input_data.senior_deposit_amount;
    otc_state.junior_deposit_amount = input_data.junior_deposit_amount;

    // accounts
    otc_state.otc_senior_reserve_token_account = ctx.accounts.otc_senior_reserve_token_account.key();
    otc_state.otc_junior_reserve_token_account = ctx.accounts.otc_junior_reserve_token_account.key();
    otc_state.otc_senior_tranche_token_account = ctx.accounts.otc_senior_tranche_token_account.key();
    otc_state.otc_junior_tranche_token_account = ctx.accounts.otc_junior_tranche_token_account.key();
    otc_state.vyper_tranche_config = ctx.accounts.vyper_tranche_config.key();
    otc_state.otc_authority = ctx.accounts.otc_authority.key();
    otc_state.authority_seed = otc_state.key();
    otc_state.authority_bump = [*ctx
        .bumps
        .get("otc_authority")
        .ok_or(VyperOtcErrorCode::InitializationError)?];
    otc_state.version = get_version_arr();

    emit!(InitializeEvent {
        otc_state: ctx.accounts.otc_state.key(),
        senior_deposit_amount: input_data.senior_deposit_amount,
        junior_deposit_amount: input_data.junior_deposit_amount,
        deposit_expiration: input_data.deposit_expiration,
        settle_available_from: input_data.settle_available_from,
    });

    Ok(())
}

fn get_version_arr() -> [u8; 3] {
    [
        env!("CARGO_PKG_VERSION_MAJOR")
            .parse::<u8>()
            .expect("failed to parse major version"),
        env!("CARGO_PKG_VERSION_MINOR")
            .parse::<u8>()
            .expect("failed to parse minor version"),
        env!("CARGO_PKG_VERSION_PATCH")
            .parse::<u8>()
            .expect("failed to parse patch version"),
    ]
}

#[event]
pub struct InitializeEvent {
    pub otc_state: Pubkey,
    pub senior_deposit_amount: u64,
    pub junior_deposit_amount: u64,
    pub deposit_expiration: i64,
    pub settle_available_from: i64,
}