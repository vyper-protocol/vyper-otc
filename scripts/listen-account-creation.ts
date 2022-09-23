import * as anchor from "@project-serum/anchor";
import { Program, Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { IDL } from "../target/types/vyper_otc";
import { VyperCore, IDL as VyperCoreIDL } from "../deps/vyper-core/target/types/vyper_core";

const PROGRAM_ID = new PublicKey("8aHSkExY28qCvg4gnTLU7y1Ev6HnpJ1NxuWb9XtEesVt");

const main = async () => {
  console.log("listen account creation launched");

  const connection = new Connection("http://localhost:8899");

  const provider = new anchor.AnchorProvider(connection, new Wallet(Keypair.generate()), {
    commitment: "confirmed",
  });
  const program = new Program(IDL, PROGRAM_ID, provider);
  const vyperCoreProgram = new Program<VyperCore>(
    VyperCoreIDL,
    new PublicKey("mb9NrZKiC3ZYUutgGhXwwkAL6Jkvmu5WLDbxWRZ8L9U"),
    provider
  );

  program.addEventListener("InitializeEvent", async (e, s) => {
    console.log("⭐️ ⭐️ new account created");

    const accountDataInfo = await program.account.otcState.fetch(e["otcState"]);
    const vyperCoreAccountDataInfo = await vyperCoreProgram.account.trancheConfig.fetch(
      accountDataInfo.vyperTrancheConfig
    );

    console.log("⭐️ 🔥 redeemLogicProgram: " + vyperCoreAccountDataInfo.redeemLogicProgram);
    console.log("⭐️ 🔥 redeemLogicProgramState: " + vyperCoreAccountDataInfo.redeemLogicProgramState);
  });

  console.log("listen account creation completed");
};

main();
