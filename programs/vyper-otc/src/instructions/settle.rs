use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use vyper_core::{state::{TrancheConfig}, program::VyperCore};

#[derive(Accounts)]
pub struct RedeemContext<'info> {
    
    /// Signer account
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Vault Configuration initialized
    #[account(mut,
        has_one = otc_senior_reserve_token_account,
        has_one = otc_junior_reserve_token_account,
        has_one = otc_senior_tranche_token_account,
        has_one = otc_junior_tranche_token_account,
        has_one = otc_authority,
        has_one = vyper_tranche_config)]
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

    /// OTC senior tranche token account
    #[account(mut, token::mint = senior_tranche_mint, token::authority = otc_authority)]
    pub otc_senior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// OTC junior tranche token account
    #[account(mut, token::mint = junior_tranche_mint, token::authority = otc_authority)]
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
    #[account(mut, has_one = reserve_mint, has_one = senior_tranche_mint, has_one = junior_tranche_mint)]
    pub vyper_tranche_config: Box<Account<'info, TrancheConfig>>,

    /// Vyper Core tranche configuration authority
    /// CHECK:
    #[account()]
    pub vyper_tranche_authority: AccountInfo<'info>,

    /// Vyper Core reserve token account
    #[account(mut)]
    pub vyper_reserve: Box<Account<'info, TokenAccount>>,

    /// Vyper Core program
    pub vyper_core: Program<'info, VyperCore>,

    /// Rent program
    pub rent: Sysvar<'info, Rent>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

impl<'info> RedeemContext<'info> {
    
    fn to_vyper_redeem_context(
        &self, is_senior: bool
    ) -> CpiContext<'_, '_, '_, 'info, vyper_core::cpi::accounts::RedeemContext<'info>> {

        let dest_reserve_account = if is_senior {
            &self.otc_senior_reserve_token_account
        } else {
            &self.otc_junior_reserve_token_account
        };

        CpiContext::new(
            self.vyper_core.to_account_info(),
            vyper_core::cpi::accounts::RedeemContext {
                signer: self.otc_authority.to_account_info(),
                tranche_config: self.vyper_tranche_config.to_account_info(),
                tranche_authority: self.vyper_tranche_authority.to_account_info(),
                reserve: self.vyper_reserve.to_account_info(),
                user_reserve_token: dest_reserve_account.to_account_info(),
                senior_tranche_mint: self.senior_tranche_mint.to_account_info(),
                junior_tranche_mint: self.junior_tranche_mint.to_account_info(),
                senior_tranche_source: self.otc_senior_tranche_token_account.to_account_info(),
                junior_tranche_source: self.otc_junior_tranche_token_account.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
        )
    }
}



pub fn handler(ctx: Context<RedeemContext>) -> Result<()> {
    
    // check that assets can be redeemed
    let clock = Clock::get()?;
    if clock.unix_timestamp < ctx.accounts.otc_state.settle_available_from {
        return err!(VyperOtcErrorCode::OtcClosed);
    }

    // TODO: check if settlement has not been executed

    // redeem assets
    vyper_core::cpi::redeem(
        ctx.accounts
            .to_vyper_redeem_context(true)
            .with_signer(&[&ctx.accounts.otc_state.authority_seeds()]),
        vyper_core::instructions::RedeemInput {
            tranche_quantity: [ctx.accounts.otc_senior_tranche_token_account.amount, 0],
        },
    )?;
    vyper_core::cpi::redeem(
        ctx.accounts
            .to_vyper_redeem_context(false)
            .with_signer(&[&ctx.accounts.otc_state.authority_seeds()]),
        vyper_core::instructions::RedeemInput {
            tranche_quantity: [0, ctx.accounts.otc_junior_tranche_token_account.amount],
        },
    )?;

    ctx.accounts.otc_state.settle_executed = true;

    Ok(())
}
