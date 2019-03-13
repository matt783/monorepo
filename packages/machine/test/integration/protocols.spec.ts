import AppRegistry from "@counterfactual/contracts/build/AppRegistry.json";
import ETHBucket from "@counterfactual/contracts/build/ETHBucket.json";
import MultiSend from "@counterfactual/contracts/build/MultiSend.json";
import NonceRegistry from "@counterfactual/contracts/build/NonceRegistry.json";
import ResolveToPay5WeiApp from "@counterfactual/contracts/build/ResolveToPay5WeiApp.json";
import StateChannelTransaction from "@counterfactual/contracts/build/StateChannelTransaction.json";
import { xkeyKthAddress } from "@counterfactual/machine/src";
import { sortAddresses } from "@counterfactual/machine/src/xkeys";
import { AssetType, NetworkContext } from "@counterfactual/types";
import { Contract, ContractFactory, Wallet } from "ethers";
import { AddressZero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { bigNumberify } from "ethers/utils";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { MessageRouter } from "./message-router";
import { MiniNode } from "./mininode";
import { WaffleLegacyOutput } from "./waffle-type";

const JEST_TEST_WAIT_TIME = 50000;

let networkId: number;
let network: NetworkContext;
let provider: JsonRpcProvider;
let wallet: Wallet;
let appDefinition: Contract;

expect.extend({ toBeEq });

beforeAll(async () => {
  [provider, wallet, networkId] = await connectToGanache();

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

  appDefinition = await new ContractFactory(
    ResolveToPay5WeiApp.abi,
    ResolveToPay5WeiApp.bytecode,
    wallet
  ).deploy();
});

describe("Three mininodes", async () => {
  jest.setTimeout(JEST_TEST_WAIT_TIME);

  it("Can run all the protocols", async () => {
    const mininodeA = new MiniNode(network, provider);
    const mininodeB = new MiniNode(network, provider);
    const mininodeC = new MiniNode(network, provider);

    const mr = new MessageRouter([mininodeA, mininodeB, mininodeC]);

    mininodeA.scm = await mininodeA.ie.runSetupProtocol({
      initiatingXpub: mininodeA.xpub,
      respondingXpub: mininodeB.xpub,
      multisigAddress: AddressZero
    });

    // todo: if nodeB/nodeC is still busy doing stuff, we should wait for it

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
      initialState: {
        player1: AddressZero,
        player2: AddressZero,
        counter: 0
      },
      terms: {
        assetType: AssetType.ETH,
        limit: bigNumberify(100),
        token: AddressZero
      },
      appInterface: {
        addr: appDefinition.address,
        stateEncoding:
          "tuple(address player1, address player2, uint256 counter)",
        actionEncoding: "tuple(uint256)"
      },
      defaultTimeout: 40
    });

    const appInstances = mininodeA.scm.get(AddressZero)!.appInstances;
    const [key] = [...appInstances.keys()].filter(key => {
      return (
        key !==
        mininodeA.scm.get(AddressZero)!.toJson().freeBalanceAppIndexes[0][1]
      );
    });

    // increments comes back as 0 and free balance is not decremented

    await mininodeA.ie.runUninstallProtocol(mininodeA.scm, {
      appIdentityHash: key,
      initiatingXpub: mininodeA.xpub,
      respondingXpub: mininodeB.xpub,
      multisigAddress: AddressZero
    });

    mr.assertNoPending();

    mininodeB.scm = await mininodeB.ie.runSetupProtocol({
      initiatingXpub: mininodeB.xpub,
      respondingXpub: mininodeC.xpub,
      multisigAddress: AddressZero
    });
  });
});
