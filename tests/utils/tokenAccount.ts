import * as anchor from "@project-serum/anchor";
import { AnchorProvider } from "@project-serum/anchor";
import { createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

export type TokenAccountWrapper = {
  reserveMint: PublicKey;
  userA: Keypair;
  userA_tokenAccount: PublicKey;
  userB: Keypair;
  userB_tokenAccount: PublicKey;
};

export async function createTokenAccountWrapper(provider: AnchorProvider, userA_amount: number, userB_amount: number, decimals: number = 0): Promise<TokenAccountWrapper> {
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();

  // console.log("creating mint");
  const createMintIxs = await createMintInstructions(provider, mint.publicKey, decimals, mintAuthority.publicKey);
  const sig_createMint = await provider.sendAndConfirm(new anchor.web3.Transaction().add(...createMintIxs), [mint]);
  // console.log("sig: " + sig_createMint);

  // token account A
  // console.log("creating user A");
  const [userA, userA_tokenAccount] = await createUserAndTokenAccount(provider, mint.publicKey);
  // console.log("creating user B");
  const [userB, userB_tokenAccount] = await createUserAndTokenAccount(provider, mint.publicKey);

  // console.log("creating mint & minting");
  const sig = await provider.sendAndConfirm(
    new anchor.web3.Transaction()
      .add(createMintToInstruction(mint.publicKey, userA_tokenAccount, mintAuthority.publicKey, userA_amount))
      .add(createMintToInstruction(mint.publicKey, userB_tokenAccount, mintAuthority.publicKey, userB_amount)),
    [mintAuthority]
  );
  // console.log("sig: " + sig);

  return {
    reserveMint: mint.publicKey,
    userA,
    userA_tokenAccount,
    userB,
    userB_tokenAccount,
  };
}

async function createUserAndTokenAccount(provider: anchor.AnchorProvider, mint: anchor.web3.PublicKey): Promise<[Keypair, PublicKey]> {
  const userKP = Keypair.generate();
  const user_aToken = await getAssociatedTokenAddress(mint, userKP.publicKey);
  // console.log("user: " + userKP.publicKey);
  // console.log("user_aToken: " + user_aToken);
  const tx = new anchor.web3.Transaction();
  tx.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: userKP.publicKey,
      lamports: anchor.web3.LAMPORTS_PER_SOL,
    })
  );
  tx.add(createAssociatedTokenAccountInstruction(provider.wallet.publicKey, user_aToken, userKP.publicKey, mint));

  const sig = await provider.sendAndConfirm(tx);
  // console.log("tx: " + sig);
  return [userKP, user_aToken];
}

export async function createMintInstructions(provider: anchor.AnchorProvider, mint: anchor.web3.PublicKey, decimals: number, authority: anchor.web3.PublicKey) {
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint, decimals, authority, null),
  ];
}
