use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, self, Transfer};

#[derive(Accounts)]
pub struct ClaimContext<'info> {

    /// Vault Configuration initialized
    #[account(has_one = otc_senior_reserve_token_account, has_one = otc_junior_reserve_token_account)]
    pub otc_state: Box<Account<'info, OtcState>>,

    /// CHECK: Vault Configuration Authority
    #[account(seeds = [otc_state.key().as_ref(), b"authority".as_ref()], bump)]
    pub otc_authority: AccountInfo<'info>,

    /// User reserve token account
    #[account(mut, token::authority = signer)]
    pub beneficiary_token_account: Box<Account<'info, TokenAccount>>,

    // - - - - - - - - - - - - 
    // OTC Token Accounts

    /// Vault senior reserve token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_senior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault junior reserve token account
    #[account(mut, token::authority = otc_authority)]
    pub otc_junior_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,
    
    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,
}

impl<'info> ClaimContext<'info> {
    
}

pub fn handler(ctx: Context<ClaimContext>) -> Result<()> {
    
    // check that assets can be redeemed
    require!(ctx.accounts.otc_state.settle_executed, VyperOtcErrorCode::SettleNotExecutedYet);

    // check beneficiary provided

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
