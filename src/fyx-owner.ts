import axios from 'axios';
import { Address, Bn, Bw, KeyPair, Script, Sig, Tx, TxOut } from 'bsv';
import { SignedMessage } from './signed-message';
import orderLockRegex from './order-lock-regex';

export class FyxOwner {
    public keyPairs = new Map<string, KeyPair>();
    private _batonAddress: Address;
    private _batonKeyPair: KeyPair;
    private _paymentAddress: Address;

    constructor(public apiUrl: string, private bip32, public fyxId: string, public userId: string, private keyPair: KeyPair) {
        this._paymentAddress = Address.fromPrivKey(bip32.derive('m/0/0').privKey);
        this._batonKeyPair = bip32.derive('m/1/0').privKey;
        this._batonAddress = Address.fromPrivKey(this._batonKeyPair);
        this.keyPairs.set(this._batonAddress.toTxOutScript(), this._batonKeyPair);
    }

    get batonAddress() {
        return this._batonAddress.toString();
    }

    get paymentAddress() {
        return this._paymentAddress.toString();
    }

    async nextOwner() {
        const { data: { address } } = await axios.post(
            `${this.apiUrl}/accounts/${this.fyxId}/${this.userId}/payment-destination`,
            new SignedMessage({}, this.userId, this.keyPair)
        )
        return address;
    }

    async addDerivations(derivations: string[]) {
        derivations.forEach((d) => {
            if (!d) return;
            let keyPair = KeyPair.fromPrivKey(this.bip32.derive(d).privKey);
            const script = Address.fromPubKey(keyPair.pubKey).toTxOutScript().toHex();
            this.keyPairs.set(script, keyPair)
        });
    }

    async loadDerivations() {
        const { data: derivations } = await axios.post(
            `${this.apiUrl}/accounts/${this.fyxId}/${this.userId}/derivations`,
            new SignedMessage({}, this.userId, this.keyPair)
        )
        derivations.forEach(d => {
            if (this.keyPairs.has(d.script)) return;
            this.keyPairs.set(d.script, KeyPair.fromPrivKey(this.bip32.derive(d.path).privKey));
        })
    }

    async sign(rawtx: string, parents: { satoshis: number, script: string }[], locks: any[]): Promise<string> {
        const tx = Tx.fromHex(rawtx);

        await Promise.all(tx.txIns.map(async (txIn, i) => {
            const lockScript = Script.fromHex(parents[i].script)
            const txOut = TxOut.fromProperties(new Bn(parents[i].satoshis), lockScript);
            const keyPair = this.keyPairs.get(txOut.script.toHex());
            if (!keyPair) return;
            const sig = await tx.asyncSign(keyPair, Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID, i, txOut.script, txOut.valueBn);
            txIn.setScript(new Script().writeBuffer(sig.toTxFormat()).writeBuffer(keyPair.pubKey.toBuffer()));
        }));

        console.log('Signed TX:', tx.toString());
        return tx.toHex();
    }

    getListingBase(): string {
        const tx = new Tx();
        tx.addOutputs(new Bn(546), this._batonAddress.toTxOutScript());
        return tx.toHex();
    }

    getCancelBase() {
        const tx = new Tx();
        tx.addOutputs(new Bn(546), this._batonAddress.toTxOutScript());
        return tx.toHex();
    }

    signOrderLock(rawtx, lockRawTx, isCancel = false) {
        const tx = Tx.fromHex(rawtx);
        const vout = tx.txOuts.findIndex(o => o.script.toHex().match(orderLockRegex));
        if (vout === -1) return;
        const lockTx = Tx.fromHex(lockRawTx);
        const preimage = tx.sighashPreimage(
            Sig.SIGHASH_FORKID | (isCancel ? Sig.SIGHASH_NONE : (Sig.SIGHASH_SINGLE | Sig.SIGHASH_ANYONECANPAY)),
            0,
            lockTx.txOuts[vout].script,
            lockTx.txOuts[vout].valueBn,
            Tx.SCRIPT_ENABLE_SIGHASH_FORKID
        );

        let asm: string;
        if (isCancel) {
            const bw = new Bw();
            tx.txIns.forEach((txIn, i) => {
                if (i < 2) return;
                bw.write(txIn.txHashBuf); // outpoint (1/2)
                bw.writeUInt32LE(txIn.txOutNum); // outpoint (2/2)  
            });
            const prevouts = bw.toBuffer();
            asm = `${preimage.toString('hex')} ${prevouts.toString('hex')} OP_TRUE`;
        } else {
            asm = `${preimage.toString('hex')} 00 OP_FALSE`;
        }

        tx.txIns[2].setScript(Script.fromAsmString(asm));

        return tx.toHex();
    }
}