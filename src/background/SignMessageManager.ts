import * as events from 'events';
import { AppState } from '../lib/MemStore';
import PopupManager from '../background/PopupManager';
import { DeployUtil, encodeBase16 } from 'casper-client-sdk';

export type deployStatus = 'unsigned' | 'signed' | 'failed';
export interface deployWithID {
  id: number;
  status: deployStatus;
  deploy: DeployUtil.Deploy | undefined;
  signingKey: string;
  error?: Error;
}

export interface DeployData {
  deployHash: string;
  signingKey: string;
  account: string;
  timestamp: string;
  chainName: string;
  deployType: string;
  gasPrice: number;
  payment: string;
}

/**
 * Sign Message Manager
 *                      TODO: Update these docs
 * Algorithm:
 *    1. Injected script call `SignMessageManager.addUnsignedMessageAsync`, we return a Promise, inside the Promise, we will
 *       construct a message and assign it a unique id msgId and then we set up a event listen for `${msgId}:finished`.
 *       Resolve or reject when the event emits.
 *    2. Popup call `SignMessageManager.{rejectMsg|approveMsg}` either to reject or commit the signature request,
 *       and both methods will fire a event `${msgId}:finished`, which is listened by step 1.
 *
 * Important to Note:
 *    Any mention of PublicKey below will refer to the hex-encoded bytes of the Public Key prefixed with 01 or 02
 *    to denote the algorithm used to generate the key.
 *          01 - ed25519
 *          02 - secp256k1
 *
 */
export default class SignMessageManager extends events.EventEmitter {
  private unsignedDeploys: deployWithID[];
  private nextId: number;
  private popupManager: PopupManager;

  constructor(private appState: AppState) {
    super();
    this.unsignedDeploys = [];
    this.nextId = Math.round(Math.random() * Number.MAX_SAFE_INTEGER);
    this.popupManager = new PopupManager();
  }

  /**
   * Helper function to generate IDs to tag deploys with
   * @returns {number} id
   */
  private createId() {
    this.nextId = this.nextId % Number.MAX_SAFE_INTEGER;
    return this.nextId++;
  }

  /**
   * Checks given deploy for signatures
   * @param {DeployUtil.Deploy} deploy
   */
  private checkDeployForSignatures(deploy: DeployUtil.Deploy) {
    // TODO: Implement
  }

  /**
   * Update the AppState with the new list of unsigned deploys.
   * Pushes new state to popup.
   */
  private updateAppState() {
    this.appState.unsignedDeploys.replace(this.unsignedDeploys);
  }

  /**
   * Adds the unsigned deploy to the app's queue.
   * @param {JSON} deployJson
   * @returns {number} id for added deploy
   */
  public addUnsignedDeployToQueue(deployJson: JSON, publicKey: string): number {
    const id: number = this.createId();

    try {
      this.unsignedDeploys.push({
        id: id,
        status: 'unsigned',
        deploy: DeployUtil.deployFromJson(deployJson),
        signingKey: publicKey
      });
    } catch (err) {
      this.unsignedDeploys.push({
        id: id,
        status: 'failed',
        deploy: undefined,
        signingKey: publicKey,
        error: err
      });
    }

    this.updateAppState();
    return id;
  }

  /**
   * Signs unsigned deploys from the app's queue
   * @param {DeployUtil.Deploy} deploy
   * @param {string} publicKey in hex format with algorithm prefix byte.
   * @returns {JSON} Signed deploy in JSON format
   */
  public signDeploy(
    deploy: JSON,
    publicKey: string // hex-encoded PublicKey bytes with algo prefix
  ): Promise<JSON> {
    return new Promise((resolve, reject) => {
      // Adding the deploy to the queue will update the extension state and UI
      const deployId = this.addUnsignedDeployToQueue(deploy, publicKey);
      this.popupManager.openPopup('sign');
      // Await outcome of user interaction with popup.
      this.once(`${deployId}:finished`, processedDeploy => {
        switch (processedDeploy.status) {
          case 'signed':
            return resolve(processedDeploy.deploy); // TODO: Return signed deploy JSON
          case 'failed':
            return reject(
              new Error(processedDeploy.errMsg! ?? 'User Cancelled Signing')
            );
          default:
            return reject(
              new Error(
                `Signer: Unknown error occurred. Deploy data: ${processedDeploy.toString()}`
              )
            );
        }
      });
    });
  }

