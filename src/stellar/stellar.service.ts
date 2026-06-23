import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { TipsService } from '../tips/tips.service';
import {
  Tip,
  TipAsset,
  TipWithdrawalStatus,
} from '../entities/tip.entity';
import {
  REGISTER_EVENT,
  StellarContractEventPayload,
  TIP_EVENT,
  WITHDRAWAL_EVENT,
  normalizeContractEventTopic,
} from './contract/events';

@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);
  private static readonly MAX_EVENT_AGE_MS = 5 * 60 * 1000;
  private server: Horizon.Server;
  private network: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Tip)
    private readonly tipsRepository: Repository<Tip>,
    private readonly tipsService: TipsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    const serverUrl =
      this.configService.get<string>('STELLAR_NODE_URL') ||
      'https://horizon-testnet.stellar.org';
    this.network =
      this.configService.get<string>('STELLAR_NETWORK') || 'TESTNET';
    this.server = new Horizon.Server(serverUrl);
    this.logger.log(
      `Stellar SDK initialized — connected to ${this.network} at ${serverUrl}`,
    );
  }

  async verifyPayment(transactionHash: string): Promise<{
    verified: boolean;
    from?: string;
    to?: string;
    amount?: number;
    asset?: string;
  }> {
    try {
      const tx = await this.server
        .transactions()
        .transaction(transactionHash)
        .call();

      if (!tx) {
        return { verified: false };
      }

      // Access SDK response fields with type assertion (external Stellar SDK)
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      const txAny = tx as any;
      const operation = txAny.operations?.[0];
      const from: string = txAny.source_account || '';
      let to = '';
      let amount = 0;
      let asset = 'XLM';

      if (operation) {
        to = operation.to || operation.destination || '';
        amount = parseFloat(
          operation.amount || operation.starting_balance || '0',
        );
        if (operation.asset_type === 'credit_alphanum4') {
          asset = `${operation.asset_code}:${operation.asset_issuer}`;
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

      return {
        verified: true,
        from,
        to,
        amount,
        asset,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to verify transaction ${transactionHash}: ${message}`,
      );
      return { verified: false };
    }
  }

  async getAccountBalance(walletAddress: string): Promise<{
    balances: Array<{ asset: string; balance: string }>;
  }> {
    try {
      const account = await this.server.loadAccount(walletAddress);
      const balances = account.balances.map((b) => {
        if (b.asset_type === 'native') {
          return { asset: 'XLM', balance: b.balance };
        }
        // Access credit/issuer fields with type assertion for Stellar SDK union type
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
        const credit = b as any;
        return {
          asset: `${credit.asset_code}:${credit.asset_issuer}`,
          balance: credit.balance,
        };
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      });

      return { balances };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch balance for ${walletAddress}: ${message}`,
      );
      return { balances: [] };
    }
  }

  async getAccountInfo(walletAddress: string): Promise<{
    address: string;
    exists: boolean;
    sequenceNumber: string | null;
    subentryCount: number;
    network: string;
  }> {
    try {
      const account = await this.server.loadAccount(walletAddress);
      // Access SDK response fields with type assertion (external Stellar SDK)
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const accountAny = account as any;
      return {
        address: walletAddress,
        exists: true,
        sequenceNumber: account.sequenceNumber(),
        subentryCount: accountAny.subentry_count || 0,
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
        network: this.network,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch account info for ${walletAddress}: ${message}`,
      );
      return {
        address: walletAddress,
        exists: false,
        sequenceNumber: null,
        subentryCount: 0,
        network: this.network,
      };
    }
  }

  async handleContractWebhook(
    payload: StellarContractEventPayload,
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ accepted: true; duplicate: boolean }> {
    this.assertWebhookSignature(rawBody, signature);
    this.assertEventIsFresh(payload);

    if (await this.isDuplicateTransaction(payload.transactionHash)) {
      return { accepted: true, duplicate: true };
    }

    const topic = normalizeContractEventTopic(payload.topic);

    switch (topic) {
      case TIP_EVENT:
        await this.persistTipEvent(payload);
        break;
      case WITHDRAWAL_EVENT:
        await this.persistWithdrawalEvent(payload);
        break;
      case REGISTER_EVENT:
        this.logger.log(
          `Received register event for transaction ${payload.transactionHash}`,
        );
        break;
      default:
        throw new BadRequestException('Unsupported contract event topic');
    }

    return { accepted: true, duplicate: false };
  }

  private assertWebhookSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): void {
    const secret = this.configService.get<string>('STELLAR_WEBHOOK_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Webhook secret is not configured');
    }

    if (!rawBody || rawBody.length === 0 || !signature) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private assertEventIsFresh(payload: StellarContractEventPayload): void {
    const eventTimestamp = new Date(payload.timestamp);

    if (Number.isNaN(eventTimestamp.getTime())) {
      throw new BadRequestException('Invalid event timestamp');
    }

    const ageMs = Math.abs(Date.now() - eventTimestamp.getTime());
    if (ageMs > StellarService.MAX_EVENT_AGE_MS) {
      throw new UnauthorizedException('Webhook event is outside replay window');
    }
  }

  private async isDuplicateTransaction(transactionHash: string): Promise<boolean> {
    if (!transactionHash) {
      throw new BadRequestException('transactionHash is required');
    }

    const existingTip = await this.tipsRepository.findOne({
      where: [
        { transactionHash },
        { withdrawalTransactionHash: transactionHash },
      ],
    });

    return Boolean(existingTip);
  }

  private async persistTipEvent(
    payload: StellarContractEventPayload,
  ): Promise<void> {
    const data = payload.data || {};
    const receiverWallet = this.readString(data.receiverWallet);
    const senderWallet = this.readString(data.senderWallet);
    const asset = this.normalizeAsset(data.asset);
    const amount = this.readAmount(data.amount);
    const message = this.readOptionalString(data.message);
    const assetIssuer = this.readOptionalString(data.assetIssuer);

    const tip = await this.tipsService.createTip({
      receiverWallet,
      senderWallet,
      amount,
      message: message || undefined,
      asset,
      assetIssuer: assetIssuer || undefined,
      transactionHash: payload.transactionHash,
    });

    await this.notificationsService.notifyTipReceived(
      tip.creatorId,
      tip.senderWallet,
      tip.amount,
      tip.asset,
    );
  }

  private async persistWithdrawalEvent(
    payload: StellarContractEventPayload,
  ): Promise<void> {
    const data = payload.data || {};
    const linkedTipId = this.readOptionalString(data.tipId);
    const linkedTipTransactionHash = this.readOptionalString(
      data.tipTransactionHash,
    );

    if (!linkedTipId && !linkedTipTransactionHash) {
      this.logger.warn(
        `Withdrawal event ${payload.transactionHash} has no linked tip reference`,
      );
      return;
    }

    const tip = await this.tipsRepository.findOne({
      where: linkedTipId
        ? { id: linkedTipId }
        : { transactionHash: linkedTipTransactionHash! },
    });

    if (!tip) {
      this.logger.warn(
        `No tip found for withdrawal event ${payload.transactionHash}`,
      );
      return;
    }

    tip.withdrawalStatus = this.normalizeWithdrawalStatus(data.status);
    tip.withdrawalTransactionHash = payload.transactionHash;
    await this.tipsRepository.save(tip);
  }

  private readString(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Webhook payload is missing required fields');
    }

    return value.trim();
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private readAmount(value: unknown): number {
    const amount =
      typeof value === 'number' ? value : Number(this.readString(value));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Webhook payload has an invalid amount');
    }

    return amount;
  }

  private normalizeAsset(value: unknown): TipAsset {
    const rawAsset =
      this.readOptionalString(value)?.toUpperCase() || TipAsset.XLM;

    if (rawAsset === String(TipAsset.XLM) || rawAsset === String(TipAsset.USDC)) {
      return rawAsset as TipAsset;
    }

    throw new BadRequestException('Unsupported webhook asset');
  }

  private normalizeWithdrawalStatus(value: unknown): TipWithdrawalStatus {
    const status = this.readOptionalString(value)?.toLowerCase();

    switch (status) {
      case String(TipWithdrawalStatus.PENDING):
        return TipWithdrawalStatus.PENDING;
      case String(TipWithdrawalStatus.FAILED):
        return TipWithdrawalStatus.FAILED;
      case String(TipWithdrawalStatus.COMPLETED):
      case null:
        return TipWithdrawalStatus.COMPLETED;
      default:
        throw new BadRequestException('Unsupported withdrawal status');
    }
  }
}
