use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::token::{self, TokenAccount, Token, CloseAccount};
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
    
    /// Token program
    pub token_program: Program<'info, Token>,

    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<CloseContext>) -> Result<()> {
    
    // check if deposit is closed
    let clock = Clock::get()?;
    require_gt!(clock.unix_timestamp, ctx.accounts.otc_state.deposit_end, VyperOtcErrorCode::DepositOpen);

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