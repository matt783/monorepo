import {
  InstructionExecutor,
  Opcode,
  StateChannel
} from "@counterfactual/machine/src";
import { NetworkContext } from "@counterfactual/types";
import { utils } from "ethers";
import { JsonRpcProvider } from "ethers/providers";
import { SigningKey } from "ethers/utils";
import { HDNode } from "ethers/utils/hdnode";

const randomHDNode = () =>
  utils.HDNode.fromMnemonic(
    utils.HDNode.entropyToMnemonic(utils.randomBytes(20))
  );

const makeSigner = (signer: HDNode) => (asIntermediary: boolean) => {
  return async (args: any[]) => {
    if (args.length !== 1 && args.length !== 2) {
      throw Error("OP_SIGN middleware received wrong number of arguments.");
    }

    const [commitment, overrideKeyIndex] = args;
    const keyIndex = overrideKeyIndex || 0;

    const signingKey = new SigningKey(
      signer.derivePath(`${keyIndex}`).privateKey
    );

    return signingKey.signDigest(commitment.hashToSign(asIntermediary));
  };
};

export class MiniNode {
  private readonly signer: Function;
  public readonly ie: InstructionExecutor;
  public scm: Map<string, StateChannel>;
  public readonly xpub: string;

  constructor(
    readonly networkContext: NetworkContext,
    readonly provider: JsonRpcProvider
  ) {
    const hd = randomHDNode();
    this.signer = makeSigner(hd);
    this.xpub = hd.neuter().extendedKey;
    this.scm = new Map<string, StateChannel>();
    this.ie = new InstructionExecutor(networkContext, provider);
    this.ie.register(Opcode.OP_SIGN, this.signer(false));
    this.ie.register(Opcode.OP_SIGN_AS_INTERMEDIARY, this.signer(true));
    this.ie.register(Opcode.WRITE_COMMITMENT, () => {});
  }

  public dispatchMessage(message: any) {
    this.ie.runProtocolWithMessage(message, this.scm);
  }
}

/// copied from node
/// see also: https://twitter.com/joseph_silber/status/809176159858655234
class Deferred<T> {
  private internalPromise: Promise<T>;
  private internalResolve!: (value?: T | PromiseLike<T>) => void;
  private internalReject!: (reason?: any) => void;

  constructor() {
    this.internalPromise = new Promise<T>((resolve, reject) => {
      this.internalResolve = resolve;
      this.internalReject = reject;
    });
  }

  get promise(): Promise<T> {
    return this.internalPromise;
  }

  resolve = (value?: T | PromiseLike<T>): void => {
    this.internalResolve(value);
  };

  reject = (reason?: any): void => {
    this.internalReject(reason);
  };
}

export class MessageRouter {
  private nodesMap: Map<string, MiniNode>;
  private deferrals: Map<string, Deferred<any>>;

  constructor(nodes: MiniNode[]) {
    this.nodesMap = new Map<string, MiniNode>();
    this.deferrals = new Map<string, Deferred<any>>();

    for (const node of nodes) {
      this.nodesMap.set(node.xpub, node);

      node.ie.register(Opcode.IO_SEND, (args: any[]) => {
        const [message] = args;
        this.routeMessage(message);
      });
      node.ie.register(Opcode.IO_SEND_AND_WAIT, async (args: any[]) => {
        const [message] = args;
        message.fromXpub = node.xpub;
        const { toXpub } = message;

        if (!toXpub) {
          throw Error("oops");
        }

        this.deferrals.set(node.xpub, new Deferred());
        this.routeMessage(message);
        const ret = await this.deferrals.get(node.xpub)!.promise;
        this.deferrals.delete(node.xpub);

        return ret;
      });
    }
  }

  private routeMessage(message: any) {
    const { toXpub } = message;
    if (toXpub === undefined) {
      throw Error("oops");
    }
    const deferred = this.deferrals.get(toXpub);

    if (deferred === undefined) {
      const toNode = this.nodesMap.get(toXpub);
      if (toNode === undefined) {
        throw Error("oops!");
      }
      toNode.dispatchMessage(message);
      return;
    }

    deferred.resolve(message);
  }

  public assertNoPending() {
    if (this.deferrals.size !== 0) {
      throw Error("oops");
    }
  }
}
