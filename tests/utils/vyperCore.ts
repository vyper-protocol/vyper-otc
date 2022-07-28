import * as anchor from "@project-serum/anchor";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { VyperCore } from "../../deps/vyper-core/target/types/vyper_core";

export type VyperCoreTrancheConfig = {
  trancheConfig: PublicKey;
  juniorTrancheMint: PublicKey;
  seniorTrancheMint: PublicKey;
  trancheAuthority: PublicKey;
  vyperReserve: PublicKey;
};

export async function createVyperCoreTrancheConfig(
  provider: AnchorProvider,
  vyperCoreProgram: Program<VyperCore>,
  reserveMint: PublicKey,
  rateProgramID: PublicKey,
  rateState: PublicKey,
  redeemLogicProgramID: PublicKey,
  redeemLogicState: PublicKey,
  trancheConfigOwner: PublicKey
): Promise<VyperCoreTrancheConfig> {
  const juniorTrancheMint = anchor.web3.Keypair.generate();
  const seniorTrancheMint = anchor.web3.Keypair.generate();
  const trancheConfig = anchor.web3.Keypair.generate();

  const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress([trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], vyperCoreProgram.programId);
  const [reserve] = await anchor.web3.PublicKey.findProgramAddress([trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()], vyperCoreProgram.programId);

  const TRANCHE_HALT_FLAGS = {
    NONE: 0,
    HALT_DEPOSITS: 1 << 0,
    HALT_REFRESHES: 1 << 1,
    HALT_REDEEMS: 1 << 2,
  };

  const OWNER_RESTRICTED_IX_FLAGS = {
    NONE: 0,
    DEPOSITS: 1 << 0,
    REFRESHES: 1 << 1,
    REDEEMS: 1 << 2,
  };

  const DEFAULT_VYPER_CORE_INIT_DATA = {
    trancheMintDecimals: 6,
    ownerRestrictedIxs: OWNER_RESTRICTED_IX_FLAGS.DEPOSITS | OWNER_RESTRICTED_IX_FLAGS.REDEEMS,
    haltFlags: TRANCHE_HALT_FLAGS.NONE,
  };

  const vyperInitTx = await vyperCoreProgram.methods
    .initialize(DEFAULT_VYPER_CORE_INIT_DATA)
    .accounts({
      payer: provider.wallet.publicKey,
      owner: trancheConfigOwner,
      trancheConfig: trancheConfig.publicKey,
      trancheAuthority,
      rateProgram: rateProgramID,
      rateProgramState: rateState,
      redeemLogicProgram: redeemLogicProgramID,
      redeemLogicProgramState: redeemLogicState,
      reserveMint,
      reserve,
      juniorTrancheMint: juniorTrancheMint.publicKey,
      seniorTrancheMint: seniorTrancheMint.publicKey,
    })
    .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
    .rpc();
  // console.log("vyper init tx: ", vyperInitTx);
  return {
    juniorTrancheMint: juniorTrancheMint.publicKey,
    seniorTrancheMint: seniorTrancheMint.publicKey,
    trancheAuthority,
    trancheConfig: trancheConfig.publicKey,
    vyperReserve: reserve,
  };
}
