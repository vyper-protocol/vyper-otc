import * as anchor from "@project-serum/anchor";
import { AnchorProvider } from "@project-serum/anchor";
import { createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

export type TokenAccountWrapper = {
  reserveMint: PublicKey;
  users: { user: Keypair; tokenAccount: PublicKey }[];
};

export async function createTokenAccountWrapper(provider: AnchorProvider, amounts: number[], decimals: number = 0): Promise<TokenAccountWrapper> {
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();

  // console.log("creating mint");
  const createMintIxs = await createMintInstructions(provider, mint.publicKey, decimals, mintAuthority.publicKey);
  const sig_createMint = await provider.sendAndConfirm(new anchor.web3.Transaction().add(...createMintIxs), [mint]);
  // console.log("sig: " + sig_createMint);

  const res: TokenAccountWrapper = {
    reserveMint: mint.publicKey,
    users: [],
  };

  const mintTx = new anchor.web3.Transaction();
  for (let i = 0; i < amounts.length; i++) {
    const [user, tokenAccount] = await createUserAndTokenAccount(provider, mint.publicKey);
    mintTx.add(createMintToInstruction(mint.publicKey, tokenAccount, mintAuthority.publicKey, amounts[i]));
    res.users.push({
      user,
      tokenAccount,
    });
  }

  // console.log("creating mint & minting");
  const sig = await provider.sendAndConfirm(mintTx, [mintAuthority]);
  // console.log("sig: " + sig);

  return res;
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
      lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
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
