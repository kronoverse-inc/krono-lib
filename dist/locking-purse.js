"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockingPurse = void 0;
const bsv_1 = require("bsv");
class LockingPurse {
    constructor(keyPair, blockchain, redis, changeAddress, recycleThreashold = 50000) {
        this.keyPair = keyPair;
        this.blockchain = blockchain;
        this.redis = redis;
        this.changeAddress = changeAddress;
        this.recycleThreashold = recycleThreashold;
        this.address = bsv_1.Address.fromPrivKey(keyPair.privKey);
        this.scripthash = bsv_1.Hash.sha256(this.address.toTxOutScript().toBuffer()).toString('hex');
    }
    async pay(rawtx, parents) {
        const tx = bsv_1.Tx.fromHex(rawtx);
        let fee = Math.ceil(rawtx.length / 4);
        let totalIn = parents.reduce((a, { satoshis }) => a + satoshis, 0);
        const totalOut = tx.txOuts.reduce((a, { valueBn }) => a + valueBn.toNumber(), 0);
        if (totalIn <= totalOut + fee)
            return rawtx;
        fee += 160;
        const utxos = await this.blockchain.utxos(this.scripthash, 50);
        let utxo;
        console.log('UTXOS:', utxos.length);
        for (const u of utxos) {
            const lockKey = `lock:${u.txid}_o${u.vout}`;
            if (await this.redis.setnx(lockKey, Date.now())) {
                await this.redis.expire(lockKey, 60);
                console.log('UTXO Selected:', lockKey, utxo);
                utxo = u;
                break;
            }
            else {
                console.log('UTXO locked:', lockKey);
            }
        }
        if (!utxo)
            throw new Error('No UTXOs found');
        tx.addTxIn(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, bsv_1.Script.fromString('OP_0 OP_0'), bsv_1.TxIn.SEQUENCE_FINAL);
        totalIn += utxo.satoshis;
        const change = totalIn - totalOut - fee;
        const changeScript = (!this.changeAddress || change > this.recycleThreashold) ?
            this.address.toTxOutScript() :
            bsv_1.Address.fromString(this.changeAddress).toTxOutScript();
        tx.addTxOut(bsv_1.Bn(change), changeScript);
        const sig = await tx.asyncSign(this.keyPair, undefined, tx.txIns.length - 1, changeScript, bsv_1.Bn(change));
        const sigScript = new bsv_1.Script()
            .writeBuffer(sig.toTxFormat())
            .writeBuffer(this.keyPair.pubKey.toBuffer());
        tx.txIns[tx.txIns.length - 1].setScript(sigScript);
        return tx.toHex();
    }
}
exports.LockingPurse = LockingPurse;
//# sourceMappingURL=locking-purse.js.map