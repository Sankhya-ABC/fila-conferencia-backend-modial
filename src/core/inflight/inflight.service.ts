import { Injectable } from '@nestjs/common';

/**
 * Deduplicação de chamadas em voo.
 * Se dois requests pedem o mesmo dado ao mesmo tempo, apenas um vai ao Sankhya.
 * Os demais esperam o resultado do primeiro.
 */
@Injectable()
export class InflightService {
  private readonly pending = new Map<string, Promise<any>>();

  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.pending.has(key)) {
      return this.pending.get(key) as Promise<T>;
    }

    const promise = fn().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
