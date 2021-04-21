"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FyxOwner = void 0;
const axios_1 = __importDefault(require("axios"));
const bsv_1 = require("bsv");
const signed_message_1 = require("./signed-message");
const order_lock_regex_1 = __importDefault(require("./order-lock-regex"));
class FyxOwner {
    constructor(apiUrl, bip32, fyxId, userId, keyPair) {
        this.apiUrl = apiUrl;
        this.bip32 = bip32;
        this.fyxId = fyxId;
        this.userId = userId;
        this.keyPair = keyPair;
        this.keyPairs = new Map();
        this._paymentAddress = bsv_1.Address.fromPrivKey(bip32.derive('m/0/0').privKey);
        this._batonKeyPair = bip32.derive('m/1/0').privKey;
        this._batonAddress = bsv_1.Address.fromPrivKey(this._batonKeyPair);
        this.keyPairs.set(this._batonAddress.toTxOutScript(), this._batonKeyPair);
    }
    get batonAddress() {
        return this._batonAddress.toString();
    }
    get paymentAddress() {
        return this._paymentAddress.toString();
    }
    async nextOwner() {
        const { data: { address } } = await axios_1.default.post(`${this.apiUrl}/accounts/${this.fyxId}/${this.userId}/payment-destination`, new signed_message_1.SignedMessage({}, this.userId, this.keyPair));
        return address;
    }
    async addDerivations(derivations) {
        derivations.forEach((d) => {
            if (!d)
                return;
            let keyPair = bsv_1.KeyPair.fromPrivKey(this.bip32.derive(d).privKey);
            const script = bsv_1.Address.fromPubKey(keyPair.pubKey).toTxOutScript().toHex();
            this.keyPairs.set(script, keyPair);
        });
    }
    async loadDerivations() {
        const { data: derivations } = await axios_1.default.post(`${this.apiUrl}/accounts/${this.fyxId}/${this.userId}/derivations`, new signed_message_1.SignedMessage({}, this.userId, this.keyPair));
        derivations.forEach(d => {
            if (this.keyPairs.has(d.script))
                return;
            this.keyPairs.set(d.script, bsv_1.KeyPair.fromPrivKey(this.bip32.derive(d.path).privKey));
        });
    }
    async sign(rawtx, parents, locks) {
        const tx = bsv_1.Tx.fromHex(rawtx);
        await Promise.all(tx.txIns.map(async (txIn, i) => {
            const lockScript = bsv_1.Script.fromHex(parents[i].script);
            const txOut = bsv_1.TxOut.fromProperties(new bsv_1.Bn(parents[i].satoshis), lockScript);
            const keyPair = this.keyPairs.get(txOut.script.toHex());
            if (!keyPair)
                return;
            const sig = await tx.asyncSign(keyPair, bsv_1.Sig.SIGHASH_ALL | bsv_1.Sig.SIGHASH_FORKID, i, txOut.script, txOut.valueBn);
            txIn.setScript(new bsv_1.Script().writeBuffer(sig.toTxFormat()).writeBuffer(keyPair.pubKey.toBuffer()));
        }));
        console.log('Signed TX:', tx.toString());
        return tx.toHex();
    }
    getListingBase() {
        const tx = new bsv_1.Tx();
        tx.addOutputs(new bsv_1.Bn(546), this._batonAddress.toTxOutScript());
        return tx.toHex();
    }
    getCancelBase() {
        const tx = new bsv_1.Tx();
        tx.addOutputs(new bsv_1.Bn(546), this._batonAddress.toTxOutScript());
        return tx.toHex();
    }
    signOrderLock(rawtx, lockRawTx, isCancel = false) {
        const tx = bsv_1.Tx.fromHex(rawtx);
        const vout = tx.txOuts.findIndex(o => o.script.toHex().match(order_lock_regex_1.default));
        if (vout === -1)
            return;
        const lockTx = bsv_1.Tx.fromHex(lockRawTx);
        const preimage = tx.sighashPreimage(bsv_1.Sig.SIGHASH_FORKID | (isCancel ? bsv_1.Sig.SIGHASH_NONE : (bsv_1.Sig.SIGHASH_SINGLE | bsv_1.Sig.SIGHASH_ANYONECANPAY)), 0, lockTx.txOuts[vout].script, lockTx.txOuts[vout].valueBn, bsv_1.Tx.SCRIPT_ENABLE_SIGHASH_FORKID);
        let asm;
        if (isCancel) {
            const bw = new bsv_1.Bw();
            tx.txIns.forEach((txIn, i) => {
                if (i < 2)
                    return;
                bw.write(txIn.txHashBuf); // outpoint (1/2)
                bw.writeUInt32LE(txIn.txOutNum); // outpoint (2/2)  
            });
            const prevouts = bw.toBuffer();
            asm = `${preimage.toString('hex')} ${prevouts.toString('hex')} OP_TRUE`;
        }
        else {
            asm = `${preimage.toString('hex')} 00 OP_FALSE`;
        }
        tx.txIns[2].setScript(bsv_1.Script.fromAsmString(asm));
        return tx.toHex();
    }
}
exports.FyxOwner = FyxOwner;
//# sourceMappingURL=fyx-owner.js.map