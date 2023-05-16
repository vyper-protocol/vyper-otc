pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("8aHSkExY28qCvg4gnTLU7y1Ev6HnpJ1NxuWb9XtEesVt");

#[program]
pub mod vyper_otc {
    use super::*;

    #[access_control(pre_ix("initialize"))]
    pub fn initialize(
        ctx: Context<InitializeContext>,
        input_data: InitializeInputData,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, input_data)
    }

    #[access_control(pre_ix("deposit"))]
    pub fn deposit(
        ctx: Context<DepositContext>,
        input_data: DepositInputData,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, input_data)
    }

    #[access_control(pre_ix("withdraw"))]
    pub fn withdraw(
        ctx: Context<WithdrawContext>,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    #[access_control(pre_ix("settle"))]
    pub fn settle(
        ctx: Context<RedeemContext>,
    ) -> Result<()> {
        instructions::settle::handler(ctx)
    }

    #[access_control(pre_ix("claim"))]
    pub fn claim(
        ctx: Context<ClaimContext>,
    ) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    #[access_control(pre_ix("close"))]
    pub fn close(
        ctx: Context<CloseContext>,
    ) -> Result<()> {
        instructions::close::handler(ctx)
    }
}


fn pre_ix(_method_name:&str) -> Result<()> {
    #[cfg(feature = "env-log")]
    {
        msg!("env data:");
        msg!("+ pkg name: {:?}", env!("CARGO_PKG_NAME"));
        msg!("+ pkg description: {:?}", env!("CARGO_PKG_DESCRIPTION"));
        msg!("+ pkg version: {:?}", env!("CARGO_PKG_VERSION"));
    }

    Ok(())
}