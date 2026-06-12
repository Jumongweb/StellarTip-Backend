import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly apiVersion = '0.1.0';

  getHello(): string {
    return `StellarTip API v${this.apiVersion} — Decentralized micro-tipping on Stellar`;
  }

  getVersion(): string {
    return this.apiVersion;
  }
}
