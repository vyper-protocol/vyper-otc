use anchor_lang::prelude::*;

#[account]
pub struct OtcState {

    pub created: i64,
    pub deposit_expiration: i64,
    pub settle_available_from: i64,
    pub settle_executed: bool,
    
    pub senior_deposit_amount: u64,
    pub junior_deposit_amount: u64,

    pub senior_side_beneficiary: Option<Pubkey>,
    pub junior_side_beneficiary: Option<Pubkey>,

    pub vyper_tranche_config: Pubkey,

    pub otc_senior_reserve_token_account: Pubkey,
    pub otc_junior_reserve_token_account: Pubkey,
    pub otc_senior_tranche_token_account: Pubkey,
    pub otc_junior_tranche_token_account: Pubkey,

    pub otc_authority: Pubkey,
    pub authority_seed: Pubkey,
    pub authority_bump: [u8; 1],


    pub version: [u8; 3],
}

impl OtcState {
    pub fn authority_seeds(&self) -> [&[u8]; 3] {
        [
            self.authority_seed.as_ref(),
            b"authority".as_ref(),
            &self.authority_bump,
        ]
    }

    pub const LEN: usize = 8 + // discriminator
    1024 // TODO TBD
    ;
}