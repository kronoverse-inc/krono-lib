import { IJigQuery, IUTXO } from './interfaces';
import { SignedMessage } from './signed-message';
export declare class RestBlockchain {
    protected fetchLib: any;
    protected apiUrl: string;
    network: string;
    cache: {
        get: (key: string) => any;
        set: (key: string, value: any) => any;
    };
    protected debug: boolean;
    private requests;
    constructor(fetchLib: any, apiUrl: string, network: string, cache?: {
        get: (key: string) => any;
        set: (key: string, value: any) => any;
    }, debug?: boolean);
    get bsvNetwork(): string;
    broadcast(rawtx: any): Promise<any>;
    populateInputs(tx: any): Promise<void>;
    fetch(txid: string): Promise<any>;
    time(txid: string): Promise<number>;
    spends(txid: string, vout: number): Promise<string | null>;
    utxos(script: string): Promise<IUTXO[]>;
    jigIndex(address: string, query: IJigQuery, type?: 'address' | 'script'): Promise<any>;
    loadJigData(loc: string, unspent: boolean): Promise<any>;
    jigQuery(query: any, limit?: number): Promise<any>;
    fund(address: string, satoshis?: number): Promise<any>;
    loadMessage(messageId: any): Promise<SignedMessage>;
    sendMessage(message: SignedMessage, postTo?: string): Promise<any>;
}
