import fetch from 'node-fetch';

import { Observable } from 'rxjs';
import { map, scan } from 'rxjs/operators';

import { updateOrderbook } from '../../../helpers';
import { Orderbook } from '../../exchange-types';
import { CoinbaseWebsocket } from '../coinbase-websocket';
import { getProductId } from '../coinbase-common';
import { WebsocketRequest } from '../coinbase-common.types';

import { CoinbaseWsOrderbookSnapshot, CoinbaseWsOrderbookUpdate, CoinbaseRestOrderbook } from './internal/types';
import {
  adaptCoinbaseWsOrderbookSnapshot,
  adaptCoinbaseWsOrderbookUpdate,
  getOrderbookUrl,
  adaptCoinbaseRestOrderbook,
} from './internal/functions';

export class CoinbaseOrderbook {
  private readonly corsProxy: string;
  private readonly coinbaseWebsocket: CoinbaseWebsocket;
  private readonly pairOderbookStreamMap: { [pair: string]: Observable<Orderbook> } = {};

  constructor(corsProxy: string = '', coinbaseWebsocket?: CoinbaseWebsocket) {
    this.corsProxy = corsProxy;
    this.coinbaseWebsocket = coinbaseWebsocket || new CoinbaseWebsocket();
  }

  async fetchOrderbook(pair: string): Promise<Orderbook> {
    const originUrl = getOrderbookUrl(pair);
    const url = this.corsProxy ? this.corsProxy + originUrl : originUrl;

    const orderbook: CoinbaseRestOrderbook = await fetch(url).then(res => res.json());

    return adaptCoinbaseRestOrderbook(orderbook);
  }

  orderbook$(pair: string): Observable<Orderbook> {
    if (!this.pairOderbookStreamMap[pair]) {
      this.pairOderbookStreamMap[pair] = this.startOrderbook$(pair);
    }

    return this.pairOderbookStreamMap[pair];
  }

  stopOrderbook(pair: string): void {
    const request: WebsocketRequest = {
      type: 'unsubscribe',
      channels: ['level2'],
      product_ids: [getProductId(pair)],
    };

    this.coinbaseWebsocket.unsubscribe(request);
    delete this.pairOderbookStreamMap[pair];
  }

  private startOrderbook$(pair: string): Observable<Orderbook> {
    const request: WebsocketRequest = {
      type: 'subscribe',
      channels: ['level2'],
      product_ids: [getProductId(pair)],
    };

    return this.coinbaseWebsocket.subscribe<CoinbaseWsOrderbookSnapshot | CoinbaseWsOrderbookUpdate>(request).pipe(
      map((snapshotOrUpdate) => {
        if (snapshotOrUpdate.type === 'snapshot') {
          return adaptCoinbaseWsOrderbookSnapshot(snapshotOrUpdate);
        } else {
          return adaptCoinbaseWsOrderbookUpdate(snapshotOrUpdate);
        }
      }),
      scan<Orderbook>(updateOrderbook),
    );
  }
}
