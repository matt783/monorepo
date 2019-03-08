import AppRegistry from "@counterfactual/contracts/build/AppRegistry.json";
import ETHBucket from "@counterfactual/contracts/build/ETHBucket.json";
import StateChannelTransaction from "@counterfactual/contracts/build/StateChannelTransaction.json";
import NonceRegistry from "@counterfactual/contracts/build/NonceRegistry.json";

import { AssetType, NetworkContext } from "@counterfactual/types";
import { Contract, Wallet, utils } from "ethers";
import { AddressZero, WeiPerEther } from "ethers/constants";

import { xkeysToSortedKthSigningKeys, InstructionExecutor, Opcode } from "../../src";
import { SetStateCommitment } from "../../src/ethereum";
import { StateChannel } from "../../src/models";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { getRandomHDNodes } from "./random-signing-keys";
import { WaffleLegacyOutput } from "./waffle-type";
import { JsonRpcProvider } from "ethers/providers";
import { SigningKey, bigNumberify } from "ethers/utils";
import { HDNode } from "ethers/utils/hdnode";
import { MiniNode, MessageRouter } from "@counterfactual/machine/test/integration/mininode";

const JEST_TEST_WAIT_TIME = 30000;

let networkId: number;
let wallet: Wallet;
let network: NetworkContext;
let appRegistry: Contract;
let provider: JsonRpcProvider;

expect.extend({ toBeEq });

beforeAll(async () => {
  [provider, wallet, networkId] = await connectToGanache();

  const relevantArtifacts = [
    { contractName: "AppRegistry", ...AppRegistry },
    { contractName: "ETHBucket", ...ETHBucket },
    { contractName: "StateChannelTransaction", ...StateChannelTransaction },
    { contractName: "NonceRegistry", ...NonceRegistry }
    // todo: add more
  ];

  network = {
    ETHBalanceRefund: AddressZero,
    ...relevantArtifacts.reduce(
      (accumulator: { [x: string]: string }, artifact: WaffleLegacyOutput) => ({
        ...accumulator,
        [artifact.contractName as string]: artifact.networks![networkId].address
      }),
      {}
    )
  } as NetworkContext;
});


describe("test", async () => {
  jest.setTimeout(JEST_TEST_WAIT_TIME);

  it("test", async () => {

    const mininodeA = new MiniNode(network, provider);
    const mininodeB = new MiniNode(network, provider);

    const mr = new MessageRouter([mininodeA, mininodeB]);

    mininodeA.scm = await mininodeA.ie.runSetupProtocol({
      initiatingXpub: mininodeA.xpub,
      respondingXpub: mininodeB.xpub,
      multisigAddress: AddressZero
    });

    console.log(mininodeA.scm);
    console.log(mininodeB.scm);

    // todo: if nodeB is still busy doing stuff, we should wait for it

    mr.assertNoPending();

    // await mininodeA.ie.runInstallProtocol(
    //   mininodeA.scm, {
    //     initiatingXpub: mininodeA.xpub,
    //     respondingXpub: mininodeB.xpub,
    //     multisigAddress: AddressZero,
    //     aliceBalanceDecrement: bigNumberify(0),
    //     bobBalanceDecrement: bigNumberify(0),
    //     signingKeys: [],
    //     initialState: {},
    //     terms: {
    //       assetType: AssetType.ETH,
    //       limit: bigNumberify(100),
    //       token: AddressZero
    //     },
    //     appInterface: {
    //       addr: AddressZero,
    //       stateEncoding: "",
    //       actionEncoding: undefined
    //     },
    //     defaultTimeout: 40
    //   }
    // );

  });

});
