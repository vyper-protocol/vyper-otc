import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { RateMock, IDL as RateMockIDL } from "../deps/vyper-core/target/types/rate_mock";
import { RedeemLogicVanillaOption, IDL as RedeemLogicVanillaOptionIDL } from "../deps/vyper-core/target/types/redeem_logic_vanilla_option";
import { VyperCore, IDL as VyperCoreIDL } from "../deps/vyper-core/target/types/vyper_core";
import { RateMockPlugin } from "../deps/vyper-core/tests/sdk/plugins/rates/RateMockPlugin";
import { RedeemLogicLendingPlugin } from "../deps/vyper-core/tests/sdk/plugins/redeemLogic/RedeemLogicLendingPlugin";
import { RedeemLogicVanillaOptionPlugin } from "../deps/vyper-core/tests/sdk/plugins/redeemLogic/RedeemLogicVanillaOptionPlugin";
import { createMint } from "../deps/vyper-core/tests/utils";
import { VyperOtc } from "../target/types/vyper_otc";
import sleep from "./utils/sleep";
import { createTokenAccountWrapper } from "./utils/tokenAccount";
import { createVyperCoreTrancheConfig } from "./utils/vyperCore";

const RATE_MOCK_PROGRAM_ID = new PublicKey("FB7HErqohbgaVV21BRiiMTuiBpeUYT8Yw7Z6EdEL7FAG");
const REDEEM_LOGIC_VANILLA_OPTION_PROGRAM_ID = new PublicKey("8fSeRtFseNrjdf8quE2YELhuzLkHV7WEGRPA9Jz8xEVe");

