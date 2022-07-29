import * as anchor from "@project-serum/anchor";
import { Program, Wallet } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { VyperOtc, IDL as VyperOtcIDL } from "../target/types/vyper_otc";
import { RedeemLogicVanillaOption, IDL as RedeemLogicVanillaOptionIDL } from "../deps/vyper-core/target/types/redeem_logic_vanilla_option";
import { VyperCore, IDL as VyperCoreIDL } from "../deps/vyper-core/target/types/vyper_core";
import { RedeemLogicVanillaOptionPlugin } from "../deps/vyper-core/tests/sdk/plugins/redeemLogic/RedeemLogicVanillaOptionPlugin";
import { createVyperCoreTrancheConfig } from "../tests/utils/vyperCore";
import sleep from "./utils/sleep";

const main = async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VyperOtc as Program<VyperOtc>;

  const eventName = "InitializeEvent";
  console.log("start listening for: " + eventName);
  let listener = program.addEventListener(eventName, (event, slot) => {
    console.log("event on slot: ", slot);
    console.log("received event: ", event);
  });

  while (true) await sleep(500);

  await program.removeEventListener(listener);
};

main();
