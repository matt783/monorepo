import AppRegistry from "@counterfactual/contracts/build/AppRegistry.json";
import ETHBucket from "@counterfactual/contracts/build/ETHBucket.json";
import MultiSend from "@counterfactual/contracts/build/MultiSend.json";
import NonceRegistry from "@counterfactual/contracts/build/NonceRegistry.json";
import StateChannelTransaction from "@counterfactual/contracts/build/StateChannelTransaction.json";
import { xkeyKthAddress } from "@counterfactual/machine/src";
import { sortAddresses } from "@counterfactual/machine/src/xkeys";
import { AssetType, NetworkContext } from "@counterfactual/types";
import { AddressZero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { bigNumberify } from "ethers/utils";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { MessageRouter } from "./message-router";
import { MiniNode } from "./mininode";
import { WaffleLegacyOutput } from "./waffle-type";

const JEST_TEST_WAIT_TIME = 30000;

let networkId: number;
let network: NetworkContext;
let provider: JsonRpcProvider;

expect.extend({ toBeEq });

beforeAll(async () => {
  [provider, {}, networkId] = await connectToGanache();

  const relevantArtifacts = [
    { contractName: "AppRegistry", ...AppRegistry },
    { contractName: "ETHBucket", ...ETHBucket },
    { contractName: "StateChannelTransaction", ...StateChannelTransaction },
    { contractName: "NonceRegistry", ...NonceRegistry },
    { contractName: "MultiSend", ...MultiSend }
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

describe("Two mininodes", async () => {
  jest.setTimeout(JEST_TEST_WAIT_TIME);

  it("Can run setup and install", async () => {
    const mininodeA = new MiniNode(network, provider);
    const mininodeB = new MiniNode(network, provider);

    const mr = new MessageRouter([mininodeA, mininodeB]);

    mininodeA.scm = await mininodeA.ie.runSetupProtocol({
      initiatingXpub: mininodeA.xpub,
      respondingXpub: mininodeB.xpub,
      multisigAddress: AddressZero
    });

    // todo: if nodeB is still busy doing stuff, we should wait for it

    mr.assertNoPending();

    const signingKeys = sortAddresses([
      xkeyKthAddress(mininodeA.xpub, 1),
      xkeyKthAddress(mininodeB.xpub, 1)
    ]);
    await mininodeA.ie.runInstallProtocol(mininodeA.scm, {
      signingKeys,
      initiatingXpub: mininodeA.xpub,
      respondingXpub: mininodeB.xpub,
      multisigAddress: AddressZero,
      aliceBalanceDecrement: bigNumberify(0),
      bobBalanceDecrement: bigNumberify(0),
      initialState: {},
      terms: {
        assetType: AssetType.ETH,
        limit: bigNumberify(100),
        token: AddressZero
      },
      appInterface: {
        addr: AddressZero,
        stateEncoding: "",
        actionEncoding: undefined
      },
      defaultTimeout: 40
    });
  });
});
