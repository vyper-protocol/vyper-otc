use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, self};

#[derive(Accounts)]
pub struct WithdrawContext<'info> {

    /// User reserve token account
    #[account(mut, token::authority = signer)]
    pub user_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// User reserve token account
    #[account(mut, token::mint = reserve_mint)]
    pub beneficiary_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault Configuration initialized
    #[account(mut,
        has_one = otc_senior_reserve_token_account,
        has_one = otc_junior_reserve_token_account,
        has_one = otc_authority)]
    pub otc_state: Box<Account<'info, OtcState>>,

    /// CHECK: Vault Configuration Authority
    #[account(seeds = [otc_state.key().as_ref(), b"authority".as_ref()], bump)]
    pub otc_authority: AccountInfo<'info>,

    // - - - - - - - - - - - - 
    // OTC Token Accounts

    /// OTC senior reserve token account
    #[account(mut, token::mint = reserve_mint, token::authority = otc_authority)]
    pub otc_senior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior reserve token account
    #[account(mut, token::mint = reserve_mint, token::authority = otc_authority)]
    pub otc_junior_reserve_token_account: Box<Account<'info, TokenAccount>>,
    
    // - - - - - - - - - - - - 
    // Token Mint

    /// Reserve Token mint
    #[account()]
    pub reserve_mint: Box<Account<'info, Mint>>,
    
    /// Rent program
    // pub rent: Sysvar<'info, Rent>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<WithdrawContext>) -> Result<()> {
    
    // check that the deposits are closed and one side is not taken
    let clock = Clock::get()?;
    if clock.unix_timestamp < ctx.accounts.otc_state.deposit_end {
        return err!(VyperOtcErrorCode::DepositOpen);
    }

    // withdraw is not possible is we have both sides taken
    if ctx.accounts.otc_state.senior_side_beneficiary.is_some() && ctx.accounts.otc_state.junior_side_beneficiary.is_some() {
        return err!(VyperOtcErrorCode::BothPositionsTaken);
    }

    let mut is_senior_opt: Option<bool> = None;

    if let Some(senior_side_beneficiary) = ctx.accounts.otc_state.senior_side_beneficiary {
        if senior_side_beneficiary == ctx.accounts.beneficiary_token_account.key() {
            is_senior_opt = Some(true);
        }
    } 

    if let Some(junior_side_beneficiary) = ctx.accounts.otc_state.junior_side_beneficiary {
        if junior_side_beneficiary == ctx.accounts.beneficiary_token_account.key() {
            is_senior_opt = Some(false);
        }
    }

    if let Some(is_senior) = is_senior_opt {

        // transfer assets
        if is_senior {
            token::transfer(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.otc_senior_reserve_token_account.to_account_info(),
                    to: ctx.accounts.beneficiary_token_account.to_account_info(),
                    authority: ctx.accounts.otc_authority.to_account_info(),
                },
                &[&ctx.accounts.otc_state.authority_seeds()]
            ), ctx.accounts.otc_senior_reserve_token_account.amount)?;
        } else {
            token::transfer(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.otc_junior_reserve_token_account.to_account_info(),
                    to: ctx.accounts.beneficiary_token_account.to_account_info(),
                    authority: ctx.accounts.otc_authority.to_account_info(),
                },
                &[&ctx.accounts.otc_state.authority_seeds()]
            ), ctx.accounts.otc_junior_reserve_token_account.amount)?;
        }
    }
    else {
        return err!(VyperOtcErrorCode::BeneficiaryNotFound);
    }

    Ok(())
}