  /**
   * Sets the status and errors fields for the rejected deploy.
   * @param deployId ID to identify deploy from queue
   */
  public rejectSignDeploy(deployId: number) {
    const deploy = this.getDeployById(deployId);
    deploy.status = 'failed';
    deploy.error = new Error('User Cancelled Signing');
    let deployIndex = this.unsignedDeploys.indexOf(deploy);
    if (deployIndex > -1) {
      this.unsignedDeploys.splice(deployIndex, 1);
    }
    console.log(deploy.deploy);
    this.saveAndEmitEventIfNeeded(deploy);
    console.log(`After: ${this.appState.unsignedDeploys}`);
    this.popupManager.closePopup();
  }

  /**
   * Retrieve the active public key from vault.
   * Will reject if:
   *  - The Signer is not connected.
   *  - There is no account in the vault.
   * @returns Active public key - hex-encoded with algorithm prefix
   */
  public getActivePublicKey() {
    return new Promise<string>((resolve, reject) => {
      let publicKey = this.appState.selectedUserAccount?.KeyPair.publicKey;
      if (!this.appState.connectionStatus) {
        return reject(new Error('Please connect to the Signer first.'));
      } else if (publicKey === undefined) {
        return reject(new Error('Please create an account first.'));
      }
      if (publicKey.isEd25519()) {
        return resolve(publicKey.toAccountHex());
      } else if (publicKey.isSecp256K1()) {
        return resolve(publicKey.toAccountHex());
      } else {
        return reject(new Error('Key was not of expected format!'));
      }
    });
  }

  /**
   * Get deploy from queue by ID
   * @param deployId
   * @throws Error if there is no deploy with the given ID.
   */
  private getDeployById(deployId: number): deployWithID {
    let deploy = this.unsignedDeploys.find(data => data.id === deployId);
    if (deploy === undefined) {
      throw new Error(`Could not find deploy with id: ${deployId}`);
    }
    return deploy;
  }

  // Approve signature request
  public async approveSignDeploy(deployId: number) {
    const deployData = this.getDeployById(deployId);
    if (!this.appState.selectedUserAccount) {
      throw new Error(`No Active Account!`);
    }
    let activeKeyPair = this.appState.selectedUserAccount.KeyPair;
    if (!deployData.deploy) {
      deployData.error = new Error('Cannot sign null deploy!');
      this.saveAndEmitEventIfNeeded(deployData);
      return;
    }

    // Reject if user switches keys during signing process
    if (
      deployData.signingKey &&
      activeKeyPair.publicKey.toAccountHex() !== deployData.signingKey
    ) {
      deployData.status = 'failed';
      deployData.error = new Error('Active key changed during signing');
      this.saveAndEmitEventIfNeeded(deployData);
      return;
    }

    DeployUtil.signDeploy(deployData.deploy, activeKeyPair);

    deployData.status = 'signed';
    this.saveAndEmitEventIfNeeded(deployData);
  }

  public parseDeployData(deployId: number): DeployData {
    let deploy = this.unsignedDeploys.find(
      deployWithId => deployWithId.id === deployId
    );
    if (deploy !== undefined && deploy.deploy !== undefined) {
      let header = deploy.deploy.header;
      // let type = deploy.deploy.isTransfer()
      //   ? 'Transfer'
      //   : deploy.deploy.session.isModuleBytes()
      //   ? 'Contract Call'
      //   : 'Contract Deployment';
      return {
        deployHash: encodeBase16(deploy.deploy.hash),
        signingKey: deploy.signingKey,
        account: header.account.toAccountHex(),
        chainName: header.chainName,
        timestamp: new Date(header.timestamp).toLocaleString(),
        gasPrice: header.gasPrice,
        payment: encodeBase16(deploy.deploy.payment.toBytes()),
        deployType: deploy.deploy.isTransfer() ? 'Transfer' : 'Contract'
      };
    } else {
      throw new Error('Deploy undefined!');
    }
  }

  private saveAndEmitEventIfNeeded(deploy: deployWithID) {
    let status = deploy.status;
    this.updateDeployWithId(deploy);
    if (status === 'failed' || status === 'signed') {
      // fire finished event, so that the Promise can resolve and return result to RPC caller
      this.emit(`${deploy.id}:finished`, deploy);
    }
  }

  private updateDeployWithId(deploy: deployWithID) {
    const index = this.unsignedDeploys.findIndex(
      deployData => deployData.id === deploy.id
    );
    if (index === -1) {
      throw new Error(`Could not find message with id: ${deploy.id}`);
    }
    this.unsignedDeploys[index] = deploy;
    this.updateAppState();
  }
}
