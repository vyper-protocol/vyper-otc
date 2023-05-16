import { AnchorProvider, Program, Wallet } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { IDL } from "../target/types/vyper_otc";

const PROGRAM_ID = new PublicKey("8aHSkExY28qCvg4gnTLU7y1Ev6HnpJ1NxuWb9XtEesVt");

const main = async () => {
  const provider = AnchorProvider.env();
  const program = new Program(IDL, PROGRAM_ID, provider);
  const allOtcContractAccounts = await program.account.otcState.all();

  console.log("all otc contract accounts size: ", allOtcContractAccounts.length);
  allOtcContractAccounts.forEach((c) => console.log("+ contract pubkey: " + c.publicKey));
};

main();
