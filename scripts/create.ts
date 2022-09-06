import * as anchor from "@project-serum/anchor";
import { Program, Wallet } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { VyperOtc, IDL as VyperOtcIDL } from "../target/types/vyper_otc";
import {
  RedeemLogicVanillaOption,
  IDL as RedeemLogicVanillaOptionIDL,
} from "../deps/vyper-core/target/types/redeem_logic_vanilla_option";
import { VyperCore, IDL as VyperCoreIDL } from "../deps/vyper-core/target/types/vyper_core";
import { RedeemLogicVanillaOptionPlugin } from "../deps/vyper-core/tests/sdk/plugins/redeemLogic/RedeemLogicVanillaOptionPlugin";
import { createVyperCoreTrancheConfig } from "../tests/utils/vyperCore";

const RESERVE_MINT = new PublicKey("7XSvJnS19TodrQJSbjUR6tEGwmYyL1i9FX7Z5ZQHc53W");

const RATE_PLUGIN_PROGRAM_ID = new PublicKey("FB7HErqohbgaVV21BRiiMTuiBpeUYT8Yw7Z6EdEL7FAG");
const RATE_PLUGIN_STATE = new PublicKey("FqHZoATTfecQ9qzNcp4cqLm2rooxWaejm5Su2S4PfAJ");

const REDEEM_LOGIC_VANILLA_OPTION_PROGRAM_ID = new PublicKey("8fSeRtFseNrjdf8quE2YELhuzLkHV7WEGRPA9Jz8xEVe");

const STRIKE = 5000;
const IS_CALL = true;
const IS_LINEAR = false;
const USER_A_DEPOSIT_AMOUNT = 1000;
const USER_B_DEPOSIT_AMOUNT = 1000;
const DEPOSIT_EXPIRATION_FROM_NOW_S = 60 * 60;
const SETTLE_AVAILABLE_FROM_NOW_S = 60 * 60 * 24;

const main = async () => {
  const connection = new Connection("https://api.devnet.solana.com");

  const wallet = Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const redeemLogicVanillaOptionProgram = new Program<RedeemLogicVanillaOption>(
    RedeemLogicVanillaOptionIDL,
    REDEEM_LOGIC_VANILLA_OPTION_PROGRAM_ID,
    provider
  );
  const redeemLogic = RedeemLogicVanillaOptionPlugin.create(redeemLogicVanillaOptionProgram, provider);

  const program = new Program<VyperOtc>(
    VyperOtcIDL,
    new PublicKey("8aHSkExY28qCvg4gnTLU7y1Ev6HnpJ1NxuWb9XtEesVt"),
    provider
  );
  const vyperCoreProgram = new Program<VyperCore>(
    VyperCoreIDL,
    new PublicKey("mb9NrZKiC3ZYUutgGhXwwkAL6Jkvmu5WLDbxWRZ8L9U"),
    provider
  );

  const otcState = anchor.web3.Keypair.generate();
  const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress(
    [otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
    program.programId
  );

  await redeemLogic.initialize(STRIKE, IS_CALL, IS_LINEAR);

  const vyperConfig = await createVyperCoreTrancheConfig(
    provider,
    vyperCoreProgram,
    RESERVE_MINT,
    RATE_PLUGIN_PROGRAM_ID,
    RATE_PLUGIN_STATE,
    redeemLogic.programID,
    redeemLogic.state,
    otcAuthority
  );

  // accounts to create
  const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
  const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
  const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
  const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

  // input data

  const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
  const depositEnd = nowSeconds + DEPOSIT_EXPIRATION_FROM_NOW_S;
  const settleStart = nowSeconds + SETTLE_AVAILABLE_FROM_NOW_S;

  const tx = await program.methods
    .initialize({
      seniorDepositAmount: new anchor.BN(USER_A_DEPOSIT_AMOUNT),
      juniorDepositAmount: new anchor.BN(USER_B_DEPOSIT_AMOUNT),
      depositStart: null,
      depositEnd: new anchor.BN(depositEnd),
      settleStart: new anchor.BN(settleStart),
      description: new Array(128).fill(0),
    })
    .accounts({
      reserveMint: RESERVE_MINT,
      otcAuthority,
      otcState: otcState.publicKey,
      seniorTrancheMint: vyperConfig.seniorTrancheMint,
      juniorTrancheMint: vyperConfig.juniorTrancheMint,

      otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
      otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
      otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
      otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,
      vyperTrancheConfig: vyperConfig.trancheConfig,
    })
    .signers([
      otcState,
      otcSeniorReserveTokenAccount,
      otcJuniorReserveTokenAccount,
      otcSeniorTrancheTokenAccount,
      otcJuniorTrancheTokenAccount,
    ])
    .rpc();
  console.log("tx: " + tx);

  console.log("otc state: " + otcState.publicKey);
};

main();
