use anchor_lang::prelude::*;

#[account]
pub struct OtcState {

    pub created: i64,
    pub deposit_start: i64,
    pub deposit_end: i64,
    pub settle_start: i64,
    pub settle_executed: bool,
    
    pub senior_deposit_amount: u64,
    pub junior_deposit_amount: u64,

    pub senior_side_beneficiary: Option<Pubkey>,
    pub junior_side_beneficiary: Option<Pubkey>,

    pub vyper_tranche_config: Pubkey,
    pub vyper_core: Pubkey,

    pub otc_senior_reserve_token_account: Pubkey,
    pub otc_junior_reserve_token_account: Pubkey,
    pub otc_senior_tranche_token_account: Pubkey,
    pub otc_junior_tranche_token_account: Pubkey,

    pub otc_authority: Pubkey,
    pub authority_seed: Pubkey,
    pub authority_bump: [u8; 1],

    pub description: [u8; 128],

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
    8 + // pub created: i64,
    8 + // pub deposit_start: i64,
    8 + // pub deposit_end: i64,
    8 + // pub settle_start: i64,
    1 + // pub settle_executed: bool,
    8 + // pub senior_deposit_amount: u64,
    8 + // pub junior_deposit_amount: u64,
    1+32 + // pub senior_side_beneficiary: Option<Pubkey>,
    1+32 + // pub junior_side_beneficiary: Option<Pubkey>,
    32 + // pub vyper_tranche_config: Pubkey,
    32 + // pub vyper_core: Pubkey,
    32 + // pub otc_senior_reserve_token_account: Pubkey,
    32 + // pub otc_junior_reserve_token_account: Pubkey,
    32 + // pub otc_senior_tranche_token_account: Pubkey,
    32 + // pub otc_junior_tranche_token_account: Pubkey,
    32 + // pub otc_authority: Pubkey,
    32 + // pub authority_seed: Pubkey,
    1 + // pub authority_bump: [u8; 1],
    128 + // pub description: [u8; 128],
    3 + // pub version: [u8; 3],
    64 // padding
    ;
}