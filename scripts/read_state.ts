import * as anchor from "@project-serum/anchor";
import { Program, Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { IDL } from "../target/types/vyper_otc";

const PROGRAM_ID = new PublicKey("8aHSkExY28qCvg4gnTLU7y1Ev6HnpJ1NxuWb9XtEesVt");
const OTC_STATE = new PublicKey("7CFQsEJpZ4M9No3Y6bZZgpQQ8Mg5nmGZPyfCbQcX9Lsw");

const main = async () => {
  const connection = new Connection("https://api.devnet.solana.com");

  const wallet = Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program(IDL, PROGRAM_ID, provider);
  const account = await program.account.otcState.fetch(OTC_STATE);

  console.log("account: ", account);
  console.log("seniorSideBeneficiary: " + account.seniorSideBeneficiary);
  console.log("juniorSideBeneficiary: " + account.juniorSideBeneficiary);
  console.log("otcSeniorTrancheTokenAccount: " + account.otcSeniorTrancheTokenAccount);
  console.log("otcJuniorTrancheTokenAccount: " + account.otcJuniorTrancheTokenAccount);
  console.log("otcSeniorReserveTokenAccount: " + account.otcSeniorReserveTokenAccount);
  console.log("otcJuniorReserveTokenAccount: " + account.otcJuniorReserveTokenAccount);
};

main();
