import { Tx } from 'bsv';
import { IUTXO } from './interfaces';
import { SignedMessage } from './signed-message';
export declare class RestBlockchain {
    apiUrl: string;
    network: string;
    cache: {
        get: (key: string) => any;
        set: (key: string, value: any) => any;
    };
    protected debug: boolean;
    private requests;
    constructor(apiUrl: string, network: string, cache?: {
        get: (key: string) => any;
        set: (key: string, value: any) => any;
    }, debug?: boolean);
    get bsvNetwork(): string;
    broadcast(rawtx: any): Promise<any>;
    retrieveOutputs(tx: Tx): Promise<[unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown]>;
    fetch(txid: string): Promise<any>;
    time(txid: string): Promise<number>;
    spends(txid: string, vout: number): Promise<string | null>;
    utxos(script: string, limit?: number): Promise<IUTXO[]>;
    utxoCount(script: string): Promise<number>;
    loadParents(rawtx: string): Promise<{
        script: string;
        satoshis: number;
    }[]>;
    applyPayments(rawtx: any, payments: {
        from: string;
        amount: number;
    }[], payer?: string, changeSplitSats?: number): Promise<any>;
    loadJigData(loc: string, unspent?: boolean): Promise<any>;
    jigQuery(query: any): Promise<any>;
    fund(address: string, satoshis?: number): Promise<any>;
    balance(script: any, scriptType?: string): Promise<number>;
    sendMessage(message: SignedMessage, postTo?: string): Promise<any>;
}
