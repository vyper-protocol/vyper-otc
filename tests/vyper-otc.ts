import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { VyperOtc } from "../target/types/vyper_otc";

describe("vyper-otc", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.VyperOtc as Program<VyperOtc>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
