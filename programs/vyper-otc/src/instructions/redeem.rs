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
    pub payer: Signer<'info>,

    /// Vault Configuration initialized
    #[account(mut)]
    pub otc_state: Box<Account<'info, OtcState>>,

    /// CHECK: Vault Configuration Authority
    #[account(seeds = [otc_state.key().as_ref(), b"authority".as_ref()], bump)]
    pub otc_authority: AccountInfo<'info>,

    /// Vyper Core Tranche Configuration
    #[account(has_one = reserve_mint, has_one = senior_tranche_mint, has_one = junior_tranche_mint)]
    pub vyper_tranche_config: Box<Account<'info, TrancheConfig>>,
    
    /// Vyper Core tranche configuration authority
    /// CHECK:
    #[account()]
    pub vyper_tranche_authority: AccountInfo<'info>,

    /// Vyper Core reserve token account
    #[account(mut)]
    pub vyper_reserve: Box<Account<'info, TokenAccount>>,

    /// User reserve token account
    #[account(mut, token::authority = payer)]
    pub user_reserve_token_account: Box<Account<'info, TokenAccount>>,

    /// Reserve Token mint
    #[account()]
    pub reserve_mint: Box<Account<'info, Mint>>,

    /// Senior Tranche Token mint
    #[account()]
    pub senior_tranche_mint: Box<Account<'info, Mint>>,

    /// Junior Tranche Token mint
    #[account()]
    pub junior_tranche_mint: Box<Account<'info, Mint>>,

    /// Vault senior tranche token account
    #[account(token::mint = senior_tranche_mint, token::authority = otc_authority)]
    pub senior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault junior tranche token account
    #[account(token::mint = junior_tranche_mint, token::authority = otc_authority)]
    pub junior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault senior tranche token account
    #[account(token::mint = reserve_mint)]
    pub senior_side_beneficiary: Box<Account<'info, TokenAccount>>,

    /// Vault junior tranche token account
    #[account(token::mint = reserve_mint)]
    pub junior_side_beneficiary: Box<Account<'info, TokenAccount>>,

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
    
    fn to_vyper_redeem_senior_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, vyper_core::cpi::accounts::RedeemContext<'info>> {
        CpiContext::new(
            self.vyper_core.to_account_info(),
            vyper_core::cpi::accounts::RedeemContext {
                signer: self.payer.to_account_info(),
                tranche_config: self.vyper_tranche_config.to_account_info(),
                tranche_authority: self.vyper_tranche_authority.to_account_info(),
                reserve: self.vyper_reserve.to_account_info(),
                user_reserve_token: self.senior_side_beneficiary.to_account_info(),
                senior_tranche_mint: self.senior_tranche_mint.to_account_info(),
                junior_tranche_mint: self.junior_tranche_mint.to_account_info(),
                senior_tranche_source: self.senior_tranche_token_account.to_account_info(),
                junior_tranche_source: self.junior_tranche_token_account.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
        )
    }

    fn to_vyper_redeem_junior_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, vyper_core::cpi::accounts::RedeemContext<'info>> {
        CpiContext::new(
            self.vyper_core.to_account_info(),
            vyper_core::cpi::accounts::RedeemContext {
                signer: self.payer.to_account_info(),
                tranche_config: self.vyper_tranche_config.to_account_info(),
                tranche_authority: self.vyper_tranche_authority.to_account_info(),
                reserve: self.vyper_reserve.to_account_info(),
                user_reserve_token: self.junior_side_beneficiary.to_account_info(),
                senior_tranche_mint: self.senior_tranche_mint.to_account_info(),
                junior_tranche_mint: self.junior_tranche_mint.to_account_info(),
                senior_tranche_source: self.senior_tranche_token_account.to_account_info(),
                junior_tranche_source: self.junior_tranche_token_account.to_account_info(),
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
    if clock.unix_timestamp < ctx.accounts.otc_state.otc_expiration {
        return err!(VyperOtcErrorCode::OtcClosed);
    }

    // check beneficiary provided
    if let Some(senior_side_beneficiary) = ctx.accounts.otc_state.senior_side_beneficiary {
        require_keys_eq!(senior_side_beneficiary, ctx.accounts.senior_side_beneficiary.key(), VyperOtcErrorCode::BeneficiaryMismatch);
    } else {
        return err!(VyperOtcErrorCode::InvalidConfiguration)
    }
    if let Some(junior_side_beneficiary) = ctx.accounts.otc_state.junior_side_beneficiary {
        require_keys_eq!(junior_side_beneficiary, ctx.accounts.junior_side_beneficiary.key(), VyperOtcErrorCode::BeneficiaryMismatch);
    } else {
        return err!(VyperOtcErrorCode::InvalidConfiguration)
    }

    // redeem assets
    vyper_core::cpi::redeem(
        ctx.accounts
            .to_vyper_redeem_senior_context()
            .with_signer(&[&ctx.accounts.otc_state.authority_seeds()]),
        vyper_core::instructions::RedeemInput {
            tranche_quantity: [ctx.accounts.senior_tranche_token_account.amount, 0],
        },
    )?;
    vyper_core::cpi::redeem(
        ctx.accounts
            .to_vyper_redeem_junior_context()
            .with_signer(&[&ctx.accounts.otc_state.authority_seeds()]),
        vyper_core::instructions::RedeemInput {
            tranche_quantity: [0, ctx.accounts.junior_tranche_token_account.amount],
        },
    )?;

    Ok(())
}
