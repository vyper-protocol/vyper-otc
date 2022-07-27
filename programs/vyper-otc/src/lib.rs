pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("QRd16aFfip7CEaXZUMQva4p9YYaQSog3ncEDTLoZPsP");

#[program]
pub mod vyper_otc {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializeContext>,
        input_data: InitializeInputData,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, input_data)
    }

    pub fn deposit(
        ctx: Context<DepositContext>,
        input_data: DepositInputData,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, input_data)
    }

    pub fn redeem(
        ctx: Context<RedeemContext>,
    ) -> Result<()> {
        instructions::redeem::handler(ctx)
    }
}
