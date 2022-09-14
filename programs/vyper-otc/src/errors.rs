use anchor_lang::prelude::*;

#[error_code]
pub enum VyperOtcErrorCode {
    #[msg("generic error")]
    GenericError,
    
    #[msg("initialization error")]
    InitializationError,

    #[msg("side already taken")]
    SideAlreadyTaken,

    #[msg("deposit is open")]
    DepositOpen,

    #[msg("deposit is closed")]
    DepositClosed,
    
    #[msg("both positions taken")]
    BothPositionsTaken,

    #[msg("otc is closed")]
    OtcClosed,

    #[msg("beneficiary not found")]
    BeneficiaryNotFound,
    
    #[msg("settle not executed yet")]
    SettleNotExecutedYet,
    
    #[msg("settle already executed")]
    SettleAlreadyExecuted
}