describe("vyper-otc", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VyperOtc as Program<VyperOtc>;
  const vyperCoreProgram = new Program<VyperCore>(VyperCoreIDL, new PublicKey("mb9NrZKiC3ZYUutgGhXwwkAL6Jkvmu5WLDbxWRZ8L9U"), provider);

  const redeemLogicVanillaOptionProgram = new Program<RedeemLogicVanillaOption>(RedeemLogicVanillaOptionIDL, REDEEM_LOGIC_VANILLA_OPTION_PROGRAM_ID, provider);
  const rateMockProgram = new Program<RateMock>(RateMockIDL, RATE_MOCK_PROGRAM_ID, provider);
  const redeemLogic = RedeemLogicVanillaOptionPlugin.create(redeemLogicVanillaOptionProgram, provider);
  const rateMock = RateMockPlugin.create(rateMockProgram, provider);

  it("initialize", async () => {
    const reserveMint = await createMint(provider);
    await rateMock.initialize();
    await redeemLogic.initialize(5000, true, true);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 5;
    const settleAvailableFrom = nowSeconds + 10;

    const tx = await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();
    console.log("tx: ", tx);

    const otcStateAccount = await program.account.otcState.fetchNullable(otcState.publicKey);
    expect(otcStateAccount.depositExpiration.toNumber()).to.be.eq(depositExpiration);
    expect(otcStateAccount.settleAvailableFrom.toNumber()).to.be.eq(settleAvailableFrom);
    expect(otcStateAccount.settleExecuted).to.be.eq(false);
    expect(otcStateAccount.seniorDepositAmount.toNumber()).to.be.eq(seniorDepositAmount);
    expect(otcStateAccount.juniorDepositAmount.toNumber()).to.be.eq(juniorDepositAmount);
    expect(otcStateAccount.seniorSideBeneficiary).to.be.null;
    expect(otcStateAccount.juniorSideBeneficiary).to.be.null;
    expect(otcStateAccount.vyperTrancheConfig.toBase58()).to.be.eql(vyperConfig.trancheConfig.toBase58());
    expect(otcStateAccount.otcSeniorReserveTokenAccount.toBase58()).to.be.eql(otcSeniorReserveTokenAccount.publicKey.toBase58());
    expect(otcStateAccount.otcJuniorReserveTokenAccount.toBase58()).to.be.eql(otcJuniorReserveTokenAccount.publicKey.toBase58());
    expect(otcStateAccount.otcSeniorTrancheTokenAccount.toBase58()).to.be.eql(otcSeniorTrancheTokenAccount.publicKey.toBase58());
    expect(otcStateAccount.otcJuniorTrancheTokenAccount.toBase58()).to.be.eql(otcJuniorTrancheTokenAccount.publicKey.toBase58());
    expect(otcStateAccount.otcAuthority.toBase58()).to.be.eql(otcAuthority.toBase58());
  });

  it("single deposit", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 10;
    const settleAvailableFrom = nowSeconds + 20;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await redeemLogic.initialize(5000, true, true);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    const initTx = await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();
    console.log("init tx: ", initTx);

    const depositTx = await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();
    console.log("deposit tx: ", depositTx);

    // check token transfer
    expect(Number((await getAccount(provider.connection, otcSeniorReserveTokenAccount.publicKey)).amount)).to.be.eq(seniorDepositAmount);
    expect(Number((await getAccount(provider.connection, otcJuniorReserveTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcSeniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcJuniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);

    const otcStateAccount = await program.account.otcState.fetchNullable(otcState.publicKey);
    expect(otcStateAccount.seniorSideBeneficiary.toBase58()).to.be.eql(userA_tokenAccount.toBase58());
    expect(otcStateAccount.juniorSideBeneficiary).to.be.null;
  });

  it("double deposit", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 10;
    const settleAvailableFrom = nowSeconds + 20;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await redeemLogic.initialize(5000, true, true);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    const initTx = await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();
    console.log("init tx: ", initTx);

    const depositATx = await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();
    console.log("deposit A tx: ", depositATx);

    const depositBTx = await program.methods
      .deposit({
        isSeniorSide: false,
      })
      .accounts({
        userReserveTokenAccount: userB_tokenAccount,
        beneficiaryTokenAccount: userB_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userB.publicKey,
      })
      .signers([userB])
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();
    console.log("deposit B tx: ", depositBTx);

    // check token transfer
    expect(Number((await getAccount(provider.connection, otcSeniorReserveTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcJuniorReserveTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcSeniorTrancheTokenAccount.publicKey)).amount)).to.be.gt(0);
    expect(Number((await getAccount(provider.connection, otcJuniorTrancheTokenAccount.publicKey)).amount)).to.be.gt(0);
    expect(Number((await getAccount(provider.connection, vyperConfig.vyperReserve)).amount)).to.be.eq(seniorDepositAmount + juniorDepositAmount);

    const otcStateAccount = await program.account.otcState.fetchNullable(otcState.publicKey);
    expect(otcStateAccount.seniorSideBeneficiary.toBase58()).to.be.eql(userA_tokenAccount.toBase58());
    expect(otcStateAccount.juniorSideBeneficiary.toBase58()).to.be.eql(userB_tokenAccount.toBase58());
  });

  it("settle and claim", async () => {
    // input data
    const seniorDepositAmount = 1;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 8;
    const settleAvailableFrom = nowSeconds + 10;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await rateMock.setFairValue(3000);
    await redeemLogic.initialize(5000, false, true);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    const initTx = await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();
    console.log("init tx: ", initTx);

    const depositATx = await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();
    console.log("user A deposited " + seniorDepositAmount + ". tx: ", depositATx);

    const depositBTx = await program.methods
      .deposit({
        isSeniorSide: false,
      })
      .accounts({
        userReserveTokenAccount: userB_tokenAccount,
        beneficiaryTokenAccount: userB_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userB.publicKey,
      })
      .signers([userB])
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();
    console.log("user B deposited " + juniorDepositAmount + ". tx: ", depositBTx);

    // console.log("senior tranche amount: " + otcSeniorTrancheTokenAccount.publicKey + " -> " + Number((await getAccount(provider.connection, otcSeniorTrancheTokenAccount.publicKey)).amount));
    // console.log("junior tranche amount: " + otcJuniorTrancheTokenAccount.publicKey + " -> " + Number((await getAccount(provider.connection, otcJuniorTrancheTokenAccount.publicKey)).amount));

    while (Math.round(Date.now() / 1000) < settleAvailableFrom + 2) {
      await sleep(1000);
    }

    await rateMock.setFairValue(3500);
    const settleTx = await program.methods
      .settle()
      .accounts({
        otcState: otcState.publicKey,
        otcAuthority,

        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
      })
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();
    console.log("settle tx: ", settleTx);

    expect(Number((await getAccount(provider.connection, otcSeniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcJuniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);

    const claimATx = await program.methods
      .claim()
      .accounts({
        otcAuthority,
        otcState: otcState.publicKey,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();
    console.log("claim A tx: ", claimATx);

    const claimBTx = await program.methods
      .claim()
      .accounts({
        otcAuthority,
        otcState: otcState.publicKey,
        beneficiaryTokenAccount: userB_tokenAccount,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        signer: userB.publicKey,
      })
      .signers([userB])
      .rpc();
    console.log("claim B tx: ", claimBTx);

    console.log("user A claimed: " + Number((await getAccount(provider.connection, userA_tokenAccount)).amount));
    console.log("user B claimed: " + Number((await getAccount(provider.connection, userB_tokenAccount)).amount));

    expect(Number((await getAccount(provider.connection, userA_tokenAccount)).amount)).to.be.gte(0);
    expect(Number((await getAccount(provider.connection, userB_tokenAccount)).amount)).to.be.gte(0);
    expect(Number((await getAccount(provider.connection, otcSeniorReserveTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcJuniorReserveTokenAccount.publicKey)).amount)).to.be.eq(0);
  });

  it("error on double deposit for same side", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 10;
    const settleAvailableFrom = nowSeconds + 20;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await redeemLogic.initialize(5000, true, true);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();

    await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();

    try {
      await program.methods
        .deposit({
          isSeniorSide: true,
        })
        .accounts({
          userReserveTokenAccount: userB_tokenAccount,
          beneficiaryTokenAccount: userB_tokenAccount,
          otcState: otcState.publicKey,
          otcAuthority,
          otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
          otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
          otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
          otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

          reserveMint,
          seniorTrancheMint: vyperConfig.seniorTrancheMint,
          juniorTrancheMint: vyperConfig.juniorTrancheMint,

          vyperTrancheConfig: vyperConfig.trancheConfig,
          vyperTrancheAuthority: vyperConfig.trancheAuthority,
          vyperReserve: vyperConfig.vyperReserve,
          vyperCore: vyperCoreProgram.programId,
          signer: userB.publicKey,
        })
        .signers([userB])
        .preInstructions([
          await rateMock.getRefreshIX(),
          await vyperCoreProgram.methods
            .refreshTrancheFairValue()
            .accounts({
              trancheConfig: vyperConfig.trancheConfig,
              seniorTrancheMint: vyperConfig.seniorTrancheMint,
              juniorTrancheMint: vyperConfig.juniorTrancheMint,
              rateProgramState: rateMock.state,
              redeemLogicProgram: redeemLogic.programID,
              redeemLogicProgramState: redeemLogic.state,
            })
            .instruction(),
        ])
        .rpc();
      expect(true).to.be.false;
    } catch (err) {
      expect(err.error.errorCode.code).to.be.eql("SideAlreadyTaken");
    }
  });

  it("error on settle before expiration", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 8;
    const settleAvailableFrom = nowSeconds + 1000;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await rateMock.setFairValue(8000);
    await redeemLogic.initialize(5000, true, false);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();

    await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();

    await program.methods
      .deposit({
        isSeniorSide: false,
      })
      .accounts({
        userReserveTokenAccount: userB_tokenAccount,
        beneficiaryTokenAccount: userB_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userB.publicKey,
      })
      .signers([userB])
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();

    try {
      await program.methods
        .settle()
        .accounts({
          otcState: otcState.publicKey,
          otcAuthority,

          otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
          otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
          otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
          otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

          reserveMint,
          seniorTrancheMint: vyperConfig.seniorTrancheMint,
          juniorTrancheMint: vyperConfig.juniorTrancheMint,

          vyperTrancheConfig: vyperConfig.trancheConfig,
          vyperTrancheAuthority: vyperConfig.trancheAuthority,
          vyperReserve: vyperConfig.vyperReserve,
          vyperCore: vyperCoreProgram.programId,
        })
        .preInstructions([
          await rateMock.getRefreshIX(),
          await vyperCoreProgram.methods
            .refreshTrancheFairValue()
            .accounts({
              trancheConfig: vyperConfig.trancheConfig,
              seniorTrancheMint: vyperConfig.seniorTrancheMint,
              juniorTrancheMint: vyperConfig.juniorTrancheMint,
              rateProgramState: rateMock.state,
              redeemLogicProgram: redeemLogic.programID,
              redeemLogicProgramState: redeemLogic.state,
            })
            .instruction(),
        ])
        .rpc();
      expect(true).to.be.false;
    } catch (err) {
      expect(err.error.errorCode.code).to.be.eql("OtcClosed");
    }
  });

  it("error on deposit after expiration", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 5;
    const settleAvailableFrom = nowSeconds + 1000;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount]);
    await rateMock.initialize();
    await rateMock.setFairValue(8000);
    await redeemLogic.initialize(5000, true, false);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();

    while (Math.round(Date.now() / 1000) < depositExpiration + 2) {
      await sleep(1000);
    }

    try {
      await program.methods
        .deposit({
          isSeniorSide: true,
        })
        .accounts({
          userReserveTokenAccount: userA_tokenAccount,
          beneficiaryTokenAccount: userA_tokenAccount,
          otcState: otcState.publicKey,
          otcAuthority,
          otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
          otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
          otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
          otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

          reserveMint,
          seniorTrancheMint: vyperConfig.seniorTrancheMint,
          juniorTrancheMint: vyperConfig.juniorTrancheMint,

          vyperTrancheConfig: vyperConfig.trancheConfig,
          vyperTrancheAuthority: vyperConfig.trancheAuthority,
          vyperReserve: vyperConfig.vyperReserve,
          vyperCore: vyperCoreProgram.programId,
          signer: userA.publicKey,
        })
        .signers([userA])
        .rpc();
      expect(true).to.be.false;
    } catch (err) {
      expect(err.msg).to.be.eql("deposit is closed");
    }
  });

  it("error on claim with wrong beneficiary", async () => {
    // input data
    const seniorDepositAmount = 1000;
    const juniorDepositAmount = 1000;
    const nowSeconds = Math.round(Date.now() / 1000); // current UTC timestamp in seconds
    const depositExpiration = nowSeconds + 8;
    const settleAvailableFrom = nowSeconds + 10;

    const {
      reserveMint,
      users: [{ user: userA, tokenAccount: userA_tokenAccount }, { user: userB, tokenAccount: userB_tokenAccount }, { user: userC, tokenAccount: userC_tokenAccount }],
    } = await createTokenAccountWrapper(provider, [seniorDepositAmount, juniorDepositAmount, 1000]);

    await rateMock.initialize();
    await rateMock.setFairValue(8000);
    await redeemLogic.initialize(5000, true, false);

    const otcState = anchor.web3.Keypair.generate();
    const [otcAuthority] = await anchor.web3.PublicKey.findProgramAddress([otcState.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")], program.programId);

    const vyperConfig = await createVyperCoreTrancheConfig(provider, vyperCoreProgram, reserveMint, rateMock.programID, rateMock.state, redeemLogic.programID, redeemLogic.state, otcAuthority);

    // accounts to create
    const otcSeniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorReserveTokenAccount = anchor.web3.Keypair.generate();
    const otcSeniorTrancheTokenAccount = anchor.web3.Keypair.generate();
    const otcJuniorTrancheTokenAccount = anchor.web3.Keypair.generate();

    const initTx = await program.methods
      .initialize({
        seniorDepositAmount: new anchor.BN(seniorDepositAmount),
        juniorDepositAmount: new anchor.BN(juniorDepositAmount),
        depositExpiration: new anchor.BN(depositExpiration),
        settleAvailableFrom: new anchor.BN(settleAvailableFrom),
      })
      .accounts({
        reserveMint,
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
      .signers([otcState, otcSeniorReserveTokenAccount, otcJuniorReserveTokenAccount, otcSeniorTrancheTokenAccount, otcJuniorTrancheTokenAccount])
      .rpc();
    console.log("init tx: ", initTx);

    const depositATx = await program.methods
      .deposit({
        isSeniorSide: true,
      })
      .accounts({
        userReserveTokenAccount: userA_tokenAccount,
        beneficiaryTokenAccount: userA_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userA.publicKey,
      })
      .signers([userA])
      .rpc();
    console.log("deposit A tx: ", depositATx);

    const depositBTx = await program.methods
      .deposit({
        isSeniorSide: false,
      })
      .accounts({
        userReserveTokenAccount: userB_tokenAccount,
        beneficiaryTokenAccount: userB_tokenAccount,
        otcState: otcState.publicKey,
        otcAuthority,
        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
        signer: userB.publicKey,
      })
      .signers([userB])
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();
    console.log("deposit B tx: ", depositBTx);

    while (Math.round(Date.now() / 1000) < settleAvailableFrom + 2) {
      await sleep(1000);
    }

    const settleTx = await program.methods
      .settle()
      .accounts({
        otcState: otcState.publicKey,
        otcAuthority,

        otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
        otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
        otcSeniorTrancheTokenAccount: otcSeniorTrancheTokenAccount.publicKey,
        otcJuniorTrancheTokenAccount: otcJuniorTrancheTokenAccount.publicKey,

        reserveMint,
        seniorTrancheMint: vyperConfig.seniorTrancheMint,
        juniorTrancheMint: vyperConfig.juniorTrancheMint,

        vyperTrancheConfig: vyperConfig.trancheConfig,
        vyperTrancheAuthority: vyperConfig.trancheAuthority,
        vyperReserve: vyperConfig.vyperReserve,
        vyperCore: vyperCoreProgram.programId,
      })
      .preInstructions([
        await rateMock.getRefreshIX(),
        await vyperCoreProgram.methods
          .refreshTrancheFairValue()
          .accounts({
            trancheConfig: vyperConfig.trancheConfig,
            seniorTrancheMint: vyperConfig.seniorTrancheMint,
            juniorTrancheMint: vyperConfig.juniorTrancheMint,
            rateProgramState: rateMock.state,
            redeemLogicProgram: redeemLogic.programID,
            redeemLogicProgramState: redeemLogic.state,
          })
          .instruction(),
      ])
      .rpc();
    console.log("settle tx: ", settleTx);

    expect(Number((await getAccount(provider.connection, otcSeniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);
    expect(Number((await getAccount(provider.connection, otcJuniorTrancheTokenAccount.publicKey)).amount)).to.be.eq(0);

    try {
      await program.methods
        .claim()
        .accounts({
          otcAuthority,
          otcState: otcState.publicKey,
          beneficiaryTokenAccount: userC_tokenAccount,
          otcSeniorReserveTokenAccount: otcSeniorReserveTokenAccount.publicKey,
          otcJuniorReserveTokenAccount: otcJuniorReserveTokenAccount.publicKey,
          signer: userC.publicKey,
        })
        .signers([userC])
        .rpc();
      expect(true).to.be.false;
    } catch (err) {
      expect(err.error.errorCode.code).to.be.eql("BeneficiaryNotFound");
    }
  });
});
