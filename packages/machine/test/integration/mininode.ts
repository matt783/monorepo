import {
  InstructionExecutor,
  Opcode,
  StateChannel
} from "@counterfactual/machine/src";
import { EthereumCommitment } from "@counterfactual/machine/src/ethereum/types";
import { NetworkContext } from "@counterfactual/types";
import { JsonRpcProvider } from "ethers/providers";
import { randomBytes, SigningKey } from "ethers/utils";
import { entropyToMnemonic, fromMnemonic, HDNode } from "ethers/utils/hdnode";

const randomHDNode = () => fromMnemonic(entropyToMnemonic(randomBytes(20)));

/// Returns a function that can be registered with IO_SEND{_AND_WAIT}
const makeSigner = (hdNode: HDNode, asIntermediary: boolean) => {
  return async (args: [EthereumCommitment] | [EthereumCommitment, number]) => {
    if (args.length !== 1 && args.length !== 2) {
      throw Error("OP_SIGN middleware received wrong number of arguments.");
    }

    const [commitment, overrideKeyIndex] = args;
    const keyIndex = overrideKeyIndex || 0;

    const signingKey = new SigningKey(
      hdNode.derivePath(`${keyIndex}`).privateKey
    );

    return signingKey.signDigest(commitment.hashToSign(asIntermediary));
  };
};

export class MiniNode {
  private readonly hdNode: HDNode;
  public readonly ie: InstructionExecutor;
  public scm: Map<string, StateChannel>;
  public readonly xpub: string;

  constructor(
    readonly networkContext: NetworkContext,
    readonly provider: JsonRpcProvider
  ) {
    this.hdNode = randomHDNode();
    this.xpub = this.hdNode.neuter().extendedKey;
    this.scm = new Map<string, StateChannel>();
    this.ie = new InstructionExecutor(networkContext, provider);
    this.ie.register(Opcode.OP_SIGN, makeSigner(this.hdNode, false));
    this.ie.register(
      Opcode.OP_SIGN_AS_INTERMEDIARY,
      makeSigner(this.hdNode, true)
    );
    this.ie.register(Opcode.WRITE_COMMITMENT, () => {});
  }

  public dispatchMessage(message: any) {
    this.ie.runProtocolWithMessage(message, this.scm);
  }
}
