use anchor_lang::prelude::*;

#[error_code]
pub enum VyperOtcErrorCode {
    #[msg("generic error")]
    GenericError,
    
    #[msg("initialization error")]
    InitializationError,

    #[msg("side already taken")]
    SideAlreadyTaken,

    #[msg("deposit is closed")]
    DepositClosed,
    
    #[msg("otc is closed")]
    OtcClosed,

    #[msg("beneficiary not found")]
    BeneficiaryNotFound,
    
    #[msg("settle not executed yet")]
    SettleNotExecutedYet,
    
    #[msg("settle already executed")]
    SettleAlreadyExecuted
}
