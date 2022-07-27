use crate::{
    errors::{ VyperOtcErrorCode },
    state::{ OtcState }
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use vyper_core::{state::{TrancheConfig}, program::VyperCore};

#[derive(Accounts)]
pub struct DepositContext<'info> {
    
    /// Signer account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// User reserve token account
    #[account(mut, token::mint = reserve_mint)]
    pub beneficiary_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault Configuration initialized
    #[account(mut, has_one = otc_senior_tranche_token_account, has_one = otc_junior_tranche_token_account, has_one = otc_authority, has_one = vyper_tranche_config)]
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
    pub otc_senior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// Vault junior tranche token account
    #[account(token::mint = junior_tranche_mint, token::authority = otc_authority)]
    pub otc_junior_tranche_token_account: Box<Account<'info, TokenAccount>>,

    /// Vyper Core program
    pub vyper_core: Program<'info, VyperCore>,

    /// Rent program
    pub rent: Sysvar<'info, Rent>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

impl<'info> DepositContext<'info> {
    fn to_vyper_deposit_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, vyper_core::cpi::accounts::DepositContext<'info>> {
        CpiContext::new(
            self.vyper_core.to_account_info(),
            vyper_core::cpi::accounts::DepositContext {
                signer: self.payer.to_account_info(),
                tranche_config: self.vyper_tranche_config.to_account_info(),
                tranche_authority: self.vyper_tranche_authority.to_account_info(),
                reserve: self.vyper_reserve.to_account_info(),
                user_reserve_token: self.user_reserve_token_account.to_account_info(),
                senior_tranche_mint: self.senior_tranche_mint.to_account_info(),
                junior_tranche_mint: self.junior_tranche_mint.to_account_info(),
                senior_tranche_dest: self.otc_senior_tranche_token_account.to_account_info(),
                junior_tranche_dest: self.otc_junior_tranche_token_account.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
        )
    }
}


#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, Debug)]
pub struct DepositInputData {
    is_senior_side: bool,
}

pub fn handler(ctx: Context<DepositContext>, input_data: DepositInputData) -> Result<()> {
    
    // check that the selected side is free
    if input_data.is_senior_side {
        if ctx.accounts.otc_state.senior_side_beneficiary.is_some() {
            return err!(VyperOtcErrorCode::SideAlreadyTaken);
        }
    } else {
        if ctx.accounts.otc_state.junior_side_beneficiary.is_some() {
            return err!(VyperOtcErrorCode::SideAlreadyTaken);
        }
    }
    
    // check that the deposits are still open
    let clock = Clock::get()?;
    if clock.unix_timestamp > ctx.accounts.otc_state.deposit_expiration {
        return err!(VyperOtcErrorCode::DepositClosed);
    }

    // deposit tokens on vyper
    let reserve_quantity: [u64;2] = if input_data.is_senior_side {
        [ctx.accounts.otc_state.senior_deposit_amount, 0]
    } else {
        [0, ctx.accounts.otc_state.junior_deposit_amount]
    };
    vyper_core::cpi::deposit(
        ctx.accounts
            .to_vyper_deposit_context(),
        vyper_core::instructions::DepositInput {
            reserve_quantity: reserve_quantity,
        },
    )?;

    // save beneficiary per current side
    if input_data.is_senior_side {
        ctx.accounts.otc_state.senior_side_beneficiary = Some(ctx.accounts.beneficiary_token_account.key());
    } else {
        ctx.accounts.otc_state.junior_side_beneficiary = Some(ctx.accounts.beneficiary_token_account.key());
    }

    Ok(())
}
