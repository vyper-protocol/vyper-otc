use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct CloseContext<'info> {

    /// Vault Configuration initialized
    #[account(has_one = otc_senior_reserve_token_account,
        has_one = otc_junior_reserve_token_account,
        has_one = otc_senior_tranche_token_account,
        has_one = otc_junior_tranche_token_account,
        has_one = otc_authority)]
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

    // /// System program
    // pub system_program: Program<'info, System>,

    // /// Token program
    // pub token_program: Program<'info, Token>,
    
    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<CloseContext>) -> Result<()> {
    
    // check if deposit is closed
    let clock = Clock::get()?;
    if clock.unix_timestamp < ctx.accounts.otc_state.deposit_end {
        return err!(VyperOtcErrorCode::DepositOpen);
    }

    // check that assets have been redeemed
    require_eq!(ctx.accounts.otc_senior_reserve_token_account.amount, 0);
    require_eq!(ctx.accounts.otc_junior_reserve_token_account.amount, 0);
    require_eq!(ctx.accounts.otc_senior_tranche_token_account.amount, 0);
    require_eq!(ctx.accounts.otc_junior_tranche_token_account.amount, 0);
    
    ctx.accounts.otc_senior_reserve_token_account.close(ctx.accounts.signer.to_account_info())?;
    ctx.accounts.otc_junior_reserve_token_account.close(ctx.accounts.signer.to_account_info())?;
    ctx.accounts.otc_senior_tranche_token_account.close(ctx.accounts.signer.to_account_info())?;
    ctx.accounts.otc_junior_tranche_token_account.close(ctx.accounts.signer.to_account_info())?;

    ctx.accounts.otc_state.close(ctx.accounts.signer.to_account_info())?;

    Ok(())
}
