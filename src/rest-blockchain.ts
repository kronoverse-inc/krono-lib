import { IUTXO } from './interfaces';
import { SignedMessage } from './signed-message';

import {HttpError} from './http-error';

export class RestBlockchain {
    private requests = new Map<string, Promise<any>>();
    constructor(
        private fetchLib,
        private apiUrl: string,
        public network: string,
        public cache: {get: (key: string) => any, set: (key: string, value: any) => any} = new Map<string, any>(),
        private debug = false
    ) { }

    get bsvNetwork(): string {
        switch (this.network) {
            case 'stn':
                return 'stn';
            case 'main':
                return 'mainnet';
            default:
                return 'testnet';
        }
    }

    async broadcast(rawtx) {
        if(this.debug) console.log('BROADCAST:', rawtx);
        const resp = await this.fetchLib(`${this.apiUrl}/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawtx })
        });
        if (!resp.ok) throw new HttpError(resp.status, await resp.text());
        const txid = await resp.text();
        this.debug && console.log('Broadcast:', txid);
        await this.cache.set(`tx://${txid}`, rawtx);
        return txid;
    }

    async populateInputs(tx) {
        await Promise.all(tx.inputs.map(async input => {
            const outTx = await this.fetch(input.prevTxId.toString('hex'));
            input.output = outTx.outputs[input.outputIndex];
        }));
    }

    async fetch(txid: string) {
        if(this.debug) console.log('FETCH:', txid);
        let rawtx = await this.cache.get(`tx://${txid}`);
        if (rawtx) return rawtx;
        if (!this.requests.has(txid)) {
            const request = Promise.resolve().then(async () => {
                const resp = await this.fetchLib(`${this.apiUrl}/tx/${txid}`);
                if (!resp.ok)
                    throw new HttpError(resp.status, await resp.text());
                rawtx = await resp.text();
                await this.cache.set(`tx://${txid}`, rawtx);
                this.requests.delete(txid);
                return rawtx;
            });
            this.requests.set(txid, request);
        }
        return this.requests.get(txid);
    };

    async time(txid: string): Promise<number> {
        return Date.now();
        // const resp = await this.fetchLib(`${this.apiUrl}/tx/${txid}`);
        // if (resp.ok) {
        //     const {time} = await resp.json();
        //     await this.cache.set(`tx://${txid}`, rawtx);
        //     break;
        // }
    }

    async spends(txid: string, vout: number): Promise<string | null> {
        if(this.debug) console.log('SPENDS:', txid, vout);
        const cacheKey = `spend://${txid}_${vout}`;
        let spend = await this.cache.get(cacheKey);
        if (spend) return spend;
        if (!this.requests.has(cacheKey)) {
            const request = (async () => {
                const resp = await this.fetchLib(`${this.apiUrl}/spends/${txid}_o${vout}`);
                if (!resp.ok) throw new HttpError(resp.status, await resp.text());
                spend = (await resp.text()) || null;
                if(spend) await this.cache.set(cacheKey, spend);
                this.requests.delete(cacheKey);
                return spend;
            })();
            this.requests.set(cacheKey, request);
        }
        return this.requests.get(cacheKey);
    }

    async utxos(script: string): Promise<IUTXO[]> {
        if(this.debug) console.log('UTXOS:', script);
        const resp = await this.fetchLib(`${this.apiUrl}/utxos/${script}`);
        if (!resp.ok) throw new Error(await resp.text());
        return resp.json();
    };

    async jigIndex(address) {
        const resp = await this.fetchLib(`${this.apiUrl}/jigs/address/${address}`);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        return resp.json();
    }

    async loadJigData(loc: string, unspent: boolean) {
        const resp = await this.fetchLib(`${this.apiUrl}/jigs/${loc}${unspent && '?unspent'}`);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        return resp.json();
    }

    async jigQuery(query: any, limit = 10) {
        const resp = await this.fetchLib(`${this.apiUrl}/jigs/search?limit=${limit}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        });
        if (!resp.ok) throw new HttpError(resp.status, await resp.text());
        return resp.json();
    }

    async fund(address: string, satoshis?: number) {
        const resp = await this.fetchLib(`${this.apiUrl}/fund/${address}${satoshis ? `?satoshis=${satoshis}` : ''}`);
        if (!resp.ok) throw new HttpError(resp.status, await resp.text());
        return resp.text();
    }

    async loadMessage(messageId): Promise<SignedMessage> {
        const resp = await this.fetchLib(`${this.apiUrl}/messages/${messageId}`);
        if (!resp.ok) throw new HttpError(resp.status, await resp.text());
        return new SignedMessage(await resp.json());
    }

    async sendMessage(message: SignedMessage, postTo?: string): Promise<void> {
        const url = postTo || `${this.apiUrl}/messages`;
        console.log('Post TO:', url);
        const resp = await this.fetchLib(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(message)
        });
        if (!resp.ok) throw new HttpError(resp.status, await resp.text());
        return resp.json();
    }
}
