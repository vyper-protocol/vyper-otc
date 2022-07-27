use anchor_lang::prelude::*;

#[error_code]
pub enum VyperOtcErrorCode {
    #[msg("generic error")]
    GenericError,
    
    #[msg("invalid configuration")]
    InvalidConfiguration,

    #[msg("failed to perform some math operation safely")]
    MathError,

    #[msg("initialization error")]
    InitializationError,

    #[msg("invalid input")]
    InvalidInput,

    #[msg("insufficient funds to perform operation")]
    InsufficientFunds,
    
    #[msg("side already taken")]
    SideAlreadyTaken,

    #[msg("deposit is closed")]
    DepositClosed,
    
    #[msg("otc is closed")]
    OtcClosed,

    #[msg("beneficiary mismatch")]
    BeneficiaryMismatch,

}
